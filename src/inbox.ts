// Cartes « À ranger » : une carte marquée `inbox` (le Carnet de l'iPhone les créait avant novembre 2026, une version
// d'avant peut encore en écrire) attend sur le canevas, dans « À ranger », qu'on lui trouve sa place. Elle quitte la
// boîte quand on la déplace sur le canevas, qu'on la relie à une autre carte, ou qu'on la dit rangée. Fonctions pures.

import type { CardData } from "./types";

/** Cartes encore à ranger, les plus récentes d'abord (ordre inverse de leur arrivée). */
export const inboxCards = (cards: readonly CardData[]): CardData[] => cards.filter((c) => c.inbox).reverse();

/** Les cartes dites rangées quittent la boîte. Même tableau si aucune n'y était. */
export function fileCards<T extends { id: string; data: CardData }>(nodes: T[], ids: ReadonlySet<string>): T[] {
  if (!nodes.some((n) => ids.has(n.id) && n.data.inbox)) return nodes;
  return nodes.map((n) => {
    if (!ids.has(n.id) || !n.data.inbox) return n;
    const { inbox: _done, ...data } = n.data;
    return { ...n, data: data as CardData };
  });
}
