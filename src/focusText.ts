// Mode focus du manuscrit : ce qui reste en pleine encre (la phrase ou le paragraphe en cours d'écriture).
// Fonction pure, testée.

export type FocusHighlight = "off" | "sentence" | "line" | "paragraph";
export const FOCUS_HIGHLIGHTS: FocusHighlight[] = ["off", "sentence", "line", "paragraph"];
export const isFocusHighlight = (v: unknown): v is FocusHighlight => FOCUS_HIGHLIGHTS.includes(v as FocusHighlight);

/** Mise en valeur suivante (raccourci et bouton de la barre du mode focus) : tout, phrase, ligne, paragraphe, puis tout. */
export const nextHighlight = (h: FocusHighlight): FocusHighlight => FOCUS_HIGHLIGHTS[(FOCUS_HIGHLIGHTS.indexOf(h) + 1) % FOCUS_HIGHLIGHTS.length];

/**
 * Largeur de la colonne du mode focus (manuscrit), en em, marges comprises : environ 58, 66 et 76 caractères
 * par ligne dans la police du livre (iA Writer reste autour de 64).
 */
export type FocusColumn = "narrow" | "medium" | "wide";
export const FOCUS_COLUMNS: FocusColumn[] = ["narrow", "medium", "wide"];
export const FOCUS_COLUMN_EM: Record<FocusColumn, number> = { narrow: 26, medium: 29, wide: 33 };
export const isFocusColumn = (v: unknown): v is FocusColumn => FOCUS_COLUMNS.includes(v as FocusColumn);

/** Mots écrits pendant la séance (depuis l'entrée en mode focus), signés : « +120 » ou « −35 ». */
export function sessionDelta(start: number, now: number, num: (n: number) => string): string {
  const d = now - start;
  return d < 0 ? `\u2212${num(-d)}` : `+${num(d)}`;
}

/**
 * Bornes de la phrase qui contient la position `at` dans `text` : de la fin de la phrase précédente
 * (après . ! ? … et les guillemets ou parenthèses qui les suivent) jusqu'à la fin de celle-ci.
 */
export function sentenceAt(text: string, at: number): { from: number; to: number } {
  // Le point final, puis les guillemets ou parenthèses qui le suivent (espace insécable comprise en français).
  const end = /[.!?…]+(?:[\s\u00a0\u202f]*["»”’)\]])*(?=\s|$)/g;
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = end.exec(text))) {
    const stop = m.index + m[0].length;
    // Le curseur juste après le point appartient encore à la phrase qu'il vient de finir.
    if (stop >= at) return { from: skipSpace(text, from), to: stop };
    from = stop;
  }
  return { from: skipSpace(text, from), to: text.length };
}

const skipSpace = (text: string, i: number) => {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
};
