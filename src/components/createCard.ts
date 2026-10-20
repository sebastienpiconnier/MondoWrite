// Créer une fiche (personnage ou lieu) depuis le texte du manuscrit : « /Nom » ou un nom sélectionné.

import type { EditorState } from "@tiptap/pm/state";
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

/** Le nom sélectionné dans un seul paragraphe, s'il peut devenir une fiche (court, pas déjà une fiche), sinon "". */
export function selectedName(state: EditorState, cards: CardData[]): string {
  const { from, to, empty, $from, $to } = state.selection;
  if (empty || !$from.sameParent($to)) return "";
  const name = state.doc.textBetween(from, to, " ", "\ufffc").trim();
  return name && name.length <= MAX_NAME && canCreateMention(cards, name, MAX_WORDS) ? name : "";
}
