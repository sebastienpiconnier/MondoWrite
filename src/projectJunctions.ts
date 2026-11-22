// Enchaînements à relire (#120) : l'ordre du récit dont on lit les enchaînements, le même pour le store (qui les
// retient) et pour « Vérifier » (qui les signale). Roman : l'ordre du Plan, sans les pages du livre ; scénario :
// l'ordre des en-têtes du fichier Fountain (série comprise), seulement les scènes qui ont leur carte.

import type { CardNode } from "./projectState";
import { planScenes } from "./projectState";
import { planOrder, type Plan } from "./plan";
import type { Screenplay } from "./screenplay/model";
import { listScenes } from "./screenplay/scenes";
import { TRANSITIONS_KEY, readTransitions } from "./transitions";

export function junctionOrder(kind: "roman" | "scenario", nodes: CardNode[], plan: Plan, screenplay: Screenplay | null): string[] {
  const ids = planScenes(nodes);
  if (kind !== "scenario") return planOrder(plan, ids);
  const known = new Set(ids);
  return [...new Set(listScenes(screenplay?.elements ?? []).flatMap((s) => (s.cardId && known.has(s.cardId) ? [s.cardId] : [])))];
}

/** Enchaînements validés du projet ouvert (clé de cosmos.json gardée dans `metaKeep`), ou null. */
export const approvedJunctions = (metaKeep: Record<string, unknown>): string[] | null => readTransitions(metaKeep[TRANSITIONS_KEY]);
