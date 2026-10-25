// Statistiques du projet ouvert, relues dans le texte (rien n'est enregistré) : personnages, lieux, scènes
// partagées. Partagées par la fenêtre Statistiques, la ligne sous chaque fiche de la Bible et la carte des
// Relations, pour que tout le monde compte de la même façon.

import { useMemo } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { bookOrder } from "../book";
import { usePagination } from "./usePagination";
import { novelReport, screenplayReport } from "../review/report";
import { novelPlaces, screenplayPlaces, settingSummary } from "../review/places";
import { novelCast, screenplayCast } from "../review/crossings";

export function useProjectStats() {
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const lang = useSettings((s) => s.lang);
  const pagination = usePagination();
  const script = kind === "scenario";
  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const order = useMemo(() => (script ? [] : bookOrder(nodes, plan)), [script, nodes, plan]);
  const characters = useMemo(
    () => (script ? (screenplay ? screenplayReport(screenplay.elements, cards, lang) : []) : novelReport(manuscript, order, cards)),
    [script, screenplay, cards, lang, manuscript, order],
  );
  const places = useMemo(
    () => (script ? (screenplay ? screenplayPlaces(screenplay.elements, cards, pagination, lang) : []) : novelPlaces(manuscript, order, cards, edges)),
    [script, screenplay, cards, lang, manuscript, order, edges, pagination],
  );
  const summary = useMemo(() => (script && screenplay ? settingSummary(screenplay.elements) : undefined), [script, screenplay]);
  const cast = useMemo(
    () => (script ? (screenplay ? screenplayCast(screenplay.elements, cards, lang) : { people: [], scenes: [] }) : novelCast(manuscript, order, cards)),
    [script, screenplay, cards, lang, manuscript, order],
  );
  return { script, characters, places, summary, cast };
}
