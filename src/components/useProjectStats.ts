// Statistiques du projet ouvert, relues dans le texte (rien n'est enregistré) : personnages, lieux, scènes
// partagées. Partagées par la fenêtre Statistiques, la ligne sous chaque fiche de la Bible et la carte des
// Relations, pour que tout le monde compte de la même façon.

import { useMemo } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { bookOrder } from "../book";
import { paginate } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { seriesPart } from "../screenplay/series";
import { novelReport, screenplayReport, withPov } from "../review/report";
import { listScenes } from "../screenplay/scenes";
import { silentCharacters } from "../review/silent";
import { countWords } from "../manuscript";
import { novelPlaces, screenplayPlaces, settingSummary } from "../review/places";
import { novelCast, screenplayCast } from "../review/crossings";

/** `part` (série, lot 3) : une saison ou un épisode seul ; sans lui, tout le scénario. */
export function useProjectStats(part: string | null = null) {
  const kind = useCosmos((s) => s.kind);
  const full = useCosmos((s) => s.screenplay);
  const paper = useCosmos((s) => s.paper);
  const screenplay = useMemo(() => (full && part ? seriesPart(full, part, "") : full), [full, part]);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const lang = useSettings((s) => s.lang);
  // Pagination du texte compté (toute la série, ou la partie choisie) : les rangs d'éléments sont les siens.
  const pagination = useMemo(() => (screenplay ? paginate(screenplay.elements, LAYOUTS[paper]) : null), [screenplay, paper]);
  const script = kind === "scenario";
  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const order = useMemo(() => (script ? [] : bookOrder(nodes, plan)), [script, nodes, plan]);
  const characters = useMemo(
    () =>
      script
        ? screenplay
          ? withPov(
              // Personnages muets sans carte (#47) : une ligne « Sans réplique » de plus.
              screenplayReport(screenplay.elements, cards, lang, silentCharacters(screenplay.elements, cards).map((c) => c.name)),
              cards,
              listScenes(screenplay.elements).flatMap((s) => (s.cardId ? [s.cardId] : [])),
            )
          : []
        : withPov(novelReport(manuscript, order, cards), cards, order, (id) => countWords(manuscript[id])),
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
