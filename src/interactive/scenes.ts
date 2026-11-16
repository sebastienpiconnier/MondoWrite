// Scènes d'un roman interactif (lot 2) : celles du récit, dans l'ordre du Plan. La première est le départ ; leurs
// titres donnent les noms des destinations (choices.ts). Les pages du livre (titre, dédicace…) n'en sont pas.

import { storyScenes, type Positioned } from "../book";
import { planOrder } from "../plan";
import type { Plan } from "../plan";
import { sceneSlugs, type SceneRef } from "./choices";

const cache = new WeakMap<readonly Positioned[], WeakMap<Plan, SceneRef[]>>();

/** Scènes du récit dans l'ordre du Plan (même tableau tant que cartes et plan ne changent pas). */
export function interactiveScenes(nodes: readonly Positioned[], plan: Plan): SceneRef[] {
  let byPlan = cache.get(nodes);
  if (!byPlan) cache.set(nodes, (byPlan = new WeakMap()));
  const hit = byPlan.get(plan);
  if (hit) return hit;
  const titles = new Map(nodes.map((n) => [n.id, n.data.title]));
  const out = planOrder(plan, storyScenes(nodes as Positioned[])).map((id) => ({ id, title: titles.get(id) ?? "" }));
  byPlan.set(plan, out);
  return out;
}

/** Noms des scènes du projet (destinations des choix). */
export const interactiveSlugs = (nodes: readonly Positioned[], plan: Plan) => sceneSlugs(interactiveScenes(nodes, plan));
