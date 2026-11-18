// Roman interactif, lot 13 (#93) : ce que le lecteur voit sur une double page du livre broché. Le livre composé
// (paperback.ts) donne les pages de chaque section ; un choix dont la suite est sur une page que le lecteur a sous
// les yeux en lisant sa section la dévoile avant qu'il choisisse. Fonctions pures, testées ; plus un petit état de
// session : les pages de la dernière mise en page faite par la fenêtre « Livre broché » (jamais enregistrées).

import { create } from "zustand";

/**
 * Double page d'une page (rang 0 = page 1, une belle page seule) : les pages 2 et 3 forment la première double
 * page ouverte, 4 et 5 la suivante…
 */
export const spreadOf = (page: number) => Math.floor((page + 1) / 2);

/** Doubles pages qu'occupe une section, de sa première à sa dernière page. */
function spreadsOf(span: readonly [number, number]): Set<number> {
  const out = new Set<number>();
  for (let p = span[0]; p <= span[1]; p++) out.add(spreadOf(p));
  return out;
}

/** Choix dont la suite est sur une double page de la section de départ : paires de numéros, sans doublon. */
export function sameSpread(spans: Readonly<Record<number, readonly [number, number]>>, links: readonly { from: number; to: number }[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const seen = new Set<string>();
  for (const { from, to } of links) {
    if (from === to || seen.has(`${from}:${to}`)) continue;
    const a = spans[from];
    const b = spans[to];
    if (!a || !b) continue;
    const there = spreadsOf(a);
    if (![...spreadsOf(b)].some((s) => there.has(s))) continue;
    seen.add(`${from}:${to}`);
    out.push({ from, to });
  }
  return out;
}

/** Clé des numéros d'une mise en page : ses pages ne valent que pour ces numéros-là. */
export const numbersKey = (numbers: Readonly<Record<string, number>>) =>
  Object.entries(numbers)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, n]) => `${id}=${n}`)
    .join(",");

/** Pages des sections de la dernière mise en page du livre broché, avec la clé des numéros d'alors. */
export const usePaperbackSpreads = create<{ key: string; spans: Record<number, [number, number]> | null }>(() => ({ key: "", spans: null }));
