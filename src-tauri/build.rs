fn main() {
  apple_fm();
  tauri_build::build()
}

/// Apple Foundation Models (modèle d'Apple Intelligence sur l'appareil, iOS 26 et macOS 26) : le petit paquet Swift
/// `apple/MondoWriteFM` est compilé par swift-rs (comme Tauri le fait pour les plugins iOS) et lié en bibliothèque
/// statique, sur Mac et iPhone/iPad Apple Silicon seulement, et seulement si le SDK d'Xcode connaît le framework
/// (Xcode 26 et après). Sinon rien n'est compilé, `mondowrite_fm` n'est pas posé et les commandes de lib.rs
/// répondent « non pris en charge » : le service n'apparaît pas. `MONDOWRITE_NO_FM=1` coupe le pont (secours).
fn apple_fm() {
  println!("cargo::rustc-check-cfg=cfg(mondowrite_fm)");
  println!("cargo:rerun-if-env-changed=MONDOWRITE_NO_FM");
  println!("cargo:rerun-if-changed=apple/MondoWriteFM/Package.swift");
  println!("cargo:rerun-if-changed=apple/MondoWriteFM/Sources");
  #[cfg(target_os = "macos")]
  mac::link();
}

#[cfg(target_os = "macos")]
mod mac {
  use std::env;
  use std::path::Path;
  use std::process::Command;

  /// Version la plus haute des deux (« 10.13 » et « 10.15 » donnent « 10.15 »).
  fn at_least(value: Option<String>, floor: &str) -> String {
    let parse = |v: &str| v.split('.').map(|n| n.parse::<u32>().unwrap_or(0)).collect::<Vec<_>>();
    match value {
      Some(v) if parse(&v) >= parse(floor) => v,
      _ => floor.to_string(),
    }
  }

  pub fn link() {
    let os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    if !(os == "macos" || os == "ios") || arch != "aarch64" || env::var_os("MONDOWRITE_NO_FM").is_some() {
      return;
    }
    let target = env::var("TARGET").unwrap_or_default();
    let sdk = match os.as_str() {
      "macos" => "macosx",
      _ if target.ends_with("-sim") => "iphonesimulator",
      _ => "iphoneos",
    };
    // Le framework est-il dans le SDK ? (Xcode 16 et avant : non, on ne compile rien.)
    let Some(sdk_path) = Command::new("xcrun")
      .args(["--sdk", sdk, "--show-sdk-path"])
      .output()
      .ok()
      .filter(|o| o.status.success())
      .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    else {
      println!("cargo:warning=Apple Foundation Models : SDK {sdk} introuvable, service absent de cette version.");
      return;
    };
    if !Path::new(&sdk_path).join("System/Library/Frameworks/FoundationModels.framework").exists() {
      println!("cargo:warning=Apple Foundation Models : le SDK ({sdk_path}) n'a pas le framework (Xcode 26 requis), service absent de cette version.");
      return;
    }

    // Comme tauri-utils (link_swift_library) : SDKROOT, posé par Xcode pour iOS, gênerait `swift build`.
    let sdk_root = env::var_os("SDKROOT");
    unsafe { env::remove_var("SDKROOT") };
    swift_rs::SwiftLinker::new(&at_least(env::var("MACOSX_DEPLOYMENT_TARGET").ok(), "10.15"))
      .with_ios(&at_least(env::var("IPHONEOS_DEPLOYMENT_TARGET").ok(), "14.0"))
      .with_package("MondoWriteFM", "apple/MondoWriteFM")
      .link();
    if let Some(root) = sdk_root {
      unsafe { env::set_var("SDKROOT", root) };
    }

    // Lien faible : l'app se lance sur un système sans le framework (macOS 15 et avant). L'éditeur de liens le fait
    // déjà quand tous les symboles du framework sont plus récents que la cible (c'est le cas : @available 26), on le
    // demande en plus sur Mac, où Cargo fait l'édition des liens. Sur iOS, c'est Xcode qui lie (voir docs/ios.md).
    if os == "macos" {
      println!("cargo:rustc-link-arg=-Wl,-weak_framework,FoundationModels");
      // La concurrence de Swift (async/await) n'est dans le système qu'à partir de macOS 12 : liée en faible, l'app
      // se lance encore sur macOS 11 (le pont n'y est jamais appelé au-delà de « système trop ancien »).
      let swift_lib = Path::new(&sdk_path).join("usr/lib/swift");
      if swift_lib.join("libswift_Concurrency.tbd").exists() {
        println!("cargo:rustc-link-search=native={}", swift_lib.display());
        println!("cargo:rustc-link-arg=-Wl,-weak-lswift_Concurrency");
      }
    }
    println!("cargo:rustc-cfg=mondowrite_fm");
  }
}
