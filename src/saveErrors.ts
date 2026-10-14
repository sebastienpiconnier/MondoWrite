// Pourquoi un enregistrement a échoué, d'après l'erreur du système (Tauri renvoie le message de l'OS,
// en anglais, avec son code : « os error 28 ») ou du navigateur (quota). Fonction pure.

export type SaveErrorKind = "full" | "permission" | "missing" | "other";

/** Message d'erreur du système, quel que soit son emballage (Error, chaîne, objet). */
const textOf = (err: unknown): string => {
  if (err instanceof Error) return `${err.name} ${err.message}`;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

export function classifySaveError(err: unknown): SaveErrorKind {
  const text = textOf(err).toLowerCase();
  // Disque plein : ENOSPC (28) sous macOS et Linux, 112 et 39 sous Windows ; quota du navigateur.
  if (/no space left|not enough space|disk (is )?full|quota|os error (28|39|112)\b|enospc/.test(text)) return "full";
  // Dossier disparu : déplacé, renommé, supprimé, disque débranché (2 et 3 sous Windows).
  if (/project folder missing|no such file|cannot find the (path|file)|not found|os error (2|3|21)\b|enoent|device not configured|os error 6\b/.test(text)) return "missing";
  // Droits : refusés par le système, ou chemin hors de ce que Tauri autorise.
  if (/permission denied|access is denied|operation not permitted|forbidden path|not allowed|read-only|os error (1|5|13|30)\b|eacces|eperm|erofs/.test(text)) return "permission";
  return "other";
}

/** Message d'erreur posé par le stockage quand le dossier du projet n'existe plus. */
export const MISSING_FOLDER = "project folder missing";
