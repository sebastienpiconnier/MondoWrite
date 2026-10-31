// Apple Foundation Models (lot 1.10.0) : le modèle d'Apple Intelligence sur l'appareil (iOS 26, macOS 26 et après),
// sixième service d'IA. Gratuit, sans clé, hors ligne : la consigne et le texte vont du WebView au pont Swift de
// l'app (commandes Tauri `fm_*`, src-tauri/src/apple_fm.rs), jamais sur le réseau.
// Hors de l'app (navigateur), sur Windows, Linux, Android ou un Mac Intel, le service est « unsupported » et
// n'apparaît pas dans les Réglages.

import { getT } from "../i18n";
import { isTauri } from "../platform";
import { fitReply } from "./limits";
import { AiError, type ChatOptions } from "./providers";

/** Disponibilité du modèle (codes de fm_availability). */
export type FmAvailability = "available" | "notEnabled" | "notEligible" | "notReady" | "osTooOld" | "unsupported" | "other";
const AVAILABILITY: FmAvailability[] = ["available", "notEnabled", "notEligible", "notReady", "osTooOld", "unsupported", "other"];

/** Réponse de fm_availability ; une valeur inconnue vaut « other », une absence « unsupported ». */
export function readAvailability(raw: unknown): FmAvailability {
  if (raw === null || raw === undefined) return "unsupported";
  return AVAILABILITY.includes(raw as FmAvailability) ? (raw as FmAvailability) : "other";
}

/**
 * Le service a-t-il sa place dans les Réglages ? Prêt : proposé ; Apple Intelligence désactivée, modèle pas prêt ou
 * autre raison passagère : grisé, avec la raison (l'auteur peut y remédier). Appareil non pris en charge, système
 * trop ancien, ou pas de pont (navigateur, Windows, Linux, Android, Mac Intel) : absent, pour ne pas encombrer la liste.
 */
export const isOffered = (a: FmAvailability) => a === "available" || a === "notEnabled" || a === "notReady" || a === "other";

let asked: Promise<FmAvailability> | null = null;

/**
 * Disponibilité du modèle sur cet appareil. Hors de l'app : « unsupported », sans rien demander. La réponse
 * « notReady » (téléchargement du modèle) change : `fresh` redemande (ouverture des Réglages).
 */
export function appleAvailability(fresh = false): Promise<FmAvailability> {
  if (!isTauri()) return Promise.resolve("unsupported");
  if (!asked || fresh) {
    asked = import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("fm_availability"))
      .then(readAvailability)
      .catch(() => "unsupported" as const);
  }
  return asked;
}

/** Codes d'erreur de fm_complete. */
export type FmErrorCode = "cancelled" | "context" | "guardrail" | "language" | "unavailable" | "busy" | "other";
const FM_ERRORS: FmErrorCode[] = ["cancelled", "context", "guardrail", "language", "unavailable", "busy", "other"];

/** Erreur rendue par fm_complete (`{ code, message }`), lue prudemment. */
export function readFmError(raw: unknown): { code: FmErrorCode; message: string } {
  const data = raw && typeof raw === "object" ? (raw as { code?: unknown; message?: unknown }) : null;
  const code = FM_ERRORS.includes(data?.code as FmErrorCode) ? (data!.code as FmErrorCode) : "other";
  const message = typeof data?.message === "string" ? data.message.replace(/\s+/g, " ").trim().slice(0, 240) : typeof raw === "string" ? raw.slice(0, 240) : "";
  return { code, message };
}

/** Erreur pour l'auteur : le code commun (Annuler, délai) et, pour le reste, la phrase propre au modèle d'Apple. */
export function appleError(code: FmErrorCode | "tooLong", message = ""): AiError {
  if (code === "cancelled") return new AiError("cancelled", message);
  const t = getT().apple.errors;
  const error = new AiError(code === "busy" ? "limit" : "other", message || code);
  error.text = t[code];
  return error;
}

/** Délai d'une réponse : le modèle est rapide, mais un appareil chargé peut traîner. */
const APPLE_TIMEOUT_MS = 120_000;
let nextId = 1;

/** Réponse du modèle d'Apple (voir `complete` de providers.ts). Pas d'images (refusées plus tôt, `allows`). */
export async function appleComplete(system: string, user: string, options: ChatOptions = {}): Promise<string> {
  const maxTokens = fitReply("apple", system, user, options.maxTokens ?? 1500);
  if (maxTokens === null) throw appleError("tooLong");
  if (!isTauri()) throw appleError("unavailable");
  const { invoke } = await import("@tauri-apps/api/core");
  const id = nextId++;
  const { signal } = options;
  if (signal?.aborted) throw new AiError("cancelled");
  let stop: "cancelled" | "timeout" | null = null;
  let onStop: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    onStop = () => reject(stop === "timeout" ? new AiError("timeout") : new AiError("cancelled"));
  });
  const cancel = (why: "cancelled" | "timeout") => {
    if (stop) return;
    stop = why;
    void invoke("fm_cancel", { id }).catch(() => {});
    onStop();
  };
  const onAbort = () => cancel("cancelled");
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(() => cancel("timeout"), Math.max(APPLE_TIMEOUT_MS, options.timeoutMs ?? 0));
  try {
    const reply = await Promise.race([
      invoke<string>("fm_complete", { id, system, user, maxTokens }).catch((err: unknown) => {
        const { code, message } = readFmError(err);
        throw appleError(code, message);
      }),
      stopped,
    ]);
    const text = typeof reply === "string" ? reply.trim() : "";
    if (!text) throw new AiError("empty");
    return text;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
