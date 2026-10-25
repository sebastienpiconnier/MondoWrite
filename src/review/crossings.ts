// « Qui croise qui » (fenêtre Statistiques) et épaisseur des fils de la carte des Relations : pour chaque paire
// de personnages, les scènes qu'ils partagent (ils y parlent ou y sont nommés). Rien n'est enregistré : tout
// est relu dans le texte. Fonctions pures.

import type { ScreenplayElement } from "../screenplay/model";
import { characterName, listScenes } from "../screenplay/scenes";
import type { CardData } from "../types";
import { detectCards } from "../manuscript";
import { foldName } from "./names";
import { scenesWith } from "./filter";
import { cardNames } from "./report";

/** Une scène du récit, dans l'ordre de lecture. */
export interface SceneRef {
  /** Numéro de la scène (1 = la première). */
  number: number;
  title: string;
  /** Carte Scène, pour l'ouvrir (null : en-tête sans carte). */
  cardId: string | null;
}

/** Un personnage et les scènes où il paraît (numéros, croissants). */
export interface Presence {
  /** Carte Personnage, ou null pour un nom qui parle sans carte (scénario). */
  id: string | null;
  name: string;
  scenes: number[];
}

export interface Cast {
  people: Presence[];
  scenes: SceneRef[];
}

/** Scénario : chaque carte Personnage (titre et surnoms), plus les noms qui parlent sans carte. */
export function screenplayCast(elements: ScreenplayElement[], cards: CardData[], locale = "fr"): Cast {
  const list = listScenes(elements);
  const numberOf = new Map(list.map((s) => [s.index, s.number]));
  const where = (names: string[]) => [...new Set(names.flatMap((n) => scenesWith(elements, n)))].map((i) => numberOf.get(i)!).sort((a, b) => a - b);
  const people: Presence[] = [];
  const covered = new Set<string>();
  for (const card of cards) {
    if (card.type !== "personnage" || !card.title.trim()) continue;
    const names = cardNames(card);
    names.forEach((n) => covered.add(foldName(n)));
    people.push({ id: card.id, name: card.title.trim(), scenes: where(names) });
  }
  const speakers = new Map<string, string>();
  for (const el of elements) {
    if (el.type !== "character") continue;
    const name = characterName(el.text).toLocaleUpperCase(locale);
    if (name && !covered.has(foldName(name)) && !speakers.has(foldName(name))) speakers.set(foldName(name), name);
  }
  for (const name of speakers.values()) people.push({ id: null, name, scenes: where([name]) });
  return { people, scenes: list.map((s) => ({ number: s.number, title: s.text, cardId: s.cardId ?? null })) };
}

/** Roman : chaque carte Personnage, présente dans les scènes dont le texte la nomme (ordre du livre). */
export function novelCast(manuscript: Record<string, string>, order: string[], cards: CardData[]): Cast {
  const titles = new Map(cards.map((c) => [c.id, c.title.trim()]));
  const people = cards
    .filter((c) => c.type === "personnage" && c.title.trim())
    .map((card) => ({
      id: card.id,
      name: card.title.trim(),
      scenes: order.flatMap((id, i) => (manuscript[id] && detectCards(manuscript[id], [card]).length ? [i + 1] : [])),
    }));
  return { people, scenes: order.map((id, i) => ({ number: i + 1, title: titles.get(id) ?? "", cardId: id })) };
}

/** Scènes que deux personnages partagent. */
export function shared(a: Presence, b: Presence): number[] {
  const set = new Set(b.scenes);
  return a.scenes.filter((n) => set.has(n));
}

/** Les personnages de la matrice : ceux qui paraissent au moins une fois, les plus présents d'abord. */
export function castForMatrix(people: Presence[], max: number, locale = "fr"): Presence[] {
  return people
    .filter((p) => p.scenes.length > 0)
    .sort((a, b) => b.scenes.length - a.scenes.length || a.name.localeCompare(b.name, locale))
    .slice(0, max);
}

export interface Pair {
  a: Presence;
  b: Presence;
  scenes: number[];
}

/** Toutes les paires (sans doublon), dans l'ordre de la liste. */
export function pairs(people: Presence[]): Pair[] {
  const out: Pair[] = [];
  people.forEach((a, i) => people.slice(i + 1).forEach((b) => out.push({ a, b, scenes: shared(a, b) })));
  return out;
}

/** Paires qui ne se croisent jamais (chacun paraît pourtant dans le récit). */
export const neverMeet = (people: Presence[]) => pairs(people.filter((p) => p.scenes.length > 0)).filter((p) => p.scenes.length === 0);

/** Le duo le plus présent ensemble (null si personne ne se croise). */
export function topDuo(people: Presence[]): Pair | null {
  let best: Pair | null = null;
  for (const p of pairs(people)) if (p.scenes.length > 0 && (!best || p.scenes.length > best.scenes.length)) best = p;
  return best;
}

/** Scènes partagées par deux cartes Personnage (carte des Relations), 0 si l'une ne paraît pas. */
export function sharedById(people: Presence[], a: string, b: string): number {
  const pa = people.find((p) => p.id === a);
  const pb = people.find((p) => p.id === b);
  return pa && pb ? shared(pa, pb).length : 0;
}
