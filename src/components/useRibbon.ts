// Ruban du récit du projet ouvert (ribbon.ts) : relu à chaque changement du texte, du plan ou du scénario.
// Partagé par le ruban lui-même et les questions de « Vérifier ». Rien n'est enregistré.

import { useMemo } from "react";
import { useCosmos, planScenes } from "../store";
import { buildRibbon, novelGroups, screenplayGroups, type Ribbon } from "../ribbon";
import { paginate, pagesBetween } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { countWords } from "../manuscript";

/**
 * Le ruban, ou null sans gabarit (plan libre) ou sans scène. `evenFree` : aussi en plan libre, d'une seule
 * traite (le ruban par point de vue a un sens sans gabarit).
 */
export function useRibbon(evenFree = false): Ribbon | null {
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const paper = useCosmos((s) => s.paper);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  // Les scènes du récit seulement : une carte qui bouge sur le canevas ne refait pas le ruban.
  const sceneKey = useMemo(() => planScenes(nodes).join(" "), [nodes]);
  return useMemo(() => {
    if (kind === "scenario") {
      if (!screenplay) return null;
      const pagination = paginate(screenplay.elements, LAYOUTS[paper]);
      const { template, groups } = screenplayGroups(screenplay.elements, (start, end) => pagesBetween(pagination, start, end));
      if (!groups.some((g) => g.scenes.length > 0)) return null;
      if (template === "libre") return evenFree ? buildRibbon("libre", [{ key: null, scenes: groups.flatMap((g) => g.scenes) }]) : null;
      return buildRibbon(template, groups);
    }
    if (plan.template === "libre" && !evenFree) return null;
    const ids = sceneKey ? sceneKey.split(" ") : [];
    if (ids.length === 0) return null;
    return buildRibbon(plan.template, novelGroups(plan, ids, (id) => countWords(manuscript[id])));
  }, [kind, screenplay, paper, plan, manuscript, sceneKey, evenFree]);
}
