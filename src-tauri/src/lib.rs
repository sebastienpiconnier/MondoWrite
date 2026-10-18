/// Conteneur iCloud de l'app (déclaré dans les droits iOS et dans Info.ios.plist).
#[cfg(target_os = "ios")]
const ICLOUD_CONTAINER: &str = "iCloud.app.cosmos.ecriture";

#[cfg(target_os = "ios")]
mod icloud {
  use objc2_foundation::{NSFileManager, NSString, NSURL};

  /// Chemin du conteneur iCloud, ou None si iCloud n'est pas disponible (session absente, droit non accordé).
  /// Appel bloquant : à faire hors du fil principal.
  #[allow(unused_unsafe)]
  pub fn container(id: &str) -> Option<String> {
    let manager = unsafe { NSFileManager::defaultManager() };
    let id = NSString::from_str(id);
    let url = unsafe { manager.URLForUbiquityContainerIdentifier(Some(&id)) }?;
    unsafe { url.path() }.map(|p| p.to_string())
  }

  /// Demande à iCloud de télécharger un fichier absent de l'appareil.
  #[allow(unused_unsafe)]
  pub fn download(path: &str) {
    let manager = unsafe { NSFileManager::defaultManager() };
    let url = unsafe { NSURL::fileURLWithPath(&NSString::from_str(path)) };
    let _ = unsafe { manager.startDownloadingUbiquitousItemAtURL_error(&url) };
  }
}

/// Dossier Documents du conteneur iCloud (créé au besoin) et autorisé en lecture/écriture, ou None.
#[tauri::command]
async fn icloud_container(app: tauri::AppHandle) -> Option<String> {
  #[cfg(target_os = "ios")]
  {
    use tauri_plugin_fs::FsExt;
    let docs = format!("{}/Documents", icloud::container(ICLOUD_CONTAINER)?);
    std::fs::create_dir_all(&docs).ok()?;
    app.fs_scope().allow_directory(&docs, true).ok()?;
    Some(docs)
  }
  #[cfg(not(target_os = "ios"))]
  {
    let _ = app;
    None
  }
}

/// Lance le téléchargement des fichiers iCloud pas encore présents sous `dir` (repères « .nom.icloud »)
/// et renvoie combien restent à venir.
#[tauri::command]
async fn icloud_download(dir: String) -> usize {
  fn walk(dir: &std::path::Path, pending: &mut usize) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
      let path = entry.path();
      let name = entry.file_name().to_string_lossy().to_string();
      if path.is_dir() {
        walk(&path, pending);
      } else if let Some(real) = name.strip_prefix('.').and_then(|n| n.strip_suffix(".icloud")) {
        *pending += 1;
        #[cfg(target_os = "ios")]
        icloud::download(&dir.join(real).to_string_lossy());
        #[cfg(not(target_os = "ios"))]
        let _ = real;
      }
    }
  }
  let mut pending = 0;
  walk(std::path::Path::new(&dir), &mut pending);
  pending
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![icloud_container, icloud_download])
    // Lecture/écriture du dossier projet (cosmos.json + cartes/*.md)
    .plugin(tauri_plugin_fs::init())
    // Sélecteur de dossier natif
    .plugin(tauri_plugin_dialog::init())
    // Le dossier choisi par l'auteur reste autorisé d'un lancement à l'autre. Sans cela, un projet
    // hors du dossier personnel (autre disque, OneDrive déplacé) est refusé au redémarrage.
    // À déclarer après le plugin fs.
    .plugin(tauri_plugin_persisted_scope::init())
    // Appels aux services d'IA (Claude, OpenAI, Ollama, LM Studio…) depuis le système, sans CORS :
    // un serveur local répond sans avoir à autoriser l'origine de l'app.
    .plugin(tauri_plugin_http::init())
    // Ouvrir l'adresse d'une source dans le navigateur du système.
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      // Mises à jour (ordinateur) : le plugin n'est branché que si l'app a été construite avec la clé
      // publique de signature (secret TAURI_UPDATER_PUBKEY de la CI). Sans elle, l'app vérifie seulement
      // la dernière version sur GitHub et propose sa page de téléchargement.
      #[cfg(desktop)]
      {
        let has_key = app
          .config()
          .plugins
          .0
          .get("updater")
          .and_then(|u| u.get("pubkey"))
          .and_then(|k| k.as_str())
          .is_some_and(|k| !k.trim().is_empty());
        if has_key {
          app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
        }
        // Redémarrer après l'installation d'une mise à jour.
        app.handle().plugin(tauri_plugin_process::init())?;
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("erreur au lancement de MondoWrite");
}
