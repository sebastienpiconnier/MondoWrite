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
/// L'app est tenue pour ouverte si son battement date de moins de tant de millisecondes.
const LIVE_MS: u128 = 8_000;
/// Attente d'une réponse de l'app au plus.
const ANSWER_MS: u64 = 20_000;
/// Outils d'écriture : transmis à l'app ouverte, qui les applique avec ses règles (marque « IA », journal, annulation).
const WRITE_TOOLS: [&str; 7] = ["create_card", "update_card", "link_cards", "add_question", "create_scene", "set_scene_synopsis", "write_scene"];

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
        return Ok(all.remove(0));
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
      Some(i) => Ok(all.remove(i)),
      None => Err(format!("Projet introuvable : « {wanted} ». / Project not found.\n{}", self.list_projects())),
    }
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
    let (key, v) = self.project(args)?;
    if str_of(&v, "/project/access") != "write" {
      return Err("Ce projet est ouvert à l'assistant en lecture seule. Dans MondoWrite : Réglages › Ce projet › « Lecture et écriture ». / This project is read only for the assistant.".into());
    }
    let live = std::fs::read_to_string(self.dir.join(LIVE_DIR).join(&key)).ok().and_then(|t| t.trim().parse::<u128>().ok());
    if !live.is_some_and(|at| now_ms().saturating_sub(at) < LIVE_MS) {
      return Err(format!("Ouvre « {} » dans MondoWrite : l'assistant n'écrit que dans un projet ouvert, pour que tout passe par l'app (annulation, marque IA, journal). / Open the project in MondoWrite first.", str_of(&v, "/project/title")));
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
    json!([
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
          "notes": { "type": "string", "description": "Texte de la carte, en Markdown." },
          "fields": { "type": "object", "additionalProperties": { "type": "string" }, "description": "Champs de la fiche, par libellé ou clé (Âge, Métier, Veut…)." }
        }, "required": ["type", "title"] }
      },
      {
        "name": "update_card",
        "description": "Modifie une carte : champs de la fiche, notes (ajout à la fin ou remplacement), titre. Marqué « IA », journalisé, annulable. / Updates a card's fields, notes or title.",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "card": { "type": "string", "description": "Titre ou identifiant." },
          "title": { "type": "string" },
          "fields": { "type": "object", "additionalProperties": { "type": "string" } },
          "notes": { "type": "string", "description": "Markdown." },
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
        "inputSchema": { "type": "object", "properties": { "project": project, "title": { "type": "string" }, "synopsis": { "type": "string" }, "text": { "type": "string", "description": "Markdown (roman) ou Fountain sans en-tête (scénario)." } }, "required": ["title"] }
      },
      {
        "name": "set_scene_synopsis",
        "description": "Écrit le synopsis d'une scène (une ou deux phrases). Marqué « IA ». / Sets a scene's synopsis.",
        "inputSchema": { "type": "object", "properties": { "project": project, "scene": { "type": "string", "description": "Numéro, identifiant ou titre." }, "synopsis": { "type": "string" } }, "required": ["scene", "synopsis"] }
      },
      {
        "name": "write_scene",
        "description": "Écrit le texte d'une scène : ajout à la fin ou remplacement. Roman : Markdown ; scénario : Fountain sans en-tête de scène. Le texte de l'IA reste marqué jusqu'à ce que l'auteur le reprenne ; avant un remplacement dans un roman, MondoWrite garde une version de la scène. / Writes a scene's text (append or replace), marked as AI.",
        "inputSchema": { "type": "object", "properties": {
          "project": project,
          "scene": { "type": "string", "description": "Numéro, identifiant ou titre." },
          "text": { "type": "string" },
          "mode": { "type": "string", "enum": ["append", "replace"], "description": "append par défaut." }
        }, "required": ["scene", "text"] }
      }
    ])
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
          "capabilities": { "tools": { "listChanged": false } },
          "serverInfo": { "name": SERVER_NAME, "title": "MondoWrite", "version": env!("CARGO_PKG_VERSION") },
          "instructions": "MondoWrite est le logiciel d'écriture de l'auteur (romans, scénarios). Ces outils lisent ses projets ; ceux d'écriture ne marchent que pour un projet que l'auteur a ouvert en écriture, et tout ce que tu écris est marqué « IA », journalisé et annulable. Commence par project_overview, puis lis seulement les scènes et les cartes utiles. Cite les scènes par leur numéro et leur titre. Le texte appartient à l'auteur : demande-lui avant d'écrire dans son projet, et préfère add_question pour signaler un doute. / MondoWrite is the author's writing app. These tools read their projects; writing tools work only for projects the author opened for writing, and everything you write is marked as AI, logged and undoable. Start with project_overview. Ask the author before writing."
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
      "prompts/list" => json!({ "prompts": [] }),
      _ => return Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("Méthode inconnue : {method}") } })),
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
  }
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
    assert_eq!(tools["result"]["tools"].as_array().unwrap().len(), 6 + WRITE_TOOLS.len());
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
  fn identifiant_de_demande_verifie() {
    assert!(is_request_id("1731171717-42"));
    assert!(!is_request_id("../x"));
    assert!(!is_request_id(""));
  }
}
