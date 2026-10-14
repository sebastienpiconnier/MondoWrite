// Typographie automatique pendant la frappe (manuscrit, cartes, Bible) : guillemets, apostrophe, points de
// suspension, tiret de dialogue et, en français, espaces insécables avant ; : ! ? et dans les guillemets.
// Fonction pure : elle reçoit le texte du paragraphe avant le curseur et le caractère tapé, et dit quoi
// écrire à la place. L'éditeur (editorKit) l'applique ; le scénario (Fountain) n'en a pas.

export type TypographyMode = "fr" | "en" | "off";
/** Réglage de l'appareil : « auto » suit la langue de l'interface. */
export type TypographySetting = TypographyMode | "auto";

export const isTypographySetting = (v: unknown): v is TypographySetting => v === "auto" || v === "fr" || v === "en" || v === "off";
export const typographyMode = (setting: TypographySetting, lang: string): TypographyMode =>
  setting === "auto" ? (lang.startsWith("fr") ? "fr" : "en") : setting;

/** Espace insécable (avant « : » et dans les guillemets) et espace fine insécable (avant ; ! ?). */
export const NBSP = " ";
export const NNBSP = " ";

export interface SmartEdit {
  /** Caractères à effacer juste avant le curseur. */
  remove: number;
  /** Texte à écrire à la place du caractère tapé. */
  insert: string;
}

const opensBefore = (before: string) => before === "" || /[\s([{  —–-]$/.test(before);
/** Un guillemet ouvrant n'a pas encore son fermant dans le paragraphe. */
const unclosed = (before: string, open: string, close: string) => before.split(open).length - 1 > before.split(close).length - 1;

/** Ce que devient le caractère tapé, ou null s'il reste tel quel. */
export function smartType(before: string, typed: string, mode: TypographyMode): SmartEdit | null {
  if (mode === "off" || typed.length !== 1) return null;

  // Points de suspension : le troisième point.
  if (typed === "." && before.endsWith("..")) return { remove: 2, insert: "…" };
  // Deux traits d'union : un tiret (tiret de dialogue en début de paragraphe).
  if (typed === "-" && before.endsWith("-") && !before.endsWith("--")) return { remove: 1, insert: "—" };
  // Apostrophe typographique.
  if (typed === "'") return { remove: 0, insert: mode === "en" && opensBefore(before) ? "‘" : "’" };

  if (mode === "en") {
    if (typed === '"') return { remove: 0, insert: unclosed(before, "“", "”") || !opensBefore(before) ? "”" : "“" };
    return null;
  }

  // Français : guillemets « » avec leurs espaces insécables.
  if (typed === '"') {
    if (unclosed(before, "«", "»")) {
      const spaces = before.match(/[   ]*$/)![0].length;
      return { remove: spaces, insert: `${NBSP}»` };
    }
    return opensBefore(before) ? { remove: 0, insert: `«${NBSP}` } : { remove: 0, insert: `${NBSP}»` };
  }
  // Une espace tapée juste après « (qui a déjà la sienne) : rien de plus.
  if (typed === " " && before.endsWith(`«${NBSP}`)) return { remove: 0, insert: "" };
  // Ponctuation haute : l'espace qui la précède devient insécable (fine pour ; ! ?), et elle est ajoutée
  // après un mot. Jamais deux fois (« ?! »), ni après une espace insécable déjà là.
  if (typed === ";" || typed === "!" || typed === "?" || typed === ":") {
    const space = typed === ":" ? NBSP : NNBSP;
    if (before.endsWith(" ")) return { remove: 1, insert: `${space}${typed}` };
    // Deux-points collé à un mot : on le laisse (heure 12:30, adresse http:).
    if (typed !== ":" && /[\p{L}\p{N}»…)]$/u.test(before)) return { remove: 0, insert: `${space}${typed}` };
  }
  return null;
}
