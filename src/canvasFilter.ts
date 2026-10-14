// Filtres du canevas : états d'affichage, jamais enregistrés dans le projet ni dans l'historique.
// - par type : les cartes des types décochés sont masquées, avec les fils qui les touchent ;
// - sur une carte : seules elle et ses voisines directes (reliées par un fil ou une mention, dans un sens
//   ou dans l'autre) restent visibles.
// Une carte créée pendant un filtre reste visible (elle n'était pas là quand le filtre a été posé).
// Fonctions pures.

import type { Edge } from "@xyflow/react";
import { mentionedIds } from "./mentions";
import type { CardData, CardType } from "./types";

export interface CanvasFilter {
  /** Types masqués. */
  types: CardType[];
  /** Carte dont on ne montre que le voisinage. */
  card: string | null;
  /** Cartes présentes quand le filtre a été posé : les autres, créées depuis, restent visibles. */
  base: string[] | null;
}

export const NO_FILTER: CanvasFilter = { types: [], card: null, base: null };

export const filterActive = (f: CanvasFilter) => f.types.length > 0 || f.card !== null;

/** La carte et ses voisines directes : fils dans les deux sens, mentions dans les deux sens. */
export function neighbourhood(id: string, cards: Pick<CardData, "id" | "html">[], edges: Pick<Edge, "source" | "target">[]): Set<string> {
  const out = new Set([id]);
  for (const e of edges) {
    if (e.source === id) out.add(e.target);
    if (e.target === id) out.add(e.source);
  }
  const self = cards.find((c) => c.id === id);
  for (const m of mentionedIds(self?.html ?? "")) out.add(m);
  for (const c of cards) if (mentionedIds(c.html ?? "").includes(id)) out.add(c.id);
  return out;
}

/** Cartes masquées par le filtre. */
export function hiddenCards(cards: Pick<CardData, "id" | "type" | "html">[], edges: Pick<Edge, "source" | "target">[], f: CanvasFilter): Set<string> {
  if (!filterActive(f)) return new Set();
  const base = f.base ? new Set(f.base) : null;
  const near = f.card ? neighbourhood(f.card, cards, edges) : null;
  const hidden = new Set<string>();
  for (const c of cards) {
    if (base && !base.has(c.id)) continue; // créée pendant le filtre
    if (f.types.includes(c.type) || (near && !near.has(c.id))) hidden.add(c.id);
  }
  // La carte du filtre reste toujours visible, même si son type est décoché.
  if (f.card) hidden.delete(f.card);
  return hidden;
}
