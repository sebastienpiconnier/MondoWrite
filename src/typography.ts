// Typographie automatique pendant la frappe (manuscrit, cartes, Bible) : guillemets, apostrophe, points de
// suspension, tiret de dialogue et, en français, espaces insécables avant ; : ! ? et dans les guillemets.
// Les règles de chaque langue sont dans typoRules.ts (guillemets „ “ de l'allemand, » « du danois…).
// Fonction pure : elle reçoit le texte du paragraphe avant le curseur et le caractère tapé, et dit quoi
// écrire à la place. L'éditeur (editorKit) l'applique ; le scénario (Fountain) n'en a pas.

import { NBSP, NNBSP, TYPO_RULES, typoCode, typoRules, type HighPunct, type TypoRules } from "./typoRules";

/** Langue dont on suit les règles (clé de TYPO_RULES), ou aucune typographie. */
export type TypographyMode = string;
/** Réglage de l'appareil : « auto » suit la langue de l'interface, « off » ne touche à rien, sinon une langue. */
export type TypographySetting = "auto" | "off" | string;

export const isTypographySetting = (v: unknown): v is TypographySetting =>
  v === "auto" || v === "off" || (typeof v === "string" && v in TYPO_RULES);
export const typographyMode = (setting: TypographySetting, lang: string): TypographyMode =>
  setting === "auto" ? typoCode(lang) : setting === "off" ? "off" : typoCode(setting);

export { NBSP, NNBSP };

export interface SmartEdit {
  /** Caractères à effacer juste avant le curseur. */
  remove: number;
  /** Texte à écrire à la place du caractère tapé. */
  insert: string;
}

/** Le caractère tapé ouvre : début du paragraphe, après une espace, une parenthèse, un tiret ou un guillemet ouvrant. */
function opensBefore(before: string, rules: TypoRules): boolean {
  if (before === "" || /[\s([{\u00a0\u202f—–-]$/.test(before)) return true;
  const last = before.slice(-1);
  return (last === rules.quotes[0] && rules.quotes[0] !== rules.quotes[1]) || (last === rules.inner[0] && rules.inner[0] !== rules.inner[1]);
}
const count = (text: string, mark: string) => text.split(mark).length - 1;
/** Un guillemet ouvrant n'a pas encore son fermant dans le paragraphe (même signe des deux côtés : parité). */
const unclosed = (before: string, open: string, close: string) =>
  open === close ? count(before, open) % 2 === 1 : count(before, open) > count(before, close);

/**
 * Le curseur est dans une adresse ou du code : le mot en cours commence par http ou www., contient « :// »,
 * « / », « @ », « \\ », « = », ou un point collé à une lettre (site.fr), ou bien un « ` » est resté ouvert.
 * Rien n'y est remplacé : « ? », « ! » et « -- » cassaient une adresse ou une option qu'on tape.
 */
export function inAddressOrCode(before: string): boolean {
  if ((before.match(/`/g)?.length ?? 0) % 2 === 1) return true;
  const word = before.match(/\S*$/)![0];
  if (!word) return false;
  return /^(https?:|www\.)/i.test(word) || /:\/\/|[/@\\=]|\.\p{L}/u.test(word);
}

/** Ce que devient le caractère tapé, ou null s'il reste tel quel. `mode` : une langue de TYPO_RULES, ou « off ». */
export function smartType(before: string, typed: string, mode: TypographyMode): SmartEdit | null {
  if (mode === "off" || typed.length !== 1) return null;
  if (inAddressOrCode(before)) return null;
  const rules = typoRules(mode);

  // Points de suspension : le troisième point.
  if (typed === "." && before.endsWith("..")) return { remove: 2, insert: "…" };
  // Deux traits d'union : le tiret de la langue (cadratin ou demi-cadratin), aussi tiret de dialogue.
  if (typed === "-" && before.endsWith("-") && !before.endsWith("--")) return { remove: 1, insert: rules.dash };
  // Apostrophe typographique ; en anglais, guillemet simple ouvrant en début de mot.
  if (typed === "'") return { remove: 0, insert: opensBefore(before, rules) ? rules.wordStartQuote : "’" };

  // Guillemets doubles : ceux de premier niveau, sauf là où ils sont simples (anglais britannique ‘ ’),
  // où le " tapé donne les doubles “ ” du second niveau.
  const [open, close] = rules.quotes[0] === "‘" ? rules.inner : rules.quotes;
  const space = rules.quoteSpace;
  if (typed === '"') {
    if (unclosed(before, open, close)) {
      const spaces = space ? before.match(/[ \u00a0\u202f]*$/)![0].length : 0;
      return { remove: spaces, insert: `${space}${close}` };
    }
    return opensBefore(before, rules) ? { remove: 0, insert: `${open}${space}` } : { remove: 0, insert: `${space}${close}` };
  }
  // Une espace tapée juste après un guillemet qui a déjà la sienne (« ) : rien de plus.
  if (space && typed === " " && before.endsWith(`${open}${space}`)) return { remove: 0, insert: "" };
  // Ponctuation haute (français) : l'espace qui la précède devient insécable (fine pour ; ! ?), et elle est
  // ajoutée après un mot. Jamais deux fois (« ?! »), ni après une espace insécable déjà là.
  const high = rules.before[typed as HighPunct];
  if (high) {
    if (before.endsWith(" ")) return { remove: 1, insert: `${high}${typed}` };
    // Deux-points collé à un mot : on le laisse (heure 12:30, adresse http:).
    if (typed !== ":" && new RegExp(`[\\p{L}\\p{N}${close}…)]$`, "u").test(before)) return { remove: 0, insert: `${high}${typed}` };
  }
  return null;
}
