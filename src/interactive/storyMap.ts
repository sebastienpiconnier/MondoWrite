// Roman interactif, lot 11 (#91) : le canevas est la carte des choix. Ce module dit, sans React, ce que le canevas
// montre de l'histoire : les repères de chaque carte Scène (départ, fin, inaccessible…) et l'identifiant des
// flèches de choix. Les flèches se lisent dans les blocs ` ```choix ` ; elles ne sont jamais des fils du projet.
// Fonctions pures.

import { END_TARGET, endsByDivert, type ChoiceEdge, type SceneRef } from "./choices";
import type { VerifyPoint } from "./verify";

/** Repères d'une carte Scène sur le canevas. */
export interface SceneMarks {
  start: boolean;
  ending: boolean;
  deadEnd: boolean;
  broken: number;
  unreachable: boolean;
  locked: boolean;
  factIssue: boolean;
}

/** Repères de chaque scène de l'histoire, d'après ses choix et les points du vérificateur (lot 5). */
export function sceneMarks(
  scenes: readonly SceneRef[],
  graph: readonly ChoiceEdge[],
  manuscript: Readonly<Record<string, string>>,
  points: readonly VerifyPoint[],
): Map<string, SceneMarks> {
  const out = new Map<string, SceneMarks>();
  const by = new Map<string, ChoiceEdge[]>();
  for (const e of graph) by.set(e.from, [...(by.get(e.from) ?? []), e]);
  const has = (rules: readonly string[], id: string) => points.some((p) => p.scene === id && rules.includes(p.rule));
  scenes.forEach((s, i) => {
    const list = by.get(s.id) ?? [];
    // Un « -> END » écrit dans le bloc (fichier Ink importé) finit aussi l'histoire.
    const divert = endsByDivert(manuscript[s.id]);
    out.set(s.id, {
      start: i === 0,
      ending: list.some((e) => e.to === END_TARGET) || divert,
      deadEnd: list.length === 0 && !divert,
      broken: list.filter((e) => e.to === null).length,
      unreachable: has(["unreachableScene"], s.id),
      locked: has(["lockedScene"], s.id),
      factIssue: has(["factNeverGiven", "factTooLate"], s.id),
    });
  });
  return out;
}

/** Repères en une chaîne (« start ending broken:2 ») : une carte ne se redessine que si les siens changent. */
export function marksKey(m: SceneMarks | undefined): string {
  if (!m) return "";
  return [
    m.start && "start",
    m.ending && "ending",
    m.deadEnd && "deadEnd",
    m.broken > 0 && `broken:${m.broken}`,
    m.unreachable && "unreachable",
    m.locked && "locked",
    m.factIssue && "factIssue",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Relit une chaîne de `marksKey`. */
export function readMarksKey(key: string): SceneMarks | null {
  if (!key) return null;
  const parts = key.split(" ");
  const broken = Number(parts.find((p) => p.startsWith("broken:"))?.slice(7) ?? 0);
  return {
    start: parts.includes("start"),
    ending: parts.includes("ending"),
    deadEnd: parts.includes("deadEnd"),
    broken: Number.isFinite(broken) ? broken : 0,
    unreachable: parts.includes("unreachable"),
    locked: parts.includes("locked"),
    factIssue: parts.includes("factIssue"),
  };
}

/** Préfixe des flèches de choix du canevas : jamais celui d'un fil (identifiants de `newId`, sans deux-points). */
export const CHOICE_EDGE_PREFIX = "choice:";

export const choiceEdgeId = (from: string, index: number) => `${CHOICE_EDGE_PREFIX}${from}:${index}`;

export const isChoiceEdgeId = (id: string) => id.startsWith(CHOICE_EDGE_PREFIX);

/** Scène et rang du choix d'une flèche, ou null pour un fil. */
export function readChoiceEdgeId(id: string): { from: string; index: number } | null {
  if (!isChoiceEdgeId(id)) return null;
  const rest = id.slice(CHOICE_EDGE_PREFIX.length);
  const cut = rest.lastIndexOf(":");
  const index = Number(rest.slice(cut + 1));
  if (cut <= 0 || !Number.isInteger(index) || index < 0) return null;
  return { from: rest.slice(0, cut), index };
}

/** Clé stable d'une liste de scènes (identifiants et titres) : le graphe n'est refait que si elle change. */
export const scenesKey = (scenes: readonly SceneRef[]) => scenes.map((s) => `${s.id}\u0001${s.title}`).join("\u0002");

/** Écart entre deux flèches qui relient les deux mêmes scènes (pixels du canevas). */
export const PARALLEL_GAP = 30;

/**
 * Décalage de côté de chaque flèche quand plusieurs relient les deux mêmes scènes (dans un sens ou l'autre) : clé
 * `de:rang`, valeur en pixels, mesurée à gauche du sens de la flèche. Une flèche seule n'en a pas.
 */
export function parallelOffsets(edges: readonly { from: string; index: number; to: string }[], gap = PARALLEL_GAP): Map<string, number> {
  const groups = new Map<string, { key: string; forward: boolean }[]>();
  for (const e of edges) {
    const forward = e.from < e.to;
    const pair = forward ? `${e.from}\u0001${e.to}` : `${e.to}\u0001${e.from}`;
    groups.set(pair, [...(groups.get(pair) ?? []), { key: `${e.from}:${e.index}`, forward }]);
  }
  const out = new Map<string, number>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.forEach((e, k) => {
      const along = (k - (list.length - 1) / 2) * gap;
      // Le côté gauche d'une flèche retournée est le côté droit de l'autre sens.
      out.set(e.key, e.forward ? along : -along);
    });
  }
  return out;
}
