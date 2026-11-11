//! Assistant externe par MCP (#62, docs/plan-mcp.md).
//!
//! Deux parties :
//! - le **serveur** : l'exécutable de MondoWrite lancé avec `--mcp` (main.rs, avant Tauri) sert le protocole MCP sur
//!   l'entrée et la sortie standard (JSON-RPC 2.0, un message par ligne). Lecture seule. Il ne lit jamais le dossier
//!   d'un projet : seulement les instantanés que l'app écrit dans son dossier privé (`mcp/<clé>.json`) ;
//! - les **commandes** de l'app : écrire ou retirer un instantané, connecter Claude Desktop.
//!
//! La sortie standard est réservée au protocole : jamais de `println!` ici (les erreurs vont sur stderr).

use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

/// Identifiant de l'app (tauri.conf.json) : le dossier privé est `<dossier des données>/app.cosmos.ecriture`.
const APP_ID: &str = "app.cosmos.ecriture";
/// Dossier des instantanés dans le dossier privé de l'app.
const MCP_DIR: &str = "mcp";
/// Nom du serveur dans la configuration des clients.
const SERVER_NAME: &str = "mondowrite";
/// Versions du protocole connues ; on répond avec celle du client si on la connaît, sinon la plus récente.
const PROTOCOLS: [&str; 4] = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
/// Au plus ce nombre de caractères rendus par un appel (ménage les limites d'usage de l'abonnement de l'auteur).
const MAX_CHARS: usize = 60_000;
/// Résultats de recherche rendus au plus.
const MAX_HITS: usize = 40;
/// Écriture : file des demandes faites à l'app ouverte (`queue/<clé>/req-<id>.json`, réponse `res-<id>.json`) et
/// battement de cœur de l'app (`live/<clé>`), écrit tant que le projet est ouvert en écriture.
const QUEUE_DIR: &str = "queue";
const LIVE_DIR: &str = "live";
/// Dernière lecture d'un projet par l'assistant (`seen/<clé>` : `{ "at": ms, "client": "…" }`), pour la pastille de
/// l'app (#62, lot 2). Écrite à chaque appel qui vise un projet, lecture comme écriture.
const SEEN_DIR: &str = "seen";
/// L'app est tenue pour ouverte si son battement date de moins de tant de millisecondes.
const LIVE_MS: u128 = 8_000;
/// Attente d'une réponse de l'app au plus.
const ANSWER_MS: u64 = 20_000;
/// Outils d'écriture : transmis à l'app ouverte, qui les applique avec ses règles (marque « IA », journal, annulation).
const WRITE_TOOLS: [&str; 35] = [
  "create_card", "update_card", "link_cards", "add_question", "create_scene", "set_scene_synopsis", "write_scene",
  "move_scene", "create_chapter", "rename_chapter", "move_chapter", "delete_chapter",
  "add_comment", "resolve_comment", "keep_version", "create_episode", "update_episode", "place_scene", "set_template",
  "merge_scenes", "split_scene", "trash_card", "unlink_cards", "rename_everywhere", "replace_text", "set_cover",
  "create_frame", "organize_canvas", "set_scene_fields",
  "update_link", "restore_card", "replace_passage", "add_character_question", "update_frame", "set_project",
];
/// Lectures faites par l'app ouverte (calculées sur le projet tel qu'il est à l'écran) : accès en lecture suffit.
const LIVE_TOOLS: [&str; 6] = ["todo_list", "read_comments", "project_stats", "review", "scene_versions", "read_journal"];

// ---------------------------------------------------------------------------------------------------------------
// Chemins
// ---------------------------------------------------------------------------------------------------------------

/// Dossier des données de l'utilisateur, comme `dirs::data_dir` (et donc `app_data_dir` de Tauri) :
/// `~/Library/Application Support` (Mac), `%APPDATA%` (Windows), `$XDG_DATA_HOME` ou `~/.local/share` (Linux).
fn data_dir() -> Option<PathBuf> {
  let env = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from);
  if cfg!(target_os = "macos") {
    env("HOME").map(|h| h.join("Library").join("Application Support"))
  } else if cfg!(target_os = "windows") {
    env("APPDATA")
  } else {
    env("XDG_DATA_HOME").filter(|p| p.is_absolute()).or_else(|| env("HOME").map(|h| h.join(".local").join("share")))
  }
}

/// Dossier des instantanés : `<dossier privé de l'app>/mcp`.
pub fn mcp_dir() -> Option<PathBuf> {
  data_dir().map(|d| d.join(APP_ID).join(MCP_DIR))
}

/// Clé d'un projet (`backupKey` de src/backups.ts) : jamais un chemin venu d'ailleurs.
pub fn is_key(key: &str) -> bool {
  key.len() == 15 && key.starts_with('p') && key[1..].bytes().all(|b| b.is_ascii_digit() || b.is_ascii_lowercase())
}

/// Écrit d'abord à côté puis renomme : un client qui lit au même moment ne voit jamais un fichier à moitié écrit.
fn write_safely(path: &Path, text: &str) -> std::io::Result<()> {
  let tmp = path.with_extension("json.mondowrite-tmp");
  std::fs::write(&tmp, text)?;
  std::fs::rename(&tmp, path).or_else(|_| {
    let _ = std::fs::remove_file(&tmp);
    std::fs::write(path, text)
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Commandes de l'app
// ---------------------------------------------------------------------------------------------------------------

/// Écrit l'instantané d'un projet ouvert à l'IA (`src/mcpSnapshot.ts`). Refusé si la clé ou le JSON ne vont pas.
#[tauri::command]
pub async fn mcp_publish(key: String, snapshot: String) -> Result<(), String> {
  if !is_key(&key) {
    return Err("clé refusée".into());
  }
  serde_json::from_str::<Value>(&snapshot).map_err(|_| "instantané illisible".to_string())?;
  let dir = mcp_dir().ok_or("dossier privé introuvable")?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  write_safely(&dir.join(format!("{key}.json")), &snapshot).map_err(|e| e.to_string())
}

/// Identifiant d'une demande : lettres minuscules, chiffres et tirets.
pub fn is_request_id(id: &str) -> bool {
  !id.is_empty() && id.len() <= 40 && id.bytes().all(|b| b.is_ascii_digit() || b.is_ascii_lowercase() || b == b'-')
}

fn now_ms() -> u128 {
  std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
}

/// Battement de cœur de l'app : le projet est ouvert, en écriture, et l'app prend les demandes.
#[tauri::command]
pub async fn mcp_live(key: String) -> Result<(), String> {
  if !is_key(&key) {
    return Err("clé refusée".into());
  }
  let dir = mcp_dir().ok_or("dossier privé introuvable")?.join(LIVE_DIR);
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  std::fs::write(dir.join(&key), now_ms().to_string()).map_err(|e| e.to_string())
}

/// Demandes en attente pour ce projet (contenu JSON), retirées de la file. Au plus 20 à la fois, les plus anciennes d'abord.
#[tauri::command]
pub async fn mcp_take(key: String) -> Result<Vec<String>, String> {
  if !is_key(&key) {
    return Err("clé refusée".into());
  }
  let Some(dir) = mcp_dir().map(|d| d.join(QUEUE_DIR).join(&key)) else { return Ok(Vec::new()) };
  let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(Vec::new()) };
  let mut names: Vec<String> = entries
    .flatten()
    .map(|e| e.file_name().to_string_lossy().to_string())
    .filter(|n| n.strip_prefix("req-").and_then(|r| r.strip_suffix(".json")).is_some_and(is_request_id))
    .collect();
  names.sort();
  let mut out = Vec::new();
  for name in names.into_iter().take(20) {
    let path = dir.join(&name);
    if let Ok(text) = std::fs::read_to_string(&path) {
      let _ = std::fs::remove_file(&path);
      out.push(text);
    }
  }
  Ok(out)
}

/// Réponse de l'app à une demande (JSON : `{ "ok": bool, "text": "…" }`).
#[tauri::command]
pub async fn mcp_answer(key: String, id: String, answer: String) -> Result<(), String> {
  if !is_key(&key) || !is_request_id(&id) {
    return Err("demande refusée".into());
  }
  serde_json::from_str::<Value>(&answer).map_err(|_| "réponse illisible".to_string())?;
  let dir = mcp_dir().ok_or("dossier privé introuvable")?.join(QUEUE_DIR).join(&key);
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  write_safely(&dir.join(format!("res-{id}.json")), &answer).map_err(|e| e.to_string())
}

/// Dernière lecture du projet par l'assistant (JSON écrit par le serveur), ou rien.
#[tauri::command]
pub async fn mcp_seen(key: String) -> Result<Option<String>, String> {
  if !is_key(&key) {
    return Err("clé refusée".into());
  }
  let Some(path) = mcp_dir().map(|d| d.join(SEEN_DIR).join(&key)) else { return Ok(None) };
  Ok(std::fs::read_to_string(path).ok().filter(|t| serde_json::from_str::<Value>(t).is_ok()))
}

/// Garde seulement les instantanés des projets donnés (accès retiré, assistant coupé : liste vide).
#[tauri::command]
pub async fn mcp_keep(keys: Vec<String>) -> Result<(), String> {
  let Some(dir) = mcp_dir() else { return Ok(()) };
  let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(()) };
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_string();
    let Some(key) = name.strip_suffix(".json") else { continue };
    if is_key(key) && !keys.iter().any(|k| k == key) {
      let _ = std::fs::remove_file(entry.path());
      let _ = std::fs::remove_file(dir.join(LIVE_DIR).join(key));
      let _ = std::fs::remove_file(dir.join(SEEN_DIR).join(key));
      let _ = std::fs::remove_dir_all(dir.join(QUEUE_DIR).join(key));
    }
  }
  Ok(())
}

/// Chemin de l'exécutable à donner au client. Linux : l'AppImage elle-même (`current_exe` est dans son montage
/// temporaire, qui change à chaque lancement).
fn exe_path() -> Option<String> {
  if let Some(appimage) = std::env::var_os("APPIMAGE").filter(|v| !v.is_empty()) {
    return Some(PathBuf::from(appimage).to_string_lossy().to_string());
  }
  std::env::current_exe().ok().map(|p| p.to_string_lossy().to_string())
}

/// Entrée du serveur pour la configuration d'un client MCP.
fn server_entry() -> Option<Value> {
  Some(json!({ "command": exe_path()?, "args": ["--mcp"] }))
}

/// Fichier de configuration de Claude Desktop sur ce système.
fn claude_config_path() -> Option<PathBuf> {
  let env = |k: &str| std::env::var_os(k).filter(|v| !v.is_empty()).map(PathBuf::from);
  if cfg!(target_os = "macos") {
    env("HOME").map(|h| h.join("Library/Application Support/Claude/claude_desktop_config.json"))
  } else if cfg!(target_os = "windows") {
    env("APPDATA").map(|a| a.join("Claude").join("claude_desktop_config.json"))
  } else {
    env("XDG_CONFIG_HOME").or_else(|| env("HOME").map(|h| h.join(".config"))).map(|c| c.join("Claude").join("claude_desktop_config.json"))
  }
}

/// Configuration à coller dans un autre client MCP (texte JSON).
#[tauri::command]
pub async fn mcp_client_config() -> Result<String, String> {
  let entry = server_entry().ok_or("exécutable introuvable")?;
  serde_json::to_string_pretty(&json!({ "mcpServers": { SERVER_NAME: entry } })).map_err(|e| e.to_string())
}

/// Ajoute (ou met à jour) l'entrée de MondoWrite dans la configuration d'un client, sans toucher au reste.
/// Un fichier qui n'est pas un objet JSON n'est jamais réécrit.
pub fn merge_config(existing: Option<&str>, entry: Value) -> Result<String, String> {
  let mut config = match existing.map(str::trim).filter(|t| !t.is_empty()) {
    Some(text) => serde_json::from_str::<Value>(text).map_err(|_| "configuration illisible".to_string())?,
    None => json!({}),
  };
  let root = config.as_object_mut().ok_or("configuration illisible")?;
  let servers = root.entry("mcpServers").or_insert_with(|| json!({}));
  servers.as_object_mut().ok_or("configuration illisible")?.insert(SERVER_NAME.into(), entry);
  serde_json::to_string_pretty(&config).map_err(|e| e.to_string())
}

/// État de la connexion à Claude Desktop : « missing » (Claude Desktop absent), « connected », « other » (une
/// entrée MondoWrite qui pointe ailleurs : ancienne installation), « no ».
#[tauri::command]
pub async fn mcp_claude_state() -> String {
  let Some(path) = claude_config_path() else { return "missing".into() };
  if !path.parent().is_some_and(|p| p.is_dir()) {
    return "missing".into();
  }
  let text = std::fs::read_to_string(&path).unwrap_or_default();
  let config: Value = serde_json::from_str(&text).unwrap_or(json!({}));
  match config.pointer(&format!("/mcpServers/{SERVER_NAME}/command")).and_then(Value::as_str) {
    Some(cmd) if Some(cmd.to_string()) == exe_path() => "connected".into(),
    Some(_) => "other".into(),
    None => "no".into(),
  }
}

/// « Connecter à Claude Desktop » : écrit l'entrée `mondowrite` dans sa configuration. Claude Desktop la lit à son
/// prochain lancement.
#[tauri::command]
pub async fn mcp_connect_claude() -> Result<(), String> {
  let path = claude_config_path().ok_or("Claude Desktop introuvable")?;
  let dir = path.parent().ok_or("Claude Desktop introuvable")?;
  if !dir.is_dir() {
    return Err("Claude Desktop introuvable".into());
  }
  let existing = std::fs::read_to_string(&path).ok();
  let text = merge_config(existing.as_deref(), server_entry().ok_or("exécutable introuvable")?)?;
  write_safely(&path, &text).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------------------------------------------
// Serveur
// ---------------------------------------------------------------------------------------------------------------

/// Instantanés lisibles du dossier : (clé, contenu).
fn read_snapshots(dir: &Path) -> Vec<(String, Value)> {
  let mut out = Vec::new();
  let Ok(entries) = std::fs::read_dir(dir) else { return out };
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_string();
    let Some(key) = name.strip_suffix(".json") else { continue };
    if !is_key(key) {
      continue;
    }
    if let Some(v) = std::fs::read_to_string(entry.path()).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) {
      if v.get("format").and_then(Value::as_u64) == Some(1) {
        out.push((key.to_string(), v));
      }
    }
  }
  out.sort_by(|a, b| str_of(&b.1, "/savedAt").cmp(str_of(&a.1, "/savedAt")));
  out
}

fn str_of<'a>(v: &'a Value, pointer: &str) -> &'a str {
  v.pointer(pointer).and_then(Value::as_str).unwrap_or("")
}

/// Texte replié pour comparer : minuscules, sans accents (lettres latines courantes), espaces simplifiées.
pub fn fold(text: &str) -> String {
  let mut out = String::with_capacity(text.len());
  for c in text.chars().flat_map(char::to_lowercase) {
    let base = match c {
      'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' => "a",
      'æ' => "ae",
      'ç' | 'ć' | 'č' => "c",
      'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ę' | 'ě' => "e",
      'ì' | 'í' | 'î' | 'ï' | 'ī' => "i",
      'ñ' | 'ń' | 'ň' => "n",
      'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'ō' => "o",
      'œ' => "oe",
      'ù' | 'ú' | 'û' | 'ü' | 'ū' | 'ů' => "u",
      'ý' | 'ÿ' => "y",
      'ß' => "ss",
      'ś' | 'š' => "s",
      'ź' | 'ż' | 'ž' => "z",
      'ł' => "l",
      'ř' => "r",
      '’' | '‘' => "'",
      c if c.is_whitespace() => " ",
      _ => {
        out.push(c);
        continue;
      }
    };
    out.push_str(base);
  }
  out
}

/// Erreur d'un outil, rendue à l'IA comme un résultat d'erreur (elle peut se corriger).
type ToolResult = Result<String, String>;

pub struct Server {
  dir: PathBuf,
  /// Nom du client (`clientInfo.name` d'`initialize`), écrit dans le journal de l'IA du projet.
  client: std::cell::RefCell<String>,
  /// Attente d'une réponse de l'app (plus courte dans les tests).
  answer_ms: u64,
}

impl Server {
  pub fn new(dir: PathBuf) -> Self {
    Self { dir, client: std::cell::RefCell::new(String::new()), answer_ms: ANSWER_MS }
  }

  /// Le projet demandé : par clé ou par titre (égal, puis contenu). Facultatif s'il n'y en a qu'un.
  fn project(&self, args: &Value) -> Result<(String, Value), String> {
    let mut all = read_snapshots(&self.dir);
    if all.is_empty() {
      return Err("Aucun projet n'est ouvert à l'assistant. Dans MondoWrite : Réglages › IA › Assistant externe, puis Réglages › Ce projet. / No project is shared with the assistant yet (MondoWrite: Settings › AI › External assistant, then Settings › This project).".into());
    }
    let wanted = args.get("project").and_then(Value::as_str).map(str::trim).unwrap_or("");
    if wanted.is_empty() {
      if all.len() == 1 {
        return Ok(self.seen(all.remove(0)));
      }
      return Err(format!("Plusieurs projets : précise `project`. / Several projects, set `project`.\n{}", self.list_projects()));
    }
    let f = fold(wanted);
    let pick = all
      .iter()
      .position(|(k, _)| k == wanted)
      .or_else(|| all.iter().position(|(_, v)| fold(str_of(v, "/project/title")) == f))
      .or_else(|| all.iter().position(|(_, v)| fold(str_of(v, "/project/title")).contains(&f)));
    match pick {
      Some(i) => Ok(self.seen(all.remove(i))),
      None => Err(format!("Projet introuvable : « {wanted} ». / Project not found.\n{}", self.list_projects())),
    }
  }

  /// Note que l'assistant vient de lire ce projet (pastille de l'app). Erreur avalée : la lecture continue.
  fn seen(&self, project: (String, Value)) -> (String, Value) {
    let dir = self.dir.join(SEEN_DIR);
    if std::fs::create_dir_all(&dir).is_ok() {
      let note = json!({ "at": now_ms() as u64, "client": self.client.borrow().clone() });
      let _ = std::fs::write(dir.join(&project.0), note.to_string());
    }
    project
  }

  fn list_projects(&self) -> String {
    let all = read_snapshots(&self.dir);
    if all.is_empty() {
      return "Aucun projet n'est ouvert à l'assistant. / No project is shared with the assistant.".into();
    }
    let mut out = String::from("Projets MondoWrite ouverts à l'assistant / MondoWrite projects shared with the assistant:\n");
    for (key, v) in &all {
      out.push_str(&format!(
        "- {} ({}, {} scènes/scenes, {}) · id `{}` · {}\n",
        str_of(v, "/project/title"),
        str_of(v, "/project/kindLabel"),
        v.get("scenes").and_then(Value::as_array).map_or(0, Vec::len),
        if str_of(v, "/project/access") == "write" { "lecture et écriture / read and write" } else { "lecture seule / read only" },
        key,
        str_of(v, "/savedAt")
      ));
    }
    out
  }

  fn overview(&self, args: &Value) -> ToolResult {
    let (_, v) = self.project(args)?;
    let p = &v["project"];
    let mut out = format!("# {}\n\n{}", str_of(p, "/title"), str_of(p, "/kindLabel"));
    for key in ["author", "logline", "resume"] {
      let text = str_of(p, &format!("/{key}"));
      if !text.is_empty() {
        let label = str_of(p, &format!("/labels/{key}"));
        out.push_str(&format!("\n\n**{label}** : {text}"));
      }
    }
    let scenes = v.get("scenes").and_then(Value::as_array).cloned().unwrap_or_default();
    let words: u64 = scenes.iter().filter_map(|s| s.get("words").and_then(Value::as_u64)).sum();
    out.push_str(&format!("\n\n{} scènes/scenes, {} mots/words.\n\n## Scènes / Scenes\n", scenes.len(), words));
    let mut part = String::new();
    for s in &scenes {
      let this = str_of(s, "/part");
      if this != part && !this.is_empty() {
        out.push_str(&format!("\n### {this}\n"));
      }
      part = this.to_string();
      out.push_str(&format!("{}. {}", s["n"], str_of(s, "/title")));
      let mut extra: Vec<String> = Vec::new();
      for (key, label) in [("status", ""), ("pov", "PDV/POV : ")] {
        let text = str_of(s, &format!("/{key}"));
        if !text.is_empty() {
          extra.push(format!("{label}{text}"));
        }
      }
      if let Some(w) = s.get("words").and_then(Value::as_u64) {
        extra.push(format!("{w} mots/words"));
      }
      if !extra.is_empty() {
        out.push_str(&format!(" ({})", extra.join(" · ")));
      }
      let syn = str_of(s, "/synopsis");
      if !syn.is_empty() {
        out.push_str(&format!(" : {syn}"));
      }
      out.push('\n');
    }
    let cards = v.get("cards").and_then(Value::as_array).cloned().unwrap_or_default();
    if !cards.is_empty() {
      out.push_str("\n## Cartes / Cards\n");
      let mut counts: Vec<(String, usize)> = Vec::new();
      for c in &cards {
        let label = str_of(c, "/typeLabel").to_string();
        match counts.iter_mut().find(|(l, _)| *l == label) {
          Some((_, n)) => *n += 1,
          None => counts.push((label, 1)),
        }
      }
      out.push_str(&counts.iter().map(|(l, n)| format!("{l} : {n}")).collect::<Vec<_>>().join(", "));
      out.push('\n');
    }
    Ok(clip(out))
  }

  fn read_scene(&self, args: &Value) -> ToolResult {
    let (_, v) = self.project(args)?;
    let scenes = v.get("scenes").and_then(Value::as_array).cloned().unwrap_or_default();
    let wanted = args.get("scenes").or_else(|| args.get("scene"));
    let asked: Vec<String> = match wanted {
      Some(Value::String(s)) => s.split(',').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect(),
      Some(Value::Number(n)) => vec![n.to_string()],
      Some(Value::Array(a)) => a.iter().map(|x| x.as_str().map(str::to_string).unwrap_or_else(|| x.to_string())).collect(),
      _ => Vec::new(),
    };
    if asked.is_empty() {
      return Err("Indique `scenes` : numéros (« 3 », « 3-5 »), identifiants ou titres. / Set `scenes`.".into());
    }
    let mut picked: Vec<usize> = Vec::new();
    for a in &asked {
      let found = find_scenes(&scenes, a);
      if found.is_empty() {
        return Err(format!("Scène introuvable : « {a} ». Voir `project_overview`. / Scene not found."));
      }
      for i in found {
        if !picked.contains(&i) {
          picked.push(i);
        }
      }
    }
    let mut out = String::new();
    for i in picked {
      let s = &scenes[i];
      out.push_str(&format!("## {}. {}\n", s["n"], str_of(s, "/title")));
      for (key, label) in [("part", ""), ("synopsis", "Synopsis : "), ("status", ""), ("pov", "PDV/POV : ")] {
        let text = str_of(s, &format!("/{key}"));
        if !text.is_empty() {
          out.push_str(&format!("_{label}{text}_\n"));
        }
      }
      if let Some(fiche) = s.get("fiche").and_then(Value::as_object) {
        for (label, value) in fiche {
          if let Some(text) = value.as_str() {
            out.push_str(&format!("- {label} : {text}\n"));
          }
        }
      }
      let text = str_of(s, "/text");
      out.push('\n');
      out.push_str(if text.trim().is_empty() { "(scène encore vide / empty scene)" } else { text });
      out.push_str("\n\n");
      if out.len() > MAX_CHARS {
        break;
      }
    }
    Ok(clip(out))
  }

  fn list_cards(&self, args: &Value) -> ToolResult {
    let (_, v) = self.project(args)?;
    let cards = v.get("cards").and_then(Value::as_array).cloned().unwrap_or_default();
    let filter = args.get("type").and_then(Value::as_str).map(fold).unwrap_or_default();
    let mut out = String::new();
    let mut last = String::new();
    for c in cards.iter().filter(|c| filter.is_empty() || fold(str_of(c, "/type")) == filter || fold(str_of(c, "/typeLabel")).starts_with(&filter)) {
      let label = str_of(c, "/typeLabel");
      if label != last {
        out.push_str(&format!("\n## {label}\n"));
        last = label.to_string();
      }
      out.push_str(&format!("- {} · id `{}`", str_of(c, "/title"), str_of(c, "/id")));
      let accroche = str_of(c, "/summary");
      if !accroche.is_empty() {
        out.push_str(&format!(" : {accroche}"));
      }
      out.push('\n');
    }
    if out.is_empty() {
      return Ok("Aucune carte. / No cards.".into());
    }
    Ok(clip(out.trim_start().to_string()))
  }

  fn read_card(&self, args: &Value) -> ToolResult {
    let (_, v) = self.project(args)?;
    let cards = v.get("cards").and_then(Value::as_array).cloned().unwrap_or_default();
    let wanted = args.get("card").and_then(Value::as_str).map(str::trim).unwrap_or("");
    if wanted.is_empty() {
      return Err("Indique `card` : titre ou identifiant. / Set `card` (title or id).".into());
    }
    let f = fold(wanted);
    let c = cards
      .iter()
      .find(|c| str_of(c, "/id") == wanted)
      .or_else(|| cards.iter().find(|c| fold(str_of(c, "/title")) == f))
      .or_else(|| cards.iter().find(|c| fold(str_of(c, "/title")).contains(&f)))
      .ok_or(format!("Carte introuvable : « {wanted} ». Voir `list_cards`. / Card not found."))?;
    let mut out = format!("# {} ({})\n", str_of(c, "/title"), str_of(c, "/typeLabel"));
    if let Some(fiche) = c.get("fiche").and_then(Value::as_object) {
      for (label, value) in fiche {
        if let Some(text) = value.as_str() {
          out.push_str(&format!("- **{label}** : {text}\n"));
        }
      }
    }
    let notes = str_of(c, "/notes");
    if !notes.trim().is_empty() {
      out.push_str(&format!("\n{notes}\n"));
    }
    if let Some(links) = c.get("links").and_then(Value::as_array).filter(|l| !l.is_empty()) {
      out.push_str("\n## Relié à / Linked to\n");
      for l in links {
        let label = str_of(l, "/label");
        out.push_str(&format!("- {}{}\n", str_of(l, "/title"), if label.is_empty() { String::new() } else { format!(" ({label})") }));
      }
    }
    // Scènes qui nomment la carte : relevées par l'app (prénom, surnoms, mentions), sinon par le titre.
    let scenes = v.get("scenes").and_then(Value::as_array).cloned().unwrap_or_default();
    let label = |s: &Value| format!("{}. {}", s["n"], str_of(s, "/title"));
    let cited: Vec<String> = match c.get("scenes").and_then(Value::as_array) {
      Some(ns) => ns.iter().filter_map(Value::as_u64).filter_map(|n| scenes.iter().find(|s| s.get("n").and_then(Value::as_u64) == Some(n))).map(label).collect(),
      None => {
        let name = fold(str_of(c, "/title"));
        if name.chars().count() < 3 { Vec::new() } else { scenes.iter().filter(|s| fold(str_of(s, "/text")).contains(&name)).map(label).collect() }
      }
    };
    if !cited.is_empty() {
      out.push_str("\n## Cité dans / Mentioned in\n");
      for s in cited.iter().take(MAX_HITS) {
        out.push_str(&format!("- {s}\n"));
      }
    }
    Ok(clip(out))
  }

  fn search(&self, args: &Value) -> ToolResult {
    let (_, v) = self.project(args)?;
    let query = args.get("query").and_then(Value::as_str).map(str::trim).unwrap_or("");
    if query.chars().count() < 2 {
      return Err("Indique `query` (deux caractères au moins). / Set `query`.".into());
    }
    let q = fold(query);
    let mut hits: Vec<String> = Vec::new();
    let mut total = 0usize;
    let scenes = v.get("scenes").and_then(Value::as_array).cloned().unwrap_or_default();
    for s in &scenes {
      for (excerpt, count) in excerpts(str_of(s, "/text"), &q) {
        total += count;
        if hits.len() < MAX_HITS {
          hits.push(format!("- Scène/Scene {}. {} : « {} »", s["n"], str_of(s, "/title"), excerpt));
        }
      }
    }
    let cards = v.get("cards").and_then(Value::as_array).cloned().unwrap_or_default();
    for c in &cards {
      let mut body = format!("{}\n{}", str_of(c, "/title"), str_of(c, "/notes"));
      if let Some(fiche) = c.get("fiche").and_then(Value::as_object) {
        for value in fiche.values().filter_map(Value::as_str) {
          body.push('\n');
          body.push_str(value);
        }
      }
      for (excerpt, count) in excerpts(&body, &q) {
        total += count;
        if hits.len() < MAX_HITS {
          hits.push(format!("- {} ({}) : « {} »", str_of(c, "/title"), str_of(c, "/typeLabel"), excerpt));
        }
      }
    }
    if hits.is_empty() {
      return Ok(format!("Aucun résultat pour « {query} ». / No results."));
    }
    let mut out = format!("{total} résultat(s) pour « {query} » / result(s):\n");
    out.push_str(&hits.join("\n"));
    if total > hits.len() {
      out.push_str(&format!("\n… {} de plus / more.", total - hits.len()));
    }
    Ok(clip(out))
  }

  /// Outil d'écriture : la demande va à l'app ouverte, qui l'applique et répond. Jamais d'écriture directe ici.
  fn write(&self, name: &str, args: &Value) -> ToolResult {
    self.forward(name, args, true)
  }

  /// Une demande passée à l'app ouverte : écriture (`write`), ou lecture faite sur le projet à l'écran.
  fn forward(&self, name: &str, args: &Value, write: bool) -> ToolResult {
    let (key, v) = self.project(args)?;
    if write && str_of(&v, "/project/access") != "write" {
      return Err("Ce projet est ouvert à l'assistant en lecture seule. Dans MondoWrite : Réglages › Ce projet › « Lecture et écriture ». / This project is read only for the assistant.".into());
    }
    let live = std::fs::read_to_string(self.dir.join(LIVE_DIR).join(&key)).ok().and_then(|t| t.trim().parse::<u128>().ok());
    if !live.is_some_and(|at| now_ms().saturating_sub(at) < LIVE_MS) {
      return Err(if write {
        format!("Ouvre « {} » dans MondoWrite : l'assistant n'écrit que dans un projet ouvert, pour que tout passe par l'app (annulation, marque IA, journal). / Open the project in MondoWrite first.", str_of(&v, "/project/title"))
      } else {
        format!("Ouvre « {} » dans MondoWrite : cette lecture se fait sur le projet ouvert. / Open the project in MondoWrite first.", str_of(&v, "/project/title"))
      });
    }
    let queue = self.dir.join(QUEUE_DIR).join(&key);
    std::fs::create_dir_all(&queue).map_err(|e| e.to_string())?;
    let id = format!("{}-{}", now_ms(), std::process::id());
    let mut clean = args.clone();
    if let Some(o) = clean.as_object_mut() {
      o.remove("project");
    }
    let request = json!({ "id": id, "tool": name, "args": clean, "client": self.client.borrow().clone() });
    let req = queue.join(format!("req-{id}.json"));
    write_safely(&req, &request.to_string()).map_err(|e| e.to_string())?;
    let res = queue.join(format!("res-{id}.json"));
    let start = std::time::Instant::now();
    while start.elapsed().as_millis() < self.answer_ms as u128 {
      if let Ok(text) = std::fs::read_to_string(&res) {
        let _ = std::fs::remove_file(&res);
        let answer: Value = serde_json::from_str(&text).unwrap_or(json!({ "ok": false, "text": "Réponse illisible." }));
        let message = str_of(&answer, "/text").to_string();
        return if answer.get("ok").and_then(Value::as_bool) == Some(true) { Ok(message) } else { Err(message) };
      }
      std::thread::sleep(std::time::Duration::from_millis(100));
    }
    let _ = std::fs::remove_file(&req);
    Err("MondoWrite n'a pas répondu à temps : rien n'a été écrit. Vérifie que le projet est ouvert. / MondoWrite did not answer: nothing was written.".into())
  }

  pub fn tools() -> Value {
    let project = json!({ "type": "string", "description": "Titre ou identifiant du projet (facultatif s'il n'y en a qu'un). / Project title or id (optional if only one)." });
    let mut tools = json!([
      {
        "name": "list_projects",
        "description": "Liste les projets MondoWrite (romans, scénarios) que l'auteur a ouverts à l'assistant. / Lists the MondoWrite projects (novels, screenplays) the author shared with the assistant.",
        "inputSchema": { "type": "object", "properties": {} },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "project_overview",
        "description": "Vue d'ensemble d'un projet : logline, résumé, table des scènes dans l'ordre du récit (numéro, titre, chapitre ou épisode, synopsis, statut, point de vue, mots) et nombre de cartes par type. À appeler en premier. / Project overview: logline, summary, scene list in story order and card counts. Call this first.",
        "inputSchema": { "type": "object", "properties": { "project": project } },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "read_scene",
        "description": "Texte d'une ou plusieurs scènes (Markdown pour un roman, Fountain pour un scénario), avec synopsis et fiche. Par numéro (« 3 », « 3-5 »), identifiant ou titre, séparés par des virgules. Lire peu de scènes à la fois. / Text of one or more scenes, by number, range, id or title (comma separated). Read a few at a time.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scenes": { "type": "string", "description": "Ex. « 3 », « 3-5, 12 », un titre ou un identifiant." } }, "required": ["scenes"] },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "list_cards",
        "description": "Cartes de la Bible du projet (personnages, lieux, intrigues, objets…), avec leur accroche. Filtre facultatif par type. / The project's Bible cards (characters, places, plots…), optionally filtered by type.",
        "inputSchema": { "type": "object", "properties": { "project": project, "type": { "type": "string", "description": "personnage, lieu, intrigue, theme, objet, groupe, evenement, regle, secret, question, idee… ou le libellé (Personnage, Character…)." } } },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "read_card",
        "description": "Fiche d'une carte : champs remplis, notes de l'auteur, cartes reliées (fils du canevas) et scènes qui la nomment. / A card's sheet: fields, notes, linked cards and scenes that name it.",
        "inputSchema": { "type": "object", "properties": { "project": project, "card": { "type": "string", "description": "Titre ou identifiant de la carte." } }, "required": ["card"] },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "search",
        "description": "Cherche un mot ou une expression dans le texte des scènes et dans les cartes (sans casse ni accents), avec le contexte de chaque occurrence. / Searches scenes and cards (case and accent insensitive), with context.",
        "inputSchema": { "type": "object", "properties": { "project": project, "query": { "type": "string" } }, "required": ["query"] },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "create_card",
        "description": "Crée une carte dans la Bible et sur le canevas (personnage, lieu, intrigue, objet, idée…), avec ses notes et des champs de sa fiche. Marquée « IA » et notée dans le journal de l'IA du projet ; l'auteur peut l'annuler. Projet ouvert en écriture dans MondoWrite. / Creates a card (marked as AI, logged, undoable).",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "type": { "type": "string", "description": "personnage, lieu, intrigue, theme, objet, groupe, evenement, regle, secret, question, idee… ou le libellé (Personnage, Character…)." },
          "title": { "type": "string" },
          "notes": { "type": "string", "description": "Texte de la carte, en Markdown. [[Titre]] cite une autre carte (mention, fil tiré)." },
          "fields": { "type": "object", "additionalProperties": { "type": "string" }, "description": "Champs de la fiche, par libellé ou clé (Âge, Métier, Veut…)." }
        }, "required": ["type", "title"] }
      },
      {
        "name": "update_card",
        "description": "Modifie une carte : type (une Idée devient Personnage…), champs de la fiche, notes (ajout à la fin ou remplacement), titre. Marqué « IA », journalisé, annulable. / Updates a card's type, fields, notes or title.",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "card": { "type": "string", "description": "Titre ou identifiant." },
          "type": { "type": "string", "description": "Nouveau type (clé ou libellé), appliqué avant les champs." },
          "title": { "type": "string" },
          "fields": { "type": "object", "additionalProperties": { "type": "string" } },
          "notes": { "type": "string", "description": "Markdown. [[Titre]] cite une autre carte." },
          "notes_mode": { "type": "string", "enum": ["append", "replace"], "description": "append par défaut." }
        }, "required": ["card"] }
      },
      {
        "name": "link_cards",
        "description": "Relie deux cartes par un fil du canevas, avec une étiquette facultative (« aime », « se passe à »…). / Links two cards with a labelled wire.",
        "inputSchema": { "type": "object", "properties": { "project": project, "from": { "type": "string" }, "to": { "type": "string" }, "label": { "type": "string" } }, "required": ["from", "to"] }
      },
      {
        "name": "add_question",
        "description": "Pose une question à l'auteur : carte Question (rubrique « À creuser »), reliée aux cartes concernées. La meilleure façon de signaler un doute ou une incohérence. / Adds a Question card for the author, linked to cards.",
        "inputSchema": { "type": "object", "properties": { "project": project, "question": { "type": "string" }, "about": { "type": "array", "items": { "type": "string" }, "description": "Titres ou identifiants des cartes concernées." } }, "required": ["question"] }
      },
      {
        "name": "create_scene",
        "description": "Crée une scène à la fin du récit (roman : titre libre ; scénario : en-tête « INT. LIEU - JOUR »), avec synopsis et texte facultatifs. / Creates a scene at the end of the story.",
        "inputSchema": { "type": "object", "properties": { "project": project, "title": { "type": "string" }, "synopsis": { "type": "string" }, "text": { "type": "string", "description": "Markdown (roman, [[Titre]] cite une carte) ou Fountain sans en-tête (scénario)." }, "page": { "type": "string", "description": "Roman : page hors récit (titre, copyright, dedicace, epigraphe, prologue, epilogue, remerciements, auteur) au lieu d'une scène." } } }
      },
      {
        "name": "set_scene_synopsis",
        "description": "Écrit le synopsis d'une scène (une ou deux phrases). Marqué « IA ». / Sets a scene's synopsis.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string", "description": "Numéro, identifiant ou titre." }, "synopsis": { "type": "string" } }, "required": ["scene", "synopsis"] }
      },
      {
        "name": "set_scene_fields",
        "description": "Remplit la fiche d'une scène : statut (à écrire, brouillon, à revoir, révisée, finie), point de vue (nom d'un personnage), ce qu'il veut (but), obstacle, tournant, changement, issue (mieux, pire, pareil), synopsis, dépouillement (accessoires, costumes, figurants, véhicules, effets). Clés ou libellés ; une valeur vide efface le champ. Textes marqués « IA ». / Sets a scene's sheet fields (status, POV, goal, obstacle…).",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "scene": { "type": "string", "description": "Numéro, identifiant ou titre." },
          "fields": { "type": "object", "description": "Champ → valeur, ex. { \"statut\": \"brouillon\", \"pov\": \"Inès\", \"but\": \"…\" }.", "additionalProperties": { "type": "string" } }
        }, "required": ["scene", "fields"] }
      },
      {
        "name": "write_scene",
        "description": "Écrit le texte d'une scène : ajout à la fin ou remplacement. Roman : Markdown ([[Titre]] cite une carte) ; scénario : Fountain sans en-tête de scène. Le texte de l'IA reste marqué jusqu'à ce que l'auteur le reprenne ; avant un remplacement dans un roman, MondoWrite garde une version de la scène. / Writes a scene's text (append or replace), marked as AI.",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "scene": { "type": "string", "description": "Numéro, identifiant ou titre." },
          "text": { "type": "string" },
          "mode": { "type": "string", "enum": ["append", "replace"], "description": "append par défaut." }
        }, "required": ["scene", "text"] }
      },
      {
        "name": "move_scene",
        "description": "Déplace une scène, avec son texte, juste avant ou après une autre. Roman : elle prend le chapitre et la case du plan de sa voisine ; scénario : son texte suit dans le Fountain. Les numéros des scènes changent ensuite : relis project_overview. / Moves a scene before or after another one.",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "scene": { "type": "string", "description": "Scène à déplacer : numéro, identifiant ou titre." },
          "before": { "type": "string", "description": "La poser avant cette scène." },
          "after": { "type": "string", "description": "Ou la poser après cette scène." }
        }, "required": ["scene"] }
      },
      {
        "name": "create_chapter",
        "description": "Roman : commence un nouveau chapitre à cette scène (elle et les suivantes du chapitre en cours y passent), avec un titre facultatif. Les chapitres sont renumérotés. / Novel: starts a new chapter at this scene.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string", "description": "Première scène du chapitre : numéro, identifiant ou titre." }, "title": { "type": "string" } }, "required": ["scene"] }
      },
      {
        "name": "rename_chapter",
        "description": "Roman : donne un titre à un chapitre (vide : il n'a plus que son numéro). / Novel: renames a chapter.",
        "inputSchema": { "type": "object", "properties": { "project": project, "chapter": { "type": "string", "description": "Numéro, identifiant ou titre du chapitre." }, "title": { "type": "string" } }, "required": ["chapter", "title"] }
      },
      {
        "name": "move_chapter",
        "description": "Roman : déplace un chapitre entier, toutes ses scènes comprises, avant une scène (sans `before` : à la fin du récit). / Novel: moves a whole chapter.",
        "inputSchema": { "type": "object", "properties": { "project": project, "chapter": { "type": "string" }, "before": { "type": "string", "description": "Scène devant laquelle le poser." } }, "required": ["chapter"] }
      },
      {
        "name": "delete_chapter",
        "description": "Roman : retire un chapitre ; ses scènes rejoignent le chapitre précédent. Aucune scène ni aucun texte n'est supprimé. / Novel: removes a chapter break, never a scene.",
        "inputSchema": { "type": "object", "properties": { "project": project, "chapter": { "type": "string" } }, "required": ["chapter"] }
      }
    ]);
    // En deux listes : une seule dépasserait la profondeur permise à la macro `json!`.
    let more = json!([
      {
        "name": "add_comment",
        "description": "Commente un passage d'une scène, comme un relecteur dans la marge : le passage cité (mot pour mot, d'un seul tenant) est surligné, le commentaire va dans l'onglet Commentaires et dans « À faire ». Le texte n'est pas changé. / Anchors a margin comment to an exact quote; the text is not changed.",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "scene": { "type": "string", "description": "Numéro, identifiant ou titre." },
          "quote": { "type": "string", "description": "Passage exact de la scène (scénario : dans une action ou une réplique)." },
          "text": { "type": "string", "description": "Le commentaire." }
        }, "required": ["scene", "quote", "text"] }
      },
      {
        "name": "resolve_comment",
        "description": "Marque un commentaire comme résolu (ou le rouvre). Identifiant donné par read_comments. / Resolves (or reopens) a comment.",
        "inputSchema": { "type": "object", "properties": { "project": project, "comment": { "type": "string" }, "resolved": { "type": "boolean", "description": "true par défaut." } }, "required": ["comment"] }
      },
      {
        "name": "keep_version",
        "description": "Garde le texte actuel d'une scène comme version (fenêtre « Versions de la scène »), avant une série de changements. / Saves the scene's current text as a version.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string" }, "title": { "type": "string" } }, "required": ["scene"] }
      },
      {
        "name": "create_episode",
        "description": "Scénario de série : nouvel épisode à la fin d'une saison (la dernière par défaut), ou nouvelle saison (`season_only`). Le premier épisode reçoit le texte déjà écrit. / Series: adds an episode (or a season).",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "title": { "type": "string" },
          "synopsis": { "type": "string" },
          "season": { "type": "string", "description": "Saison où le poser : numéro, identifiant ou titre." },
          "season_only": { "type": "boolean", "description": "Créer une saison plutôt qu'un épisode." }
        } }
      },
      {
        "name": "update_episode",
        "description": "Série : renomme un épisode ou une saison, écrit le synopsis d'un épisode, ou le déplace d'un cran (`move`). / Series: renames, sets synopsis or moves an episode or season.",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "episode": { "type": "string", "description": "Épisode (« 2.3 », numéro, identifiant ou titre) ou saison (« saison 2 »)." },
          "title": { "type": "string" },
          "synopsis": { "type": "string" },
          "move": { "type": "string", "enum": ["up", "down"] }
        }, "required": ["episode"] }
      },
      {
        "name": "place_scene",
        "description": "Range une scène dans une case du gabarit (`beat`, ex. « Catalyseur ») ou, dans une série, dans un épisode (`episode`), avec son texte. / Files a scene into a template beat or a series episode.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string" }, "beat": { "type": "string" }, "episode": { "type": "string" } }, "required": ["scene"] }
      },
      {
        "name": "set_template",
        "description": "Pose le gabarit du plan ou du séquencier (trois actes, Save the Cat, voyage du héros, huit séquences, sept points, Freytag, Hauge, cercle de Harmon, kishōtenketsu, romance, polar ; roman : libre). Changer de gabarit ne perd aucun rangement. / Sets the story structure template.",
        "inputSchema": { "type": "object", "properties": { "project": project, "template": { "type": "string" } }, "required": ["template"] }
      },
      {
        "name": "merge_scenes",
        "description": "Fusionne la scène suivante dans celle-ci : texte, synopsis, fils et commentaires. La carte de la scène suivante part à la corbeille. Roman : même chapitre ; scénario : scènes qui se suivent. / Merges the next scene into this one.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string" } }, "required": ["scene"] }
      },
      {
        "name": "split_scene",
        "description": "Roman : coupe une scène en deux au paragraphe qui contient `at` ; la suite devient une nouvelle scène juste après (même chapitre). / Novel: splits a scene at the paragraph containing `at`.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string" }, "at": { "type": "string", "description": "Début exact du paragraphe où couper." }, "title": { "type": "string", "description": "Titre de la nouvelle scène." } }, "required": ["scene", "at"] }
      },
      {
        "name": "trash_card",
        "description": "Met une carte à la corbeille, avec ses fils (et sa scène, dans un scénario). Rien n'est effacé : l'auteur peut la remettre. Le texte d'une scène de roman reste. / Moves a card to the trash (restorable).",
        "inputSchema": { "type": "object", "properties": { "project": project, "card": { "type": "string" } }, "required": ["card"] }
      },
      {
        "name": "unlink_cards",
        "description": "Retire le fil entre deux cartes. / Removes the wire between two cards.",
        "inputSchema": { "type": "object", "properties": { "project": project, "from": { "type": "string" }, "to": { "type": "string" } }, "required": ["from", "to"] }
      },
      {
        "name": "rename_everywhere",
        "description": "Renomme une carte (personnage, lieu…) et son nom partout : manuscrit ou scénario, notes des cartes. Seulement le nom tel qu'il est écrit (ou en capitales), jamais un mot ordinaire. / Renames a card and its name everywhere.",
        "inputSchema": { "type": "object", "properties": { "project": project, "card": { "type": "string" }, "name": { "type": "string" } }, "required": ["card", "name"] }
      },
      {
        "name": "replace_text",
        "description": "Rechercher et remplacer dans le texte des scènes (tout le projet, ou une scène), et si demandé dans les notes des cartes. Annulable par l'auteur. / Find and replace in scene text.",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "find": { "type": "string" },
          "replace": { "type": "string" },
          "scene": { "type": "string", "description": "Une seule scène (facultatif)." },
          "cards": { "type": "boolean", "description": "Aussi les notes des cartes." },
          "match_case": { "type": "boolean" },
          "whole_word": { "type": "boolean" }
        }, "required": ["find", "replace"] }
      },
      {
        "name": "set_cover",
        "description": "Écrit un champ de la couverture du projet (tagline, logline, résumé, comparables, note d'intention, et pour un scénario les rubriques de la série ou du film). Marqué « IA ». / Writes a cover field (logline, summary...), marked as AI.",
        "inputSchema": { "type": "object", "properties": { "project": project, "field": { "type": "string", "description": "Clé (logline, resume, tagline, comps, intention…) ou libellé." }, "text": { "type": "string" } }, "required": ["field", "text"] }
      },
      {
        "name": "create_frame",
        "description": "Pose un cadre titré sur le canevas autour de ces cartes (ou vide). / Draws a titled frame around cards on the canvas.",
        "inputSchema": { "type": "object", "properties": { "project": project, "title": { "type": "string" }, "cards": { "type": "array", "items": { "type": "string" } } }, "required": ["title"] }
      },
      {
        "name": "organize_canvas",
        "description": "Range tout le canevas : un cadre par type de carte, par case du gabarit, par chapitre ou épisode. Une seule annulation le défait. / Tidies the whole canvas.",
        "inputSchema": { "type": "object", "properties": { "project": project } }
      },
      {
        "name": "update_link",
        "description": "Modifie le fil entre deux cartes : étiquette et fiche du fil (histoire, enjeu, évolution). / Edits the wire between two cards (label, history, stake, evolution).",
        "inputSchema": { "type": "object", "properties": { "project": project, "from": { "type": "string" }, "to": { "type": "string" }, "label": { "type": "string" }, "fields": { "type": "object", "additionalProperties": { "type": "string" }, "description": "histoire, enjeu, evolution (ou libellés)." } }, "required": ["from", "to"] }
      },
      {
        "name": "restore_card",
        "description": "Sort une carte de la corbeille (avec ses fils, et sa scène dans un scénario). / Restores a card from the trash.",
        "inputSchema": { "type": "object", "properties": { "project": project, "card": { "type": "string", "description": "Titre ou identifiant." } }, "required": ["card"] }
      },
      {
        "name": "replace_passage",
        "description": "Remplace un passage précis d'une scène, cité mot pour mot (une phrase, un paragraphe ou une partie d'élément du scénario), par un nouveau texte marqué « IA ». Version de la scène gardée avant. Mieux que write_scene pour une retouche. / Replaces one quoted passage in a scene (marked as AI, version kept).",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string" }, "quote": { "type": "string", "description": "Passage exact, sans retour à la ligne." }, "text": { "type": "string", "description": "Nouveau texte, sans retour à la ligne." } }, "required": ["scene", "quote", "text"] }
      },
      {
        "name": "add_character_question",
        "description": "Garde une question dans la fiche d'un personnage (« À creuser »), sans créer de carte. / Keeps a question in a character's sheet.",
        "inputSchema": { "type": "object", "properties": { "project": project, "character": { "type": "string" }, "question": { "type": "string" } }, "required": ["character", "question"] }
      },
      {
        "name": "update_frame",
        "description": "Renomme ou retire un cadre du canevas (les cartes restent). Un cadre verrouillé n'est pas retiré. / Renames or removes a canvas frame.",
        "inputSchema": { "type": "object", "properties": { "project": project, "frame": { "type": "string", "description": "Titre ou identifiant." }, "title": { "type": "string" }, "remove": { "type": "boolean" } }, "required": ["frame"] }
      },
      {
        "name": "set_project",
        "description": "Titre du projet et objectifs d'écriture (mots par jour, mots du livre, échéance AAAA-MM-JJ, séance, scène, chapitre ; 0 retire un objectif). / Sets project title and writing goals.",
        "inputSchema": { "type": "object", "properties": { "project": project, "title": { "type": "string" }, "goals": { "type": "object", "properties": { "daily": { "type": "integer" }, "total": { "type": "integer" }, "deadline": { "type": "string" }, "session": { "type": "integer" }, "scene": { "type": "integer" }, "chapter": { "type": "integer" } } } } }
      },
      {
        "name": "todo_list",
        "description": "Ce qui reste à faire, comme dans « À faire » : cases non cochées, passages à reprendre, questions « À creuser », commentaires ouverts, textes de l'IA pas encore repris. Projet ouvert dans MondoWrite. / The author's to-do list.",
        "inputSchema": { "type": "object", "properties": { "project": project } },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "read_comments",
        "description": "Commentaires des scènes (passage cité, texte, résolu ou non, identifiant). Projet ouvert dans MondoWrite. / Scene comments.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string", "description": "Une scène (facultatif)." }, "resolved": { "type": "boolean", "description": "Inclure les résolus." } } },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "project_stats",
        "description": "Statistiques : présence des personnages (scènes, répliques, mots, première et dernière scène), lieux ou décors, qui croise qui, int./ext. et jour/nuit. Projet ouvert dans MondoWrite. / Character, place and crossing statistics.",
        "inputSchema": { "type": "object", "properties": { "project": project } },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "review",
        "description": "Points de l'onglet « Vérifier » : répétitions, mots trop employés, noms presque identiques, personnages sans carte ou muets, répliques et actions trop longues, questions sur l'histoire. Projet ouvert dans MondoWrite. / The app's own review findings.",
        "inputSchema": { "type": "object", "properties": { "project": project } },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "scene_versions",
        "description": "Versions gardées d'une scène ; avec `version`, le texte de cette version. Projet ouvert dans MondoWrite. / Saved versions of a scene.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string" }, "version": { "type": "string", "description": "Nom ou rang donné par la liste." } }, "required": ["scene"] },
        "annotations": { "readOnlyHint": true }
      },
      {
        "name": "read_journal",
        "description": "Journal de l'IA (ia-journal.md) : textes de l'IA acceptés, par date. Projet ouvert dans MondoWrite. / The AI journal.",
        "inputSchema": { "type": "object", "properties": { "project": project } },
        "annotations": { "readOnlyHint": true }
      }
    ]);
    if let (Some(list), Value::Array(extra)) = (tools.as_array_mut(), more) {
      list.extend(extra);
    }
    tools
  }

  fn call(&self, name: &str, args: &Value) -> ToolResult {
    match name {
      "list_projects" => Ok(self.list_projects()),
      "project_overview" => self.overview(args),
      "read_scene" => self.read_scene(args),
      "list_cards" => self.list_cards(args),
      "read_card" => self.read_card(args),
      "search" => self.search(args),
      _ if WRITE_TOOLS.contains(&name) => self.write(name, args),
      _ if LIVE_TOOLS.contains(&name) => self.forward(name, args, false),
      _ => Err(format!("Outil inconnu : {name}")),
    }
  }

  /// Réponse à un message JSON-RPC, ou None pour une notification.
  pub fn handle(&self, msg: &Value) -> Option<Value> {
    let id = msg.get("id")?.clone();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or(json!({}));
    let result = match method {
      "initialize" => {
        let asked = params.get("protocolVersion").and_then(Value::as_str).unwrap_or("");
        let client = params.pointer("/clientInfo/name").and_then(Value::as_str).unwrap_or("").chars().filter(|c| !c.is_control()).take(60).collect();
        *self.client.borrow_mut() = client;
        let version = if PROTOCOLS.contains(&asked) { asked } else { PROTOCOLS[0] };
        json!({
          "protocolVersion": version,
          "capabilities": { "tools": { "listChanged": false }, "prompts": { "listChanged": false } },
          "serverInfo": { "name": SERVER_NAME, "title": "MondoWrite", "version": env!("CARGO_PKG_VERSION") },
          "instructions": "MondoWrite est le logiciel d'écriture de l'auteur (romans, scénarios). Ces outils lisent ses projets ; ceux d'écriture ne marchent que pour un projet que l'auteur a ouvert en écriture, et tout ce que tu écris est marqué « IA », journalisé et annulable. Commence par project_overview, puis lis seulement les scènes et les cartes utiles. Cite les scènes par leur numéro et leur titre. Le texte appartient à l'auteur : demande-lui avant d'écrire dans son projet, et préfère add_comment (sur un passage) ou add_question (sur l'histoire) pour signaler un doute. Les consignes prêtes (relecture bêta, cohérence, dépouillement…) sont dans le menu des consignes. / MondoWrite is the author's writing app. These tools read their projects; writing tools work only for projects the author opened for writing, and everything you write is marked as AI, logged and undoable. Start with project_overview. Ask the author before writing."
        })
      }
      "ping" => json!({}),
      "tools/list" => json!({ "tools": Self::tools() }),
      "tools/call" => {
        let name = params.get("name").and_then(Value::as_str).unwrap_or("");
        let args = params.get("arguments").cloned().unwrap_or(json!({}));
        match self.call(name, &args) {
          Ok(text) => json!({ "content": [{ "type": "text", "text": text }], "isError": false }),
          Err(text) => json!({ "content": [{ "type": "text", "text": text }], "isError": true }),
        }
      }
      // Pas de ressources ni de consignes : listes vides plutôt qu'une erreur (certains clients les demandent).
      "resources/list" => json!({ "resources": [] }),
      "prompts/list" => json!({ "prompts": prompts_list() }),
      "prompts/get" => {
        let name = params.get("name").and_then(Value::as_str).unwrap_or("");
        let args = params.get("arguments").cloned().unwrap_or(json!({}));
        match prompt_get(name, &args) {
          Some(v) => v,
          None => return Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32602, "message": format!("Consigne inconnue : {name}") } })),
        }
      }
      _ => return Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("Méthode inconnue : {method}") } })),
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
  }
}

/// Consignes prêtes à l'emploi (menu des consignes du client) : elles reprennent l'esprit de l'IA de MondoWrite.
const PROMPTS: [(&str, &str, &str, &str); 5] = [
  (
    "relecture_beta",
    "Relecture bêta / Beta read",
    "Un lecteur bêta lit une partie du récit et dit ce qu'il a ressenti, sans réécrire. / A beta reader's reactions, no rewriting.",
    "Lis {range} du projet MondoWrite {project} (project_overview puis read_scene). Réagis comme un lecteur bêta attentif : où ton attention a faibli, ce que tu as cru comprendre, ce qui t'a surpris, les questions que tu te poses, ce que tu attends de la suite. Cite les scènes par numéro et titre. Ne réécris rien et ne propose pas de texte. Si l'auteur le souhaite, pose tes remarques en commentaires (add_comment) sur des passages exacts. Réponds dans la langue de l'auteur.",
  ),
  (
    "coherence",
    "Cohérence / Consistency check",
    "Chercher les contradictions entre les scènes et la Bible, posées en questions. / Contradictions, as questions.",
    "Vérifie la cohérence de {range} du projet MondoWrite {project} : lis les scènes (read_scene) et les fiches utiles (list_cards, read_card). Relève les contradictions de faits, de chronologie, de noms ou de caractère, chacune avec les passages exacts qui se contredisent. Formule chaque point comme une question à l'auteur, jamais comme une correction. Propose de garder les plus importantes en questions (add_question). Réponds dans la langue de l'auteur.",
  ),
  (
    "depouillement",
    "Dépouillement / Breakdown",
    "Dépouillement d'une ou plusieurs scènes : personnages, figurants, accessoires, costumes, décors, effets. / Production breakdown.",
    "Fais le dépouillement de {range} du projet MondoWrite {project} (read_scene) : décor, int./ext., jour/nuit, personnages, figurants, accessoires, costumes, véhicules, effets. Ne retiens que ce que le texte dit, avec le passage qui le montre ; signale ce qui est flou. Réponds dans la langue de l'auteur.",
  ),
  (
    "interroger_personnage",
    "Interroger un personnage / Interview a character",
    "Le personnage répond, en restant dans ce que l'auteur a écrit. / The character answers from what the author wrote.",
    "Lis la fiche de {character} dans le projet MondoWrite {project} (read_card) et les scènes où il paraît. Réponds ensuite aux questions de l'auteur à la première personne, comme ce personnage, seulement avec ce que l'auteur a écrit. Ce que le texte ne dit pas, le personnage ne le sait pas ou ne veut pas le dire : dis-le plutôt que d'inventer. Si l'auteur veut garder une réponse, demande-lui avant de l'écrire dans la fiche. Réponds dans la langue de l'auteur.",
  ),
  (
    "point_du_projet",
    "Où en est le projet / Project status",
    "Ce qui avance et ce qui reste : statuts, « À faire », points à vérifier. / Status and to-dos.",
    "Fais le point sur le projet MondoWrite {project} : project_overview, todo_list et review. Dis en quelques lignes où en est l'écriture (scènes écrites, statuts, longueur), ce qui reste à faire, et les trois points qui méritent le plus l'attention de l'auteur. Ne modifie rien. Réponds dans la langue de l'auteur.",
  ),
];

fn prompts_list() -> Value {
  let project = json!({ "name": "project", "description": "Projet (titre), facultatif s'il n'y en a qu'un.", "required": false });
  Value::Array(
    PROMPTS
      .iter()
      .map(|(name, title, description, body)| {
        let mut arguments = vec![project.clone()];
        if body.contains("{range}") {
          arguments.push(json!({ "name": "range", "description": "Scènes : « 3-7 », un titre, ou vide pour tout.", "required": false }));
        }
        if body.contains("{character}") {
          arguments.push(json!({ "name": "character", "description": "Nom du personnage.", "required": true }));
        }
        json!({ "name": name, "title": title, "description": description, "arguments": arguments })
      })
      .collect(),
  )
}

fn prompt_get(name: &str, args: &Value) -> Option<Value> {
  let (_, title, description, body) = PROMPTS.iter().find(|p| p.0 == name)?;
  let arg = |k: &str| args.get(k).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
  let project = arg("project").map(|p| format!("« {p} »")).unwrap_or_default();
  let range = arg("range").map(|r| format!("les scènes {r}")).unwrap_or_else(|| "tout le récit".into());
  let character = arg("character").unwrap_or_else(|| "ce personnage".into());
  let text = body.replace("{project}", &project).replace("  ", " ").replace("{range}", &range).replace("{character}", &character);
  Some(json!({ "description": format!("{title} : {description}"), "messages": [{ "role": "user", "content": { "type": "text", "text": text } }] }))
}

/// Scènes désignées par un numéro, un intervalle (« 3-5 »), un identifiant ou un titre.
fn find_scenes(scenes: &[Value], wanted: &str) -> Vec<usize> {
  let num = |s: &str| s.trim().parse::<u64>().ok();
  let n_of = |s: &Value| s.get("n").and_then(Value::as_u64);
  if let Some((a, b)) = wanted.split_once('-').and_then(|(a, b)| Some((num(a)?, num(b)?))) {
    let (lo, hi) = (a.min(b), a.max(b));
    return (0..scenes.len()).filter(|&i| n_of(&scenes[i]).is_some_and(|n| n >= lo && n <= hi)).take(30).collect();
  }
  if let Some(n) = num(wanted) {
    return (0..scenes.len()).filter(|&i| n_of(&scenes[i]) == Some(n)).collect();
  }
  if let Some(i) = scenes.iter().position(|s| str_of(s, "/id") == wanted) {
    return vec![i];
  }
  let f = fold(wanted);
  if let Some(i) = scenes.iter().position(|s| fold(str_of(s, "/title")) == f) {
    return vec![i];
  }
  scenes.iter().position(|s| fold(str_of(s, "/title")).contains(&f)).into_iter().collect()
}

/// Passages qui contiennent `q` (déjà replié) : un extrait par paragraphe, avec le nombre d'occurrences.
fn excerpts(text: &str, q: &str) -> Vec<(String, usize)> {
  let mut out = Vec::new();
  for para in text.split('\n').filter(|p| !p.trim().is_empty()) {
    let folded = fold(para);
    let count = folded.matches(q).count();
    if count == 0 {
      continue;
    }
    // Le repli garde le nombre de caractères sauf pour quelques ligatures : on se repère en caractères, au mieux.
    let chars: Vec<char> = para.chars().collect();
    let at = folded.find(q).map(|b| folded[..b].chars().count()).unwrap_or(0).min(chars.len());
    let start = at.saturating_sub(80);
    let end = (at + q.chars().count() + 80).min(chars.len());
    let mut excerpt: String = chars[start..end].iter().collect();
    excerpt = excerpt.split_whitespace().collect::<Vec<_>>().join(" ");
    if start > 0 {
      excerpt = format!("…{excerpt}");
    }
    if end < chars.len() {
      excerpt.push('…');
    }
    out.push((excerpt, count));
  }
  out
}

/// Coupe une réponse trop longue, à la fin d'une ligne.
fn clip(text: String) -> String {
  if text.len() <= MAX_CHARS {
    return text;
  }
  let mut cut = MAX_CHARS;
  while !text.is_char_boundary(cut) {
    cut -= 1;
  }
  let cut = text[..cut].rfind('\n').unwrap_or(cut);
  format!("{}\n\n[… réponse coupée : demande moins de scènes à la fois. / Truncated: ask for fewer scenes.]", &text[..cut])
}

/// Boucle du serveur : un message JSON par ligne sur l'entrée standard, une réponse par ligne sur la sortie.
pub fn serve() {
  let Some(dir) = mcp_dir() else {
    eprintln!("MondoWrite MCP : dossier privé introuvable");
    return;
  };
  let server = Server::new(dir);
  let stdin = std::io::stdin();
  let mut stdout = std::io::stdout();
  for line in stdin.lock().lines() {
    let Ok(line) = line else { break };
    if line.trim().is_empty() {
      continue;
    }
    let reply = match serde_json::from_str::<Value>(&line) {
      Ok(Value::Array(batch)) => {
        let replies: Vec<Value> = batch.iter().filter_map(|m| server.handle(m)).collect();
        (!replies.is_empty()).then(|| Value::Array(replies))
      }
      Ok(msg) => server.handle(&msg),
      Err(_) => Some(json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "JSON illisible" } })),
    };
    if let Some(reply) = reply {
      if writeln!(stdout, "{reply}").and_then(|_| stdout.flush()).is_err() {
        break;
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn snapshot() -> Value {
    json!({
      "format": 1, "app": "1.28.0", "savedAt": "2026-11-09T17:40:00.000Z",
      "project": { "title": "Le Phare", "kind": "roman", "kindLabel": "Roman", "logline": "Une gardienne et un secret.", "labels": { "logline": "Logline" } },
      "scenes": [
        { "n": 1, "id": "s1", "title": "L'arrivée", "part": "Chapitre 1", "synopsis": "Inès arrive.", "status": "Brouillon", "words": 5, "text": "Inès monte l'escalier du phare." },
        { "n": 2, "id": "s2", "title": "La tempête", "part": "Chapitre 1", "words": 3, "text": "La mer gronde." }
      ],
      "cards": [
        { "id": "c1", "type": "personnage", "typeLabel": "Personnage", "title": "Inès Morvan", "summary": "Gardienne", "fiche": { "Âge": "34 ans" }, "notes": "Ne supporte pas le silence.", "links": [{ "id": "c2", "title": "Le phare", "label": "garde" }], "scenes": [1] },
        { "id": "c2", "type": "lieu", "typeLabel": "Lieu", "title": "Le phare", "notes": "" }
      ]
    })
  }

  fn server() -> (Server, PathBuf) {
    let dir = std::env::temp_dir().join(format!("mondowrite-mcp-test-{}-{}", std::process::id(), rand_suffix()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("p0000000aaaaaaa.json"), snapshot().to_string()).unwrap();
    (Server::new(dir.clone()), dir)
  }

  fn rand_suffix() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
  }

  fn call(s: &Server, name: &str, args: Value) -> (String, bool) {
    let reply = s.handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": name, "arguments": args } })).unwrap();
    (reply["result"]["content"][0]["text"].as_str().unwrap().to_string(), reply["result"]["isError"].as_bool().unwrap())
  }

  #[test]
  fn cle_verifiee() {
    assert!(is_key("p0000000aaaaaaa"));
    assert!(!is_key("../../etc/passwd"));
    assert!(!is_key("p0000000aaaaaa"));
    assert!(!is_key("P0000000AAAAAAA"));
  }

  #[test]
  fn initialise_et_liste_les_outils() {
    let (s, _) = server();
    let init = s.handle(&json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "protocolVersion": "2025-06-18" } })).unwrap();
    assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
    let unknown = s.handle(&json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "protocolVersion": "1999-01-01" } })).unwrap();
    assert_eq!(unknown["result"]["protocolVersion"], PROTOCOLS[0]);
    assert!(s.handle(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none());
    let tools = s.handle(&json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).unwrap();
    assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 6 + WRITE_TOOLS.len() + LIVE_TOOLS.len());
  }

  #[test]
  fn lecture_notee_pour_la_pastille() {
    let (s, dir) = server();
    s.handle(&json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "clientInfo": { "name": "Claude" } } }));
    assert!(!dir.join(SEEN_DIR).join("p0000000aaaaaaa").exists());
    call(&s, "project_overview", json!({}));
    let seen: Value = serde_json::from_str(&std::fs::read_to_string(dir.join(SEEN_DIR).join("p0000000aaaaaaa")).unwrap()).unwrap();
    assert_eq!(seen["client"], "Claude");
    assert!(seen["at"].as_u64().unwrap() > 0);
  }

  #[test]
  fn outils_de_lecture() {
    let (s, _) = server();
    let (text, err) = call(&s, "project_overview", json!({}));
    assert!(!err);
    assert!(text.contains("# Le Phare") && text.contains("1. L'arrivée") && text.contains("Inès arrive."));
    let (text, _) = call(&s, "read_scene", json!({ "scenes": "1-2" }));
    assert!(text.contains("escalier") && text.contains("La mer gronde."));
    let (text, _) = call(&s, "read_scene", json!({ "scenes": "tempete" }));
    assert!(text.contains("La mer gronde.") && !text.contains("escalier"));
    let (_, err) = call(&s, "read_scene", json!({ "scenes": "9" }));
    assert!(err);
    let (text, _) = call(&s, "read_card", json!({ "card": "ines" }));
    assert!(text.contains("34 ans") && text.contains("Le phare (garde)") && text.contains("1. L'arrivée"));
    let (text, _) = call(&s, "list_cards", json!({ "type": "lieu" }));
    assert!(text.contains("Le phare") && !text.contains("Inès"));
    let (text, _) = call(&s, "search", json!({ "query": "PHARE" }));
    assert!(text.contains("escalier du phare"));
    let (_, err) = call(&s, "read_card", json!({ "project": "Autre", "card": "x" }));
    assert!(err);
  }

  #[test]
  fn configuration_fusionnee_sans_rien_perdre() {
    let entry = json!({ "command": "/Applications/MondoWrite.app/Contents/MacOS/MondoWrite", "args": ["--mcp"] });
    let merged = merge_config(Some(r#"{"mcpServers":{"autre":{"command":"x"}},"theme":"dark"}"#), entry.clone()).unwrap();
    let v: Value = serde_json::from_str(&merged).unwrap();
    assert_eq!(v["theme"], "dark");
    assert_eq!(v["mcpServers"]["autre"]["command"], "x");
    assert_eq!(v["mcpServers"]["mondowrite"], entry);
    assert!(merge_config(Some("pas du json"), entry.clone()).is_err());
    assert!(merge_config(None, entry).is_ok());
  }

  #[test]
  fn repli_sans_accents() {
    assert_eq!(fold("Inès MORVAN, l’Œuvre"), "ines morvan, l'oeuvre");
  }

  #[test]
  fn ecriture_refusee_sans_acces_ni_app_ouverte() {
    let (s, dir) = server();
    // Instantané en lecture seule.
    let (text, err) = call(&s, "create_card", json!({ "type": "lieu", "title": "La crique" }));
    assert!(err && text.contains("lecture seule"));
    // En écriture mais app fermée (pas de battement).
    let mut snap = snapshot();
    snap["project"]["access"] = json!("write");
    std::fs::write(dir.join("p0000000aaaaaaa.json"), snap.to_string()).unwrap();
    let (text, err) = call(&s, "create_card", json!({ "type": "lieu", "title": "La crique" }));
    assert!(err && text.contains("Ouvre"));
  }

  #[test]
  fn ecriture_transmise_a_l_app() {
    let (mut s, dir) = server();
    s.answer_ms = 3000;
    let mut snap = snapshot();
    snap["project"]["access"] = json!("write");
    std::fs::write(dir.join("p0000000aaaaaaa.json"), snap.to_string()).unwrap();
    std::fs::create_dir_all(dir.join(LIVE_DIR)).unwrap();
    std::fs::write(dir.join(LIVE_DIR).join("p0000000aaaaaaa"), now_ms().to_string()).unwrap();
    // L'app : prend la demande et répond.
    let queue = dir.join(QUEUE_DIR).join("p0000000aaaaaaa");
    let app = std::thread::spawn(move || {
      for _ in 0..50 {
        std::thread::sleep(std::time::Duration::from_millis(50));
        let Ok(entries) = std::fs::read_dir(&queue) else { continue };
        for e in entries.flatten() {
          let name = e.file_name().to_string_lossy().to_string();
          if let Some(id) = name.strip_prefix("req-").and_then(|r| r.strip_suffix(".json")) {
            let req: Value = serde_json::from_str(&std::fs::read_to_string(e.path()).unwrap()).unwrap();
            assert_eq!(req["tool"], "create_card");
            assert_eq!(req["args"]["title"], "La crique");
            assert!(req["args"].get("project").is_none());
            std::fs::remove_file(e.path()).unwrap();
            std::fs::write(queue.join(format!("res-{id}.json")), json!({ "ok": true, "text": "Carte créée." }).to_string()).unwrap();
            return;
          }
        }
      }
    });
    let (text, err) = call(&s, "create_card", json!({ "type": "lieu", "title": "La crique", "project": "Le Phare" }));
    app.join().unwrap();
    assert!(!err, "{text}");
    assert_eq!(text, "Carte créée.");
  }

  #[test]
  fn lecture_par_l_app_en_lecture_seule() {
    let (mut s, dir) = server();
    s.answer_ms = 3000;
    // Instantané en lecture seule : une écriture est refusée, une lecture faite par l'app passe.
    let (text, err) = call(&s, "create_card", json!({ "type": "lieu", "title": "X" }));
    assert!(err && text.contains("lecture seule"), "{text}");
    std::fs::create_dir_all(dir.join(LIVE_DIR)).unwrap();
    let (text, err) = call(&s, "todo_list", json!({}));
    assert!(err && text.contains("Ouvre"), "{text}");
    std::fs::write(dir.join(LIVE_DIR).join("p0000000aaaaaaa"), now_ms().to_string()).unwrap();
    let queue = dir.join(QUEUE_DIR).join("p0000000aaaaaaa");
    let app = std::thread::spawn(move || {
      for _ in 0..50 {
        std::thread::sleep(std::time::Duration::from_millis(50));
        let Ok(entries) = std::fs::read_dir(&queue) else { continue };
        for e in entries.flatten() {
          let name = e.file_name().to_string_lossy().to_string();
          if let Some(id) = name.strip_prefix("req-").and_then(|r| r.strip_suffix(".json")) {
            std::fs::remove_file(e.path()).unwrap();
            std::fs::write(queue.join(format!("res-{id}.json")), json!({ "ok": true, "text": "Rien dans « À faire »." }).to_string()).unwrap();
            return;
          }
        }
      }
    });
    let (text, err) = call(&s, "todo_list", json!({}));
    app.join().unwrap();
    assert!(!err, "{text}");
    assert!(text.contains("À faire"));
  }

  #[test]
  fn consignes_pretes() {
    let (s, _dir) = server();
    let list = s.handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "prompts/list" })).unwrap();
    let prompts = list["result"]["prompts"].as_array().unwrap();
    assert_eq!(prompts.len(), PROMPTS.len());
    let got = s.handle(&json!({ "jsonrpc": "2.0", "id": 2, "method": "prompts/get", "params": { "name": "interroger_personnage", "arguments": { "character": "Inès", "project": "Le Phare" } } })).unwrap();
    let text = got["result"]["messages"][0]["content"]["text"].as_str().unwrap();
    assert!(text.contains("Inès") && text.contains("« Le Phare »") && !text.contains('{'));
    let bad = s.handle(&json!({ "jsonrpc": "2.0", "id": 3, "method": "prompts/get", "params": { "name": "rien" } })).unwrap();
    assert!(bad.get("error").is_some());
  }

  #[test]
  fn identifiant_de_demande_verifie() {
    assert!(is_request_id("1731171717-42"));
    assert!(!is_request_id("../x"));
    assert!(!is_request_id(""));
  }
}
