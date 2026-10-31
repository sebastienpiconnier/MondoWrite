// swift-tools-version:5.9
// Pont vers Apple Foundation Models (modèle d'Apple Intelligence sur l'appareil), compilé par build.rs
// (swift-rs) en bibliothèque statique liée à l'app, sur Mac et iPhone/iPad Apple Silicon seulement.
// Trois fonctions C (@_cdecl) : mw_fm_availability, mw_fm_complete, mw_fm_cancel (voir Sources).
import PackageDescription

let package = Package(
  name: "MondoWriteFM",
  // Les versions réelles viennent de la cible de Rust (build.rs) ; le code du modèle est gardé par
  // @available(iOS 26, macOS 26) et le framework est lié en faible : l'app tourne sur les systèmes plus anciens.
  platforms: [.macOS(.v10_15), .iOS(.v14)],
  products: [
    .library(name: "MondoWriteFM", type: .static, targets: ["MondoWriteFM"])
  ],
  targets: [
    .target(name: "MondoWriteFM", path: "Sources/MondoWriteFM")
  ]
)
