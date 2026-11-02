// Point de vue des scènes (1.13.0) : quelles scènes chaque personnage raconte, dans l'ordre du livre.
// Rien n'est enregistré à part : tout est relu dans `fiche.pov` des cartes Scène. Fonctions pures.

import { foldName } from "./review/names";
import type { CardData } from "./types";

/** Narrateur d'une scène parmi les personnages connus (identifiant), ou null. */
const narratorId = (c: CardData, people: ReadonlySet<string>) => (c.type === "scene" && !c.page && c.fiche?.pov && people.has(c.fiche.pov) ? c.fiche.pov : null);
const peopleOf = (cards: readonly CardData[]) => new Set(cards.filter((c) => c.type === "personnage").map((c) => c.id));

/** Scènes racontées par un personnage, dans l'ordre donné (ordre du livre ou du scénario), les autres à la fin. */
export function narratedScenes(characterId: string, cards: readonly CardData[], order: readonly string[]): CardData[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const people = peopleOf(cards);
  return cards
    .filter((c) => narratorId(c, people) === characterId)
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

/** Nombre de scènes racontées par chaque personnage (identifiant → nombre), pour ceux qui en racontent. */
export function narratorCounts(cards: readonly CardData[]): Map<string, number> {
  const people = peopleOf(cards);
  const out = new Map<string, number>();
  for (const c of cards) {
    const id = narratorId(c, people);
    if (id) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Personnages proposés : ceux qui racontent déjà des scènes d'abord (les plus présents en tête), puis par nom. */
export function povChoices(cards: readonly CardData[], lang: string): CardData[] {
  const people = cards.filter((c) => c.type === "personnage" && c.title.trim());
  const told = narratorCounts(cards);
  return people.sort((a, b) => (told.get(b.id) ?? 0) - (told.get(a.id) ?? 0) || a.title.localeCompare(b.title, lang));
}

/** Choix proposés pour une saisie : les personnages dont le nom contient le texte (sans casse ni accents). */
export function matchChoices(people: readonly CardData[], query: string): CardData[] {
  const q = foldName(query);
  return q ? people.filter((c) => foldName(c.title).includes(q)) : [...people];
}
