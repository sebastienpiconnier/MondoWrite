// Mots d'un scénario : ce qui s'écrit (en-têtes, actions, dialogues…), sans les notes, sections et synopsis.

import type { Screenplay, ScreenplayElement } from "./model";

const WRITTEN = new Set(["sceneHeading", "action", "character", "parenthetical", "dialogue", "transition", "centered"]);

export const elementWords = (el: ScreenplayElement): number => (WRITTEN.has(el.type) ? el.text.split(/\s+/).filter(Boolean).length : 0);

export const screenplayWords = (sp: Screenplay | null): number => (sp ? sp.elements.reduce((sum, el) => sum + elementWords(el), 0) : 0);

/** Mots de la scène qui commence à l'élément `from` (jusqu'à `to`, exclu, ou la fin). */
export function sceneWords(sp: Screenplay, from: number, to?: number): number {
  let n = 0;
  for (let i = from; i < (to ?? sp.elements.length); i++) n += elementWords(sp.elements[i]);
  return n;
}
