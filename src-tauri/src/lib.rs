/// Apple Foundation Models : modèle d'Apple Intelligence sur l'appareil (commandes fm_*, pont Swift sur Apple).
mod apple_fm;

/// Conteneur iCloud de l'app (déclaré dans les droits iOS, et dans ceux du Mac quand la Release est signée avec un
/// profil qui porte iCloud : voir docs/icloud-mac.md).
#[cfg(any(target_os = "ios", target_os = "macos"))]
const ICLOUD_CONTAINER: &str = "iCloud.app.cosmos.ecriture";

#[cfg(any(target_os = "ios", target_os = "macos"))]
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
/// Sur Mac, la demande fait connaître le conteneur au service iCloud du système, qui le télécharge alors dans chaque
/// session ; sans le droit iCloud (version de dev, Release sans profil), la réponse est None et l'app retombe sur le
/// chemin du conteneur sous ~/Library/Mobile Documents.
#[tauri::command]
async fn icloud_container(app: tauri::AppHandle) -> Option<String> {
  #[cfg(any(target_os = "ios", target_os = "macos"))]
  {
    use tauri_plugin_fs::FsExt;
    let docs = format!("{}/Documents", icloud::container(ICLOUD_CONTAINER)?);
    std::fs::create_dir_all(&docs).ok()?;
    app.fs_scope().allow_directory(&docs, true).ok()?;
    Some(docs)
  }
  #[cfg(not(any(target_os = "ios", target_os = "macos")))]
  {
    let _ = app;
    None
  }
}

/// Lance le téléchargement des fichiers iCloud pas encore présents sous `dir` (repères « .nom.icloud »)
/// et renvoie combien restent à venir. Seulement dans le conteneur iCloud de l'app (iPhone et iPad) :
/// ailleurs, rien n'est parcouru.
#[tauri::command]
async fn icloud_download(dir: String) -> usize {
  #[cfg(any(target_os = "ios", target_os = "macos"))]
  {
    // `count` : l'ouverture attend ces fichiers-là. Les images et PDF (medias/) sont demandés sans être attendus,
    // ils s'affichent quand ils arrivent ; les copies Markdown (markdown/, versions du jour comprises) ne sont
    // jamais relues par l'app : ni demandées ni attendues. Les compter faisait attendre l'ouverture jusqu'au bout.
    fn walk(dir: &std::path::Path, pending: &mut usize, depth: usize, count: bool) {
      // Profondeur bornée, et jamais de lien symbolique suivi (pas de boucle).
      if depth > 8 {
        return;
      }
      let Ok(entries) = std::fs::read_dir(dir) else { return };
      for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else { continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if kind.is_dir() {
          if depth == 0 && name == "markdown" {
            continue;
          }
          walk(&entry.path(), pending, depth + 1, count && !(depth == 0 && name == "medias"));
        } else if let Some(real) = name.strip_prefix('.').and_then(|n| n.strip_suffix(".icloud")) {
          if count {
            *pending += 1;
          }
          icloud::download(&dir.join(real).to_string_lossy());
        }
      }
    }
    // Seulement dans iCloud : le conteneur de l'app, ou (Mac) un dossier d'iCloud Drive choisi par l'auteur
    // (« Mobile Documents »), où « Optimiser le stockage » peut retirer des fichiers de l'appareil.
    let Ok(dir) = std::fs::canonicalize(&dir) else { return 0 };
    let in_container = icloud::container(ICLOUD_CONTAINER)
      .and_then(|root| std::fs::canonicalize(root).ok())
      .is_some_and(|root| dir.starts_with(&root));
    let in_drive = cfg!(target_os = "macos") && dir.components().any(|c| c.as_os_str() == "Mobile Documents");
    if !in_container && !in_drive {
      return 0;
    }
    let mut pending = 0;
    walk(&dir, &mut pending, 0, true);
    pending
  }
  #[cfg(not(any(target_os = "ios", target_os = "macos")))]
  {
    let _ = dir;
    0
  }
}

/// Dossier choisi dans l'app Fichiers (OneDrive, Dropbox, Drive…) : son chemin et le signet qui en garde l'accès.
#[derive(serde::Serialize)]
struct CloudFolder {
  path: String,
  /// Signet (octets en hexadécimal), à repasser à `cloud_restore` aux lancements suivants.
  bookmark: String,
}

#[cfg(target_os = "ios")]
mod cloud {
  use std::cell::RefCell;
  use std::sync::mpsc::Sender;

  use objc2::rc::Retained;
  use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
  use objc2::{define_class, msg_send, DefinedClass, MainThreadMarker, MainThreadOnly};
  use objc2_foundation::{NSArray, NSData, NSString, NSURL, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions};
  use objc2_ui_kit::{UIApplication, UIDocumentPickerDelegate, UIDocumentPickerViewController, UIViewController};
  use objc2_uniform_type_identifiers::UTType;

  /// (chemin, signet) du dossier choisi.
  pub type Picked = (String, Vec<u8>);

  pub struct Ivars {
    tx: RefCell<Option<Sender<Option<Picked>>>>,
  }

  impl Ivars {
    fn send(&self, value: Option<Picked>) {
      if let Some(tx) = self.tx.borrow_mut().take() {
        let _ = tx.send(value);
      }
    }
  }

  define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "MondoWriteFolderPickerDelegate"]
    #[ivars = Ivars]
    pub struct PickerDelegate;

    unsafe impl NSObjectProtocol for PickerDelegate {}

    unsafe impl UIDocumentPickerDelegate for PickerDelegate {
      #[unsafe(method(documentPicker:didPickDocumentsAtURLs:))]
      fn did_pick(&self, _controller: &UIDocumentPickerViewController, urls: &NSArray<NSURL>) {
        let picked = urls.firstObject().and_then(|url| access(&url));
        self.ivars().send(picked);
        release_delegate();
      }

      #[unsafe(method(documentPickerWasCancelled:))]
      fn was_cancelled(&self, _controller: &UIDocumentPickerViewController) {
        self.ivars().send(None);
        release_delegate();
      }
    }
  );

  impl PickerDelegate {
    fn new(mtm: MainThreadMarker, tx: Sender<Option<Picked>>) -> Retained<Self> {
      let this = mtm.alloc::<Self>().set_ivars(Ivars { tx: RefCell::new(Some(tx)) });
      unsafe { msg_send![super(this), init] }
    }
  }

  thread_local! {
    // Le sélecteur ne retient pas son délégué : on le garde en vie jusqu'à la réponse.
    static KEEP: RefCell<Option<Retained<PickerDelegate>>> = const { RefCell::new(None) };
  }

  fn release_delegate() {
    KEEP.with(|k| k.borrow_mut().take());
  }

  /// Ouvre l'accès au dossier (durée de vie de l'app) et en tire le chemin et un signet durable.
  #[allow(unused_unsafe)]
  fn access(url: &NSURL) -> Option<Picked> {
    unsafe {
      url.startAccessingSecurityScopedResource();
      let path = url.path()?.to_string();
      let data = url
        .bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(NSURLBookmarkCreationOptions(0), None, None)
        .ok()?;
      Some((path, data.to_vec()))
    }
  }

  /// Affiche le sélecteur de dossiers du système. À appeler sur le fil principal.
  pub fn present(mtm: MainThreadMarker, tx: Sender<Option<Picked>>) {
    let Some(folder) = UTType::typeWithIdentifier(&NSString::from_str("public.folder")) else {
      let _ = tx.send(None);
      return;
    };
    let delegate = PickerDelegate::new(mtm, tx.clone());
    let types = NSArray::from_retained_slice(&[folder]);
    let picker = UIDocumentPickerViewController::initForOpeningContentTypes(mtm.alloc(), &types);
    picker.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    let Some(top) = top_view_controller(mtm) else {
      let _ = tx.send(None);
      return;
    };
    KEEP.with(|k| *k.borrow_mut() = Some(delegate));
    top.presentViewController_animated_completion(&picker, true, None);
  }

  fn top_view_controller(mtm: MainThreadMarker) -> Option<Retained<UIViewController>> {
    let windows = UIApplication::sharedApplication(mtm).windows();
    let window = windows.iter().find(|w| w.isKeyWindow()).or_else(|| windows.firstObject())?;
    let mut top = window.rootViewController()?;
    while let Some(next) = top.presentedViewController() {
      top = next;
    }
    Some(top)
  }

  /// Retrouve le dossier d'après son signet et rouvre l'accès. Renvoie aussi un signet rafraîchi.
  #[allow(unused_unsafe)]
  pub fn resolve(bookmark: &[u8]) -> Option<Picked> {
    unsafe {
      let data = NSData::with_bytes(bookmark);
      let mut stale = objc2::runtime::Bool::NO;
      let url = NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(&data, NSURLBookmarkResolutionOptions(0), None, &mut stale).ok()?;
      let (path, fresh) = access(&url)?;
      Some((path, if stale.as_bool() { fresh } else { bookmark.to_vec() }))
    }
  }
}

#[cfg(target_os = "ios")]
fn to_hex(bytes: &[u8]) -> String {
  bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(target_os = "ios")]
fn from_hex(text: &str) -> Option<Vec<u8>> {
  if text.len() % 2 != 0 {
    return None;
  }
  (0..text.len()).step_by(2).map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok()).collect()
}

/// Ouvre le sélecteur de dossiers d'iOS (Fichiers : OneDrive, Dropbox, Drive, iCloud Drive…) et autorise le dossier choisi.
/// Renvoie None si l'auteur annule (ou hors iPhone et iPad).
#[tauri::command]
async fn cloud_pick_folder(app: tauri::AppHandle) -> Option<CloudFolder> {
  #[cfg(target_os = "ios")]
  {
    use tauri_plugin_fs::FsExt;
    let (tx, rx) = std::sync::mpsc::channel();
    app
      .run_on_main_thread(move || match objc2::MainThreadMarker::new() {
        Some(mtm) => cloud::present(mtm, tx),
        None => {
          let _ = tx.send(None);
        }
      })
      .ok()?;
    let (path, bookmark) = tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten()).await.ok()??;
    app.fs_scope().allow_directory(&path, true).ok()?;
    Some(CloudFolder { path, bookmark: to_hex(&bookmark) })
  }
  #[cfg(not(target_os = "ios"))]
  {
    let _ = app;
    None
  }
}

/// Rouvre l'accès à un dossier choisi plus tôt, d'après son signet. None si le dossier n'est plus accessible.
#[tauri::command]
async fn cloud_restore(app: tauri::AppHandle, bookmark: String) -> Option<CloudFolder> {
  #[cfg(target_os = "ios")]
  {
    use tauri_plugin_fs::FsExt;
    let (path, fresh) = cloud::resolve(&from_hex(&bookmark)?)?;
    app.fs_scope().allow_directory(&path, true).ok()?;
    Some(CloudFolder { path, bookmark: to_hex(&fresh) })
  }
  #[cfg(not(target_os = "ios"))]
  {
    let _ = (app, bookmark);
    None
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      icloud_container,
      icloud_download,
      cloud_pick_folder,
      cloud_restore,
      apple_fm::fm_availability,
      apple_fm::fm_complete,
      apple_fm::fm_cancel
    ])
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
