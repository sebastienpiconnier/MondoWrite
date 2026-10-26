// Épisodes d'une série (Bible v2, lot 6) : chaque épisode est une carte Épisode. Sa fiche porte le numéro
// (ordre de la saison), le synopsis et le personnage pivot (identifiant d'une carte Personnage) ; les fils
// du canevas disent quelles intrigues le traversent et quels personnages y paraissent. Rien n'est recopié :
// la grille intrigues × épisodes et la colonne « épisodes où il apparaît » sont relues ici. Fonctions pures.
//
// Avant le lot 6, les épisodes s'écrivaient dans la couverture (`pitch.episodes`, une ligne « Titre : ce qui
// s'y passe ») : `adoptPitchEpisodes` en fait des cartes à l'ouverture, une fois, et vide la ligne.

import type { Edge } from "@xyflow/react";
import type { CardData } from "./types";
import { readEpisodes, type Pitch } from "./pitch";

type Linked = Pick<Edge, "source" | "target">;

/** Numéro saisi (« 3 », « Ép. 3 », « 103 »), ou null. */
const numberOf = (c: CardData) => {
  const m = /\d+/.exec(c.fiche?.numero ?? "");
  return m ? Number(m[0]) : null;
};

/**
 * Épisodes dans l'ordre de la saison : par numéro, puis ceux sans numéro dans l'ordre reçu (celui du canevas).
 */
export function episodeOrder(cards: readonly CardData[]): CardData[] {
  const episodes = cards.filter((c) => c.type === "episode");
  return episodes
    .map((c, i) => ({ c, i, n: numberOf(c) }))
    .sort((a, b) => (a.n ?? Infinity) - (b.n ?? Infinity) || a.i - b.i)
    .map((x) => x.c);
}

const neighbours = (id: string, edges: readonly Linked[]) => new Set(edges.flatMap((e) => (e.source === id ? [e.target] : e.target === id ? [e.source] : [])));

/** Personnage pivot d'un épisode, s'il existe encore. */
export function pivotOf(episode: CardData, cards: readonly CardData[]): CardData | null {
  const id = episode.fiche?.pivot;
  return (id && cards.find((c) => c.id === id && c.type === "personnage")) || null;
}

/** Intrigues reliées à un épisode par un fil. */
export function episodeThreads(episode: CardData, cards: readonly CardData[], edges: readonly Linked[]): CardData[] {
  const near = neighbours(episode.id, edges);
  return cards.filter((c) => c.type === "intrigue" && near.has(c.id));
}

/** Personnages d'un épisode : le pivot, puis ceux reliés par un fil. */
export function episodeCast(episode: CardData, cards: readonly CardData[], edges: readonly Linked[]): CardData[] {
  const near = neighbours(episode.id, edges);
  const pivot = pivotOf(episode, cards);
  return [...(pivot ? [pivot] : []), ...cards.filter((c) => c.type === "personnage" && c !== pivot && near.has(c.id))];
}

/** Numéro affiché de chaque épisode : celui de sa fiche, sinon sa place dans la saison. */
export function episodeNumbers(order: readonly CardData[]): Map<string, string> {
  return new Map(order.map((c, i) => [c.id, (c.fiche?.numero ?? "").trim() || String(i + 1)]));
}

/** Pour chaque personnage, les numéros des épisodes où il paraît (pivot ou relié), dans l'ordre de la saison. */
export function appearances(cards: readonly CardData[], edges: readonly Linked[]): Map<string, string[]> {
  const order = episodeOrder(cards);
  const numbers = episodeNumbers(order);
  const out = new Map<string, string[]>();
  for (const ep of order)
    for (const c of episodeCast(ep, cards, edges)) out.set(c.id, [...(out.get(c.id) ?? []), numbers.get(ep.id)!]);
  return out;
}

/** Grille intrigues × épisodes : une ligne par intrigue qui traverse au moins un épisode. */
export function episodeGrid(cards: readonly CardData[], edges: readonly Linked[]): { cols: string[]; rows: { label: string; cells: boolean[] }[] } {
  const order = episodeOrder(cards);
  const numbers = episodeNumbers(order);
  const threads = order.map((ep) => new Set(episodeThreads(ep, cards, edges).map((c) => c.id)));
  const rows = cards
    .filter((c) => c.type === "intrigue" && c.title.trim())
    .map((c) => ({ label: c.title.trim(), cells: threads.map((s) => s.has(c.id)) }))
    .filter((r) => r.cells.some(Boolean));
  return { cols: order.map((c) => numbers.get(c.id)!), rows };
}

/**
 * Reprise des épisodes écrits dans la couverture : une carte Épisode par ligne (titre, numéro, synopsis), si
 * le projet n'a encore aucune carte Épisode. Rend null quand il n'y a rien à reprendre.
 */
export function adoptPitchEpisodes(pitch: Pitch, cards: readonly CardData[], newId: () => string): { pitch: Pitch; cards: CardData[] } | null {
  const lines = readEpisodes(pitch.episodes);
  if (lines.length === 0 || cards.some((c) => c.type === "episode")) return null;
  const { episodes: _done, ...rest } = pitch;
  return {
    pitch: rest,
    cards: lines.map((ep, i) => ({ id: newId(), type: "episode", title: ep.title, html: "", fiche: { numero: String(i + 1), ...(ep.synopsis ? { synopsis: ep.synopsis } : {}) } })),
  };
}
