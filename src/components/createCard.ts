// Créer une fiche (personnage ou lieu) depuis le texte du manuscrit : « /Nom » ou un nom sélectionné.

import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { canCreateMention } from "../mentions";
import type { CardData, CardType } from "../types";

export const CREATE_TYPES: CardType[] = ["personnage", "lieu"];
const MAX_NAME = 40;
const MAX_WORDS = 6;

/** Ce qui se tape avant le curseur et demande une fiche (« /Nom », plusieurs mots permis, après un espace ou en début de ligne), sinon null. */
export function createQuery(before: string, cards: CardData[]): { name: string; length: number } | null {
  const m = new RegExp(`(?:^|[\\s(«“"'’])/([^\\s/][^/\\n]{0,${MAX_NAME - 1}})$`).exec(before);
  return m && canCreateMention(cards, m[1].trimEnd(), MAX_WORDS) ? { name: m[1].trim(), length: m[1].length + 1 } : null;
}

/** Hauteur réservée au menu de création (titre et deux choix, plus haut au doigt). */
const MENU_HEIGHT = 200;
const MENU_WIDTH = 300;

/**
 * Où poser le menu (position fixe) : sous la ligne en cours, ou au-dessus quand il ne tient pas
 * dans l'écran qu'il reste au-dessus du clavier virtuel (`--keyboard-h`, voir keyboard.ts).
 */
export function menuPlace(view: EditorView, pos: number): { left: number; top?: number; bottom?: number } {
  let box = { left: 0, top: 0, bottom: 0 };
  try {
    box = view.coordsAtPos(pos);
  } catch {
    /* position hors écran */
  }
  const keyboard = parseFloat(document.documentElement.style.getPropertyValue("--keyboard-h")) || 0;
  const visibleBottom = window.innerHeight - keyboard;
  const left = Math.max(8, Math.min(box.left, window.innerWidth - MENU_WIDTH - 8));
  return box.bottom + 6 + MENU_HEIGHT > visibleBottom ? { left, bottom: window.innerHeight - box.top + 6 } : { left, top: box.bottom + 6 };
}

/** Le nom sélectionné dans un seul paragraphe, s'il peut devenir une fiche (court, pas déjà une fiche), sinon "". */
export function selectedName(state: EditorState, cards: CardData[]): string {
  const { from, to, empty, $from, $to } = state.selection;
  if (empty || !$from.sameParent($to)) return "";
  const name = state.doc.textBetween(from, to, " ", "\ufffc").trim();
  return name && name.length <= MAX_NAME && canCreateMention(cards, name, MAX_WORDS) ? name : "";
}
