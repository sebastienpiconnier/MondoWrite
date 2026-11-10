// Polices installées sur l'ordinateur (discussion #61) : la page du Manuscrit peut prendre n'importe laquelle.
// Seulement des noms de familles ; rien n'est chargé dans l'app (le WebView affiche la police lui-même).

/// Noms des familles de polices de l'ordinateur, triés et sans doublon. Lus à la demande (une demi-seconde).
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub async fn system_fonts() -> Result<Vec<String>, String> {
  tauri::async_runtime::spawn_blocking(|| {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    let mut names: Vec<String> = db
      .faces()
      .flat_map(|face| face.families.iter().map(|(name, _)| name.trim().to_string()))
      // Les familles cachées du système (« .SF NS ») ne s'emploient pas par leur nom.
      .filter(|name| !name.is_empty() && !name.starts_with('.'))
      .collect();
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup();
    names
  })
  .await
  .map_err(|e| e.to_string())
}

/// Mobile : pas de liste (le réglage n'y est pas proposé).
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub async fn system_fonts() -> Result<Vec<String>, String> {
  Err("not supported".into())
}
