// Couleur d'une scène selon son intrigue principale (#143). Chaque carte Intrigue reçoit une couleur stable de la
// palette des points de vue (`--pov-1` à `--pov-8`, déjà vérifiée en clair et en sombre) ; l'intrigue principale
// d'une scène est celle de son étoile (`fiche.intrigue`, champ-référence) si la scène y est encore reliée, sinon
// la première intrigue reliée par un fil. Rien d'autre n'est écrit. Fonctions pures, gardées en cache tant que
// cartes et fils ne changent pas.

import { narratorColors } from "./pov";
import type { CardData } from "./types";

interface NodeLike {
  id: string;
  data: Pick<CardData, "type" | "fiche">;
}
interface EdgeLike {
  source: string;
  target: string;
}

/** Intrigues reliées à une scène, dans l'ordre des fils, l'intrigue principale d'abord. */
export function scenePlots(sceneId: string, nodes: readonly NodeLike[], edges: readonly EdgeLike[]): string[] {
  const plots = new Set(nodes.filter((n) => n.data.type === "intrigue").map((n) => n.id));
  const linked: string[] = [];
  for (const e of edges) {
    const other = e.source === sceneId ? e.target : e.target === sceneId ? e.source : null;
    if (other && plots.has(other) && !linked.includes(other)) linked.push(other);
  }
  const main = nodes.find((n) => n.id === sceneId)?.data.fiche?.intrigue;
  return main && linked.includes(main) ? [main, ...linked.filter((x) => x !== main)] : linked;
}

export interface PlotColors {
  /** Couleur de chaque intrigue : rang dans la palette, de 1 à 8. */
  plots: Map<string, number>;
  /** Scène → son intrigue principale. */
  main: Map<string, string>;
}

const cache = new WeakMap<readonly NodeLike[], WeakMap<readonly EdgeLike[], PlotColors>>();

export function plotColors(nodes: readonly NodeLike[], edges: readonly EdgeLike[]): PlotColors {
  const byEdges = cache.get(nodes) ?? new WeakMap();
  cache.set(nodes, byEdges);
  const hit = byEdges.get(edges);
  if (hit) return hit;
  const plots = narratorColors(nodes.filter((n) => n.data.type === "intrigue").map((n) => n.id));
  const main = new Map<string, string>();
  for (const n of nodes) {
    if (n.data.type !== "scene") continue;
    const first = scenePlots(n.id, nodes, edges)[0];
    if (first) main.set(n.id, first);
  }
  const out = { plots, main };
  byEdges.set(edges, out);
  return out;
}

/** Variable CSS de la couleur d'une scène, ou undefined (scène sans intrigue). */
export function sceneColor(colors: PlotColors, sceneId: string | undefined): string | undefined {
  const plot = sceneId ? colors.main.get(sceneId) : undefined;
  const slot = plot ? colors.plots.get(plot) : undefined;
  return slot ? `var(--pov-${slot})` : undefined;
}
