// Numéros des sections du projet ouvert (lot 12, #92) : ceux gardés dans cosmos.json, complétés pour les scènes
// nouvelles (sections.ts). Même objet tant que les scènes et les numéros gardés ne changent pas.

import type { Positioned } from "../book";
import type { Plan } from "../plan";
import { numberSections } from "./gamebook";
import { interactiveScenes, interactiveSlugs } from "./scenes";
import { readSections, resolveSections, sameNumbers, type SectionState } from "./sections";

interface Parts {
  nodes: readonly Positioned[];
  plan: Plan;
  manuscript: Readonly<Record<string, string>>;
  metaKeep: Record<string, unknown> | null | undefined;
}

let last: { nodes: Parts["nodes"]; plan: Plan; metaKeep: Parts["metaKeep"]; state: SectionState } | null = null;

/** Numéros (résolus) et cadenas des sections du projet. */
export function projectSections(parts: Parts): SectionState {
  if (last && last.nodes === parts.nodes && last.plan === parts.plan && last.metaKeep === parts.metaKeep) return last.state;
  const scenes = interactiveScenes(parts.nodes, parts.plan);
  const stored = readSections(parts.metaKeep ?? undefined);
  const numbers = resolveSections(
    scenes.map((s) => s.id),
    stored.numbers,
    // Premier mélange (aucun numéro gardé encore) : celui du livre-jeu, comme avant le lot 12.
    () => numberSections({ scenes, slugs: interactiveSlugs(parts.nodes, parts.plan), manuscript: parts.manuscript }),
  );
  const locked = stored.locked.filter((id) => numbers[id] !== undefined);
  // Même objet quand rien ne change (une carte déplacée sur le canevas ne touche pas aux numéros).
  const state = last && sameNumbers(last.state.numbers, numbers) && last.state.locked.join() === locked.join() ? last.state : { numbers, locked };
  last = { nodes: parts.nodes, plan: parts.plan, metaKeep: parts.metaKeep, state };
  return state;
}
