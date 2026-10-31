// Apple Foundation Models (iOS 26, macOS 26 et après) : le modèle d'Apple Intelligence, sur l'appareil.
// Gratuit, sans clé, hors ligne : rien ne quitte l'appareil.
//
// Trois fonctions C appelées par Rust (src-tauri/src/apple_fm.rs) :
// - mw_fm_availability() -> code de disponibilité (voir AVAILABILITY) ;
// - mw_fm_complete(id, consigne, message, jetons, rappel) : lance une réponse, le rappel reçoit (id, code, texte)
//   depuis un autre fil ; le texte n'est valable que pendant l'appel du rappel ;
// - mw_fm_cancel(id) : annule la réponse en cours (Task.cancel, le rappel reçoit alors le code « annulé »).
//
// Compile avec un SDK plus ancien (Xcode 16) : sans FoundationModels, les trois fonctions répondent « absent ».
// Sur un système plus ancien que 26, le framework est lié en faible et le code du modèle n'est jamais atteint.
// Intel (x86_64) : pas d'Apple Intelligence, le code du modèle n'est pas compilé.

import Foundation

#if canImport(FoundationModels) && arch(arm64)
import FoundationModels
#endif

// Codes de disponibilité (lus par apple_fm.rs) :
// 0 disponible, 1 Apple Intelligence désactivée, 2 appareil non pris en charge, 3 modèle pas prêt
// (téléchargement en cours), 4 système trop ancien, 5 app construite sans le framework, 6 autre raison.

// Codes de réponse (lus par apple_fm.rs) :
// 0 réussi (texte = réponse), 1 annulé, 2 contexte dépassé, 3 refusé par les garde-fous d'Apple,
// 4 langue non prise en charge, 5 modèle pas disponible, 6 trop de demandes à la fois, 9 autre erreur (texte = message).

public typealias MWFMCallback = @convention(c) (UInt64, Int32, UnsafePointer<CChar>?) -> Void

@_cdecl("mw_fm_availability")
public func mwFmAvailability() -> Int32 {
  #if canImport(FoundationModels) && arch(arm64)
  if #available(iOS 26.0, macOS 26.0, *) {
    return MWFoundationModels.availability()
  }
  return 4
  #else
  return 5
  #endif
}

@_cdecl("mw_fm_complete")
public func mwFmComplete(_ id: UInt64, _ system: UnsafePointer<CChar>, _ user: UnsafePointer<CChar>, _ maxTokens: Int32, _ callback: MWFMCallback) {
  // Copies faites tout de suite : les chaînes de Rust ne vivent que pendant cet appel.
  let systemText = String(cString: system)
  let userText = String(cString: user)
  #if canImport(FoundationModels) && arch(arm64)
  if #available(iOS 26.0, macOS 26.0, *) {
    MWFoundationModels.complete(id: id, system: systemText, user: userText, maxTokens: Int(maxTokens), callback: callback)
    return
  }
  #endif
  _ = (systemText, userText, maxTokens)
  reply(callback, id, 5, "")
}

@_cdecl("mw_fm_cancel")
public func mwFmCancel(_ id: UInt64) {
  #if canImport(FoundationModels) && arch(arm64)
  if #available(iOS 26.0, macOS 26.0, *) {
    MWFoundationModels.cancel(id: id)
  }
  #endif
}

/// Rappel vers Rust, texte passé en chaîne C le temps de l'appel.
private func reply(_ callback: MWFMCallback, _ id: UInt64, _ code: Int32, _ text: String) {
  text.withCString { callback(id, code, $0) }
}

#if canImport(FoundationModels) && arch(arm64)
@available(iOS 26.0, macOS 26.0, *)
private enum MWFoundationModels {
  private static let lock = NSLock()
  private static var tasks: [UInt64: Task<Void, Never>] = [:]

  static func availability() -> Int32 {
    let availability = SystemLanguageModel.default.availability
    if case .available = availability { return 0 }
    if case .unavailable(let reason) = availability {
      switch reason {
      case .appleIntelligenceNotEnabled: return 1
      case .deviceNotEligible: return 2
      case .modelNotReady: return 3
      @unknown default: return 6
      }
    }
    return 6
  }

  static func complete(id: UInt64, system: String, user: String, maxTokens: Int, callback: MWFMCallback) {
    // Tâche créée et rangée sous le verrou : `forget`, en fin de tâche, attend qu'elle soit rangée.
    lock.lock()
    defer { lock.unlock() }
    tasks[id] = Task.detached(priority: .userInitiated) {
      defer { forget(id) }
      guard case .available = SystemLanguageModel.default.availability else {
        reply(callback, id, 5, "")
        return
      }
      do {
        // Une session par demande : chaque action de MondoWrite envoie tout ce qu'il faut, sans historique.
        let session = LanguageModelSession(instructions: system)
        let options = GenerationOptions(temperature: 0.3, maximumResponseTokens: max(64, maxTokens))
        let response = try await session.respond(to: user, options: options)
        if Task.isCancelled {
          reply(callback, id, 1, "")
        } else {
          reply(callback, id, 0, response.content)
        }
      } catch is CancellationError {
        reply(callback, id, 1, "")
      } catch let error as LanguageModelSession.GenerationError {
        reply(callback, id, code(of: error), error.localizedDescription)
      } catch {
        reply(callback, id, Task.isCancelled ? 1 : 9, error.localizedDescription)
      }
    }
  }

  static func cancel(id: UInt64) {
    lock.lock()
    let task = tasks[id]
    lock.unlock()
    task?.cancel()
  }

  private static func forget(_ id: UInt64) {
    lock.lock()
    tasks[id] = nil
    lock.unlock()
  }

  private static func code(of error: LanguageModelSession.GenerationError) -> Int32 {
    if case .exceededContextWindowSize = error { return 2 }
    if case .guardrailViolation = error { return 3 }
    if case .unsupportedLanguageOrLocale = error { return 4 }
    if case .assetsUnavailable = error { return 5 }
    if case .rateLimited = error { return 6 }
    return 9
  }
}
#endif
