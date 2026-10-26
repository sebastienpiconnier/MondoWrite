// Questions sur l'histoire de l'onglet « Vérifier » (lot 6 de la Bible v2) : relues dans le projet ouvert,
// avec les statistiques des personnages (mêmes comptes que la fenêtre Statistiques). Rien n'est enregistré.

import { useMemo } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { bookOrder } from "../book";
import { novelReport, screenplayReport } from "../review/report";
import { checkStory, type Finding } from "../review/checks";

export function useStoryFindings(): Finding[] {
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const pitch = useCosmos((s) => s.pitch);
  const lang = useSettings((s) => s.lang);
  return useMemo(() => {
    const cards = nodes.map((n) => n.data);
    const rows = kind === "scenario" ? (screenplay ? screenplayReport(screenplay.elements, cards, lang) : []) : novelReport(manuscript, bookOrder(nodes, plan), cards);
    return checkStory(cards, rows, kind, pitch);
  }, [kind, screenplay, nodes, plan, manuscript, pitch, lang]);
}
