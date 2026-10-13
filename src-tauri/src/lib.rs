#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
