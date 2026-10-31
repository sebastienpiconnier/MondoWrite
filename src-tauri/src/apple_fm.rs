//! Apple Foundation Models (iOS 26, macOS 26 et après) : le modèle d'Apple Intelligence sur l'appareil, sixième
//! service d'IA de MondoWrite. Gratuit, sans clé, hors ligne : la consigne et le texte ne quittent pas l'appareil.
//!
//! Le modèle n'a qu'une API Swift : le pont `apple/MondoWriteFM` (Swift, compilé par build.rs) expose trois
//! fonctions C. Sans le pont (Windows, Linux, Android, Mac Intel, SDK sans le framework), les commandes répondent
//! « non pris en charge » et l'app n'affiche pas le service.

use serde::Serialize;

/// Disponibilité du modèle, en clair pour l'app (src/ai/apple.ts, `readAvailability`).
pub fn availability_name(code: i32) -> &'static str {
  match code {
    0 => "available",
    1 => "notEnabled",
    2 => "notEligible",
    3 => "notReady",
    4 => "osTooOld",
    5 => "unsupported",
    _ => "other",
  }
}

/// Erreur d'une réponse, lue par l'app (`readFmError`) : `code` fixe, `message` du système (en anglais le plus souvent).
#[derive(Debug, Serialize)]
pub struct FmError {
  pub code: &'static str,
  pub message: String,
}

impl FmError {
  pub fn new(code: &'static str) -> Self {
    FmError { code, message: String::new() }
  }
}

/// Code de réponse du pont (voir FoundationModelsBridge.swift) → code de l'app.
#[cfg_attr(not(any(mondowrite_fm, test)), allow(dead_code))]
pub fn error_name(code: i32) -> &'static str {
  match code {
    1 => "cancelled",
    2 => "context",
    3 => "guardrail",
    4 => "language",
    5 => "unavailable",
    6 => "busy",
    _ => "other",
  }
}

/// Chaîne C sans octet nul (une chaîne de JavaScript peut en contenir un).
#[cfg_attr(not(any(mondowrite_fm, test)), allow(dead_code))]
pub fn c_string(text: &str) -> std::ffi::CString {
  std::ffi::CString::new(text.replace('\0', " ")).unwrap_or_default()
}

#[cfg(mondowrite_fm)]
mod bridge {
  use super::{error_name, FmError};
  use std::collections::HashMap;
  use std::ffi::{c_char, CStr};
  use std::sync::mpsc::{channel, Sender};
  use std::sync::{Mutex, OnceLock};

  type Callback = extern "C" fn(u64, i32, *const c_char);

  unsafe extern "C" {
    fn mw_fm_availability() -> i32;
    fn mw_fm_complete(id: u64, system: *const c_char, user: *const c_char, max_tokens: i32, callback: Callback);
    fn mw_fm_cancel(id: u64);
  }

  type Reply = Result<String, FmError>;

  /// Réponses attendues, par identifiant de demande (choisi par l'app).
  fn pending() -> &'static Mutex<HashMap<u64, Sender<Reply>>> {
    static PENDING: OnceLock<Mutex<HashMap<u64, Sender<Reply>>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
  }

  /// Appelé par Swift depuis un autre fil ; `text` n'est valable que pendant l'appel.
  extern "C" fn on_reply(id: u64, code: i32, text: *const c_char) {
    let text = if text.is_null() { String::new() } else { unsafe { CStr::from_ptr(text) }.to_string_lossy().into_owned() };
    let reply = if code == 0 { Ok(text) } else { Err(FmError { code: error_name(code), message: text }) };
    if let Some(tx) = pending().lock().ok().and_then(|mut p| p.remove(&id)) {
      let _ = tx.send(reply);
    }
  }

  pub fn availability() -> i32 {
    unsafe { mw_fm_availability() }
  }

  pub async fn complete(id: u64, system: String, user: String, max_tokens: u32) -> Reply {
    let (tx, rx) = channel();
    {
      let mut map = pending().lock().map_err(|_| FmError::new("other"))?;
      // Un identifiant déjà en attente : on ne le remplace pas (sa réponse irait à la mauvaise demande).
      if map.contains_key(&id) {
        return Err(FmError::new("busy"));
      }
      map.insert(id, tx);
    }
    let system = super::c_string(&system);
    let user = super::c_string(&user);
    let max_tokens = i32::try_from(max_tokens).unwrap_or(i32::MAX);
    unsafe { mw_fm_complete(id, system.as_ptr(), user.as_ptr(), max_tokens, on_reply) };
    // La réponse arrive sur un fil de Swift : on l'attend hors du fil des commandes.
    tauri::async_runtime::spawn_blocking(move || rx.recv().unwrap_or_else(|_| Err(FmError::new("other"))))
      .await
      .unwrap_or_else(|_| Err(FmError::new("other")))
  }

  pub fn cancel(id: u64) {
    unsafe { mw_fm_cancel(id) }
  }
}

/// Le modèle est-il utilisable ? « available », « notEnabled » (Apple Intelligence désactivée), « notEligible »
/// (appareil non pris en charge), « notReady » (modèle en cours de téléchargement), « osTooOld » (avant iOS 26 ou
/// macOS 26), « unsupported » (pas de pont dans cette version : autre système, Mac Intel, SDK trop ancien), « other ».
#[tauri::command]
pub async fn fm_availability() -> &'static str {
  #[cfg(mondowrite_fm)]
  {
    availability_name(bridge::availability())
  }
  #[cfg(not(mondowrite_fm))]
  {
    availability_name(5)
  }
}

/// Une réponse du modèle : consigne (`system`), message (`user`), plafond de la réponse en jetons. `id` sert à
/// l'annulation (`fm_cancel`). Erreur : `{ code, message }` (« cancelled », « context », « guardrail », « language »,
/// « unavailable », « busy », « other »).
#[tauri::command]
pub async fn fm_complete(id: u64, system: String, user: String, max_tokens: u32) -> Result<String, FmError> {
  #[cfg(mondowrite_fm)]
  {
    bridge::complete(id, system, user, max_tokens).await
  }
  #[cfg(not(mondowrite_fm))]
  {
    let _ = (id, system, user, max_tokens);
    Err(FmError::new("unavailable"))
  }
}

/// Annule la réponse `id` (bouton « Annuler » de l'app) ; sans effet si elle est déjà arrivée.
#[tauri::command]
pub async fn fm_cancel(id: u64) {
  #[cfg(mondowrite_fm)]
  bridge::cancel(id);
  #[cfg(not(mondowrite_fm))]
  let _ = id;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn codes_en_clair() {
    assert_eq!(availability_name(0), "available");
    assert_eq!(availability_name(1), "notEnabled");
    assert_eq!(availability_name(5), "unsupported");
    assert_eq!(availability_name(42), "other");
    assert_eq!(error_name(1), "cancelled");
    assert_eq!(error_name(3), "guardrail");
    assert_eq!(error_name(9), "other");
  }

  #[test]
  fn chaine_c_sans_nul() {
    assert_eq!(c_string("a\0b").to_str().unwrap(), "a b");
  }
}
