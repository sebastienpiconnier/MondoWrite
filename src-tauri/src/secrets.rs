//! Clés de l'auteur (services d'IA, photos) dans le trousseau du système (#30) : Trousseau d'accès sur Mac,
//! trousseau protégé sur iPhone et iPad, gestionnaire d'identifiants sous Windows, Secret Service sous Linux.
//!
//! Une seule entrée, qui porte toutes les clés en JSON (le front l'écrit et la relit, secrets.ts) : une seule
//! autorisation à donner sur Mac, et aucun nom choisi par la page (rien d'autre du trousseau n'est atteignable).
//! Android et un Linux sans Secret Service répondent par une erreur : le front garde alors les clés comme avant,
//! dans les réglages de l'appareil.

/// Service et compte de l'entrée. Le service est l'identifiant de l'app, qui ne change jamais (voir CLAUDE.md).
#[cfg(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux"))]
const SERVICE: &str = "app.cosmos.ecriture";
#[cfg(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux"))]
const ACCOUNT: &str = "api-keys";

/// Taille maximale du contenu (quelques clés de 200 caractères au plus) : rien d'autre ne doit y entrer.
const MAX_LEN: usize = 16 * 1024;

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux"))]
fn entry() -> Result<keyring::Entry, String> {
  keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// Lit l'entrée : Some(texte), None si elle n'existe pas encore, Err si le trousseau ne répond pas.
fn get() -> Result<Option<String>, String> {
  #[cfg(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux"))]
  {
    match entry()?.get_password() {
      Ok(text) => Ok(Some(text)),
      Err(keyring::Error::NoEntry) => Ok(None),
      Err(e) => Err(e.to_string()),
    }
  }
  #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux")))]
  {
    Err("unsupported".into())
  }
}

fn set(text: &str) -> Result<(), String> {
  if text.len() > MAX_LEN {
    return Err("too long".into());
  }
  #[cfg(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux"))]
  {
    entry()?.set_password(text).map_err(|e| e.to_string())
  }
  #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux")))]
  {
    Err("unsupported".into())
  }
}

fn delete() -> Result<(), String> {
  #[cfg(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux"))]
  {
    match entry()?.delete_credential() {
      Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
      Err(e) => Err(e.to_string()),
    }
  }
  #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "windows", target_os = "linux")))]
  {
    Err("unsupported".into())
  }
}

// Le trousseau peut faire attendre (autorisation demandée sur Mac, D-Bus sous Linux) : hors du fil principal.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn secret_get() -> Result<Option<String>, String> {
  blocking(get).await
}

#[tauri::command]
pub async fn secret_set(value: String) -> Result<(), String> {
  blocking(move || set(&value)).await
}

#[tauri::command]
pub async fn secret_delete() -> Result<(), String> {
  blocking(delete).await
}
