// Enchaînements à relire (#120) : l'ordre du récit dont on lit les enchaînements, le même pour le store (qui les
// retient) et pour « Vérifier » (qui les signale). Roman : l'ordre du Plan, sans les pages du livre ; scénario :
// l'ordre des en-têtes du fichier Fountain (série comprise), seulement les scènes qui ont leur carte.

import type { CardNode } from "./projectState";
import { planScenes } from "./projectState";
import { planOrder, type Plan } from "./plan";
import type { Screenplay } from "./screenplay/model";
import { listScenes } from "./screenplay/scenes";
import { TRANSITIONS_KEY, readTransitions } from "./transitions";
import { sceneLetters, setupLetters, setupScenes, type SetupEdge } from "./setups";

export function junctionOrder(kind: "roman" | "scenario", nodes: CardNode[], plan: Plan, screenplay: Screenplay | null): string[] {
  const ids = planScenes(nodes);
  if (kind !== "scenario") return planOrder(plan, ids);
  const known = new Set(ids);
  return [...new Set(listScenes(screenplay?.elements ?? []).flatMap((s) => (s.cardId && known.has(s.cardId) ? [s.cardId] : [])))];
}

/** Enchaînements validés du projet ouvert (clé de cosmos.json gardée dans `metaKeep`), ou null. */
export const approvedJunctions = (metaKeep: Record<string, unknown>): string[] | null => readTransitions(metaKeep[TRANSITIONS_KEY]);

/** Lettres des préparations du projet (paires « Prépare A » / « Paie A »), dans l'ordre du récit. */
export interface ProjectSetupLetters {
  byLink: Map<string, string>;
  byScene: Map<string, { prepares: string[]; pays: string[] }>;
}

const NO_LETTERS: ProjectSetupLetters = { byLink: new Map(), byScene: new Map() };
let lettersCache: { kind: string; nodes: unknown; plan: unknown; screenplay: unknown; edges: unknown; value: ProjectSetupLetters } | null = null;

/** Calculé une fois par état (cartes, plan, scénario, fils) : chaque carte du canevas le lit. */
export function projectSetupLetters(s: { kind: "roman" | "scenario"; nodes: CardNode[]; plan: Plan; screenplay: Screenplay | null; edges: readonly SetupEdge[] }): ProjectSetupLetters {
  const c = lettersCache;
  if (c && c.kind === s.kind && c.nodes === s.nodes && c.plan === s.plan && c.screenplay === s.screenplay && c.edges === s.edges) return c.value;
  let value = NO_LETTERS;
  if (setupScenes(s.edges).size > 0) {
    const byLink = setupLetters(s.edges, junctionOrder(s.kind, s.nodes, s.plan, s.screenplay));
    value = { byLink, byScene: sceneLetters(s.edges, byLink) };
  }
  lettersCache = { kind: s.kind, nodes: s.nodes, plan: s.plan, screenplay: s.screenplay, edges: s.edges, value };
  return value;
}
