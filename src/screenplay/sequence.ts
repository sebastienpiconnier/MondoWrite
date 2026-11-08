// Ordre des scènes dans le fichier (séquencier minimal). Le scénario est découpé en blocs :
// une scène (de son en-tête jusqu'au bloc suivant) ou une section (« # Acte II »). Déplacer une scène,
// c'est déplacer son bloc entier : aucun élément n'est créé ni perdu.

import type { ScreenplayElement } from "./model";

export interface Block {
  kind: "scene" | "section";
  /** Index du premier élément, puis du premier élément après le bloc. */
  start: number;
  end: number;
  text: string;
  cardId?: string;
  /** Scène : son rang dans le scénario, à partir de 1. */
  number?: number;
  /** Section : son niveau (# = 1, ## = 2…). */
  depth?: number;
  /** Scène omise (#46) : « OMIS » garde sa place et son numéro. */
  omitted?: boolean;
}

/** Blocs dans l'ordre du fichier. Ce qui précède le premier bloc (action d'ouverture) n'en fait pas partie. */
export function blocks(elements: ScreenplayElement[]): Block[] {
  const list: Block[] = [];
  let scenes = 0;
  elements.forEach((el, index) => {
    if (el.type !== "sceneHeading" && el.type !== "section") return;
    if (list.length > 0) list[list.length - 1].end = index;
    list.push(
      el.type === "sceneHeading"
        ? { kind: "scene", start: index, end: elements.length, text: el.text, cardId: el.cardId, number: ++scenes, ...(el.omitted !== undefined ? { omitted: true } : {}) }
        : { kind: "section", start: index, end: elements.length, text: el.text, depth: el.depth ?? 1 },
    );
  });
  return list;
}

/**
 * Déplace le bloc `from` pour qu'il prenne la place `to` dans la liste des blocs.
 * Rend le même tableau si rien ne bouge.
 */
export function moveBlock(elements: ScreenplayElement[], from: number, to: number): ScreenplayElement[] {
  const list = blocks(elements);
  if (from === to || !list[from] || !list[to]) return elements;
  const order = list.map((_, i) => i);
  order.splice(to, 0, order.splice(from, 1)[0]);
  const head = elements.slice(0, list[0].start);
  return head.concat(...order.map((i) => elements.slice(list[i].start, list[i].end)));
}
