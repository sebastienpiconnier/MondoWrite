// Faits du projet ouvert (lot 4) : lus dans les choix et dans `storyFacts`, gardés tant que rien ne change (l'éditeur
// et la carte des choix les relisent souvent).

import type { Positioned } from "../book";
import type { Plan } from "../plan";
import { readFactLabels, storyFacts, type Fact } from "./facts";
import { interactiveScenes, interactiveSlugs } from "./scenes";

interface Parts {
  nodes: readonly Positioned[];
  plan: Plan;
  manuscript: Readonly<Record<string, string>>;
  metaKeep: Record<string, unknown> | null | undefined;
}

let last: { parts: Parts; lang?: string; facts: Fact[] } | null = null;

export function projectFacts(parts: Parts, lang?: string): Fact[] {
  const p = last?.parts;
  if (last && p && p.nodes === parts.nodes && p.plan === parts.plan && p.manuscript === parts.manuscript && p.metaKeep === parts.metaKeep && last.lang === lang)
    return last.facts;
  const scenes = interactiveScenes(parts.nodes, parts.plan);
  const facts = storyFacts(parts.manuscript, scenes.map((s) => s.id), new Set(interactiveSlugs(parts.nodes, parts.plan).values()), readFactLabels(parts.metaKeep), lang);
  // Même tableau quand le résultat est identique (sélecteurs stables).
  if (last && JSON.stringify(last.facts) === JSON.stringify(facts)) {
    last = { parts, lang, facts: last.facts };
    return last.facts;
  }
  last = { parts, lang, facts };
  return facts;
}
