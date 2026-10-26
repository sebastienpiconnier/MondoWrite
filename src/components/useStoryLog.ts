// Le journal de « Ce qui change » pour le projet ouvert : l'ordre du récit (Plan d'un roman, fichier Fountain
// d'un scénario, puis les scènes pas encore placées), le journal et les étapes du curseur. Rien n'est
// enregistré : tout est relu dans les cartes Scène (changes.ts).

import { useMemo } from "react";
import { useCosmos } from "../store";
import { chapterNumbers, chapterOf } from "../plan";
import { changeLog, projectStoryOrder, storySteps } from "../changes";

export function useStoryLog() {
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  return useMemo(() => {
    const order = projectStoryOrder(kind, nodes, plan, screenplay?.elements);
    const cards = new Map(nodes.map((n) => [n.id, n.data]));
    const log = changeLog(order.map((id) => ({ id, changes: cards.get(id)?.changes })), order);
    const numbers = chapterNumbers(plan, order);
    const titleOf = (id: string) => cards.get(id)?.title.trim() ?? "";
    const chapter =
      kind === "scenario"
        ? null
        : (id: string) => {
            const c = chapterOf(plan, id);
            return c ? { id: c.id, number: numbers.get(c.id) ?? 0, title: c.title.trim() } : null;
          };
    const steps = storySteps(order, titleOf, chapter);
    return { order, log, steps, titleOf };
  }, [nodes, plan, kind, screenplay]);
}
