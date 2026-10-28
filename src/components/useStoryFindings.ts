// Questions sur l'histoire de l'onglet « Vérifier » (lots 6 et 7 de la Bible v2) : relues dans le projet ouvert,
// avec les statistiques des personnages (mêmes comptes que la fenêtre Statistiques), la longueur du pilote et
// les scènes qui nomment chaque objet. Rien n'est enregistré.

import { useMemo } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { bookOrder } from "../book";
import { novelReport, screenplayReport } from "../review/report";
import { checkStory, type Finding } from "../review/checks";
import { scenesNaming as scriptScenesNaming } from "../review/filter";
import { paginate } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { scenesNaming } from "../manuscript";
import { useRibbon } from "./useRibbon";

export function useStoryFindings(): Finding[] {
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const paper = useCosmos((s) => s.paper);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const pitch = useCosmos((s) => s.pitch);
  const lang = useSettings((s) => s.lang);
  const drifts = useRibbon()?.drifts;
  return useMemo(() => {
    const cards = nodes.map((n) => n.data);
    const order = kind === "scenario" ? [] : bookOrder(nodes, plan);
    const rows = kind === "scenario" ? (screenplay ? screenplayReport(screenplay.elements, cards, lang) : []) : novelReport(manuscript, order, cards);
    const elements = screenplay?.elements ?? [];
    const pages = kind === "scenario" && elements.length > 0 ? paginate(elements, LAYOUTS[paper]).pages : 0;
    // Scènes qui nomment chaque objet (titre entier, sans casse ni accents).
    const named = new Map<string, number>();
    for (const c of cards) {
      if (c.type !== "objet" || !c.title.trim()) continue;
      if (kind === "scenario") named.set(c.id, scriptScenesNaming(elements, c.title.trim()).length);
      else named.set(c.id, scenesNaming(c, manuscript, order));
    }
    return checkStory(cards, rows, kind, pitch, { pages, named, drifts });
  }, [kind, screenplay, paper, nodes, plan, manuscript, pitch, lang, drifts]);
}
