// Fusionner deux scènes (#23), l'inverse de « Couper la scène » : la scène suivante rejoint la précédente (texte,
// synopsis, fils, commentaires) et sa carte part à la corbeille. Fonctions pures ; le store les assemble
// (`joinScenes`, `mergeWithNext`).

import type { Edge } from "@xyflow/react";
import type { ScreenplayElement } from "./screenplay/model";
import { headingOf, sceneEnd } from "./screenplay/sceneText";
import { sceneSynopsis, synopsisEnd, synopsisIsIa } from "./screenplay/scenes";
import type { Comments } from "./comments";

/** Deux synopsis mis bout à bout, sans espace en trop ni doublon (« A » + « A » reste « A »). */
export function joinSynopses(into: string, from: string): string {
  const a = into.replace(/\s+/g, " ").trim();
  const b = from.replace(/\s+/g, " ").trim();
  if (!b || a === b) return a;
  if (!a) return b;
  return `${a} ${b}`;
}

/**
 * Fils de la carte qui part (`from`) rattachés à celle qui reste (`into`) : jamais un fil entre `into` et elle-même,
 * jamais un second fil entre deux cartes déjà reliées (dans un sens ou l'autre) ; le fil entre les deux scènes part.
 * Les fils gardent leur identifiant et leur étiquette. Même tableau si rien ne change.
 */
export function mergeEdges(edges: Edge[], from: string, into: string): Edge[] {
  if (!edges.some((e) => e.source === from || e.target === from)) return edges;
  const pair = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const linked = new Set(edges.filter((e) => e.source !== from && e.target !== from).map((e) => pair(e.source, e.target)));
  const out: Edge[] = [];
  for (const e of edges) {
    if (e.source !== from && e.target !== from) {
      out.push(e);
      continue;
    }
    const source = e.source === from ? into : e.source;
    const target = e.target === from ? into : e.target;
    if (source === target || linked.has(pair(source, target))) continue;
    linked.add(pair(source, target));
    out.push({ ...e, source, target });
  }
  return out;
}

/** Commentaires de la scène qui part rangés avec ceux de la scène qui reste (leurs marques suivent le texte). */
export function mergeComments(comments: Comments, from: string, into: string): Comments {
  const moved = comments[from];
  if (!moved || moved.length === 0) return comments;
  const next = { ...comments, [into]: [...(comments[into] ?? []), ...moved] };
  delete next[from];
  return next;
}

/**
 * Scénario : la scène de `from` rejoint celle de `into`, qu'elle doit suivre immédiatement (aucune section entre
 * elles : une case, un épisode ou une saison les sépare, et la fusion la déplacerait). L'en-tête de `from` disparaît,
 * son synopsis s'ajoute à celui de `into`, son corps suit celui de `into`. null si ce n'est pas possible.
 */
export function mergeScreenplayScenes(elements: ScreenplayElement[], from: string, into: string): ScreenplayElement[] | null {
  const i = headingOf(elements, into);
  const j = headingOf(elements, from);
  if (i < 0 || j < 0 || sceneEnd(elements, i) !== j) return null;
  const synopsis = joinSynopses(sceneSynopsis(elements, i), sceneSynopsis(elements, j));
  const ia = synopsisIsIa(elements, i) || synopsisIsIa(elements, j);
  const lines: ScreenplayElement[] = synopsis ? [{ type: "synopsis", text: synopsis, ...(ia ? { ia: true } : {}) }] : [];
  const intoBody = elements.slice(synopsisEnd(elements, i), j);
  const fromBody = elements.slice(synopsisEnd(elements, j), sceneEnd(elements, j));
  return [...elements.slice(0, i + 1), ...lines, ...intoBody, ...fromBody, ...elements.slice(sceneEnd(elements, j))];
}

/** Scène qui suit `id` dans l'ordre du récit, si elle peut la rejoindre (même chapitre, aucune page hors récit). */
export function nextInStory(order: string[], id: string, ok: (next: string) => boolean): string | null {
  const at = order.indexOf(id);
  const next = at >= 0 ? order[at + 1] : undefined;
  return next && ok(next) ? next : null;
}
