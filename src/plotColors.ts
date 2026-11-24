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
  /** Couleur de chaque intrigue : rang dans la palette, de 1 à 8 (celle choisie dans sa fiche, sinon attribuée). */
  plots: Map<string, number>;
  /** Scène → son intrigue principale. */
  main: Map<string, string>;
  /** Scène → toutes ses intrigues, la principale d'abord. */
  all: Map<string, string[]>;
}

const cache = new WeakMap<readonly NodeLike[], WeakMap<readonly EdgeLike[], PlotColors>>();

export function plotColors(nodes: readonly NodeLike[], edges: readonly EdgeLike[]): PlotColors {
  const byEdges = cache.get(nodes) ?? new WeakMap();
  cache.set(nodes, byEdges);
  const hit = byEdges.get(edges);
  if (hit) return hit;
  const plotNodes = nodes.filter((n) => n.data.type === "intrigue");
  const plots = narratorColors(plotNodes.map((n) => n.id));
  for (const n of plotNodes) {
    const chosen = Number(n.data.fiche?.couleur);
    if (chosen >= 1 && chosen <= 8) plots.set(n.id, chosen);
  }
  const main = new Map<string, string>();
  const all = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.data.type !== "scene") continue;
    const list = scenePlots(n.id, nodes, edges);
    if (list[0]) main.set(n.id, list[0]);
    if (list.length > 0) all.set(n.id, list);
  }
  const out = { plots, main, all };
  byEdges.set(edges, out);
  return out;
}

/**
 * Fond d'une scène : chaque intrigue reliée en bande verticale pleine, la principale à gauche. Le texte posé
 * dessus prend la surface (`.has-plot`), à 4,5:1 de chaque couleur. Undefined pour une scène sans intrigue.
 */
export function sceneBackground(colors: PlotColors, sceneId: string | undefined): string | undefined {
  const list = sceneId ? colors.all.get(sceneId) : undefined;
  if (!list || list.length === 0) return undefined;
  const tints = list.map((p) => `var(--pov-${colors.plots.get(p) ?? 1})`);
  if (tints.length === 1) return `linear-gradient(${tints[0]}, ${tints[0]})`;
  const step = 100 / tints.length;
  return `linear-gradient(90deg, ${tints.map((c, i) => `${c} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`).join(", ")})`;
}

/** Variable CSS de la couleur d'une scène, ou undefined (scène sans intrigue). */
export function sceneColor(colors: PlotColors, sceneId: string | undefined): string | undefined {
  const plot = sceneId ? colors.main.get(sceneId) : undefined;
  const slot = plot ? colors.plots.get(plot) : undefined;
  return slot ? `var(--pov-${slot})` : undefined;
}

/** Fond d'une carte Intrigue : sa propre couleur, pleine. */
export function plotCardBackground(colors: PlotColors, plotId: string): string | undefined {
  const n = colors.plots.get(plotId);
  return n ? `linear-gradient(var(--pov-${n}), var(--pov-${n}))` : undefined;
}
