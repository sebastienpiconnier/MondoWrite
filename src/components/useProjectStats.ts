// Statistiques du projet ouvert, relues dans le texte (rien n'est enregistré) : personnages, lieux, scènes
// partagées. Partagées par la fenêtre Statistiques, la ligne sous chaque fiche de la Bible et la carte des
// Relations, pour que tout le monde compte de la même façon.

import { useMemo, useRef } from "react";
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
  // Les chiffres ne lisent des cartes que leur nom, leur type et quelques champs (genre, surnoms, narrateur, page du
  // livre). Taper dans une fiche (« Veut », notes…) change `nodes` à chaque pause : sans cette clé, toute la Bible
  // relisait le scénario entier (répliques, muets, décors, croisements), une à deux secondes sur un gros projet.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const signature = useMemo(() => statsSignature(nodes), [nodes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cards = useMemo(() => nodesRef.current.map((n) => n.data), [signature]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const order = useMemo(() => (script ? [] : bookOrder(nodesRef.current, plan)), [script, signature, plan]);
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

/** Ce que les statistiques lisent des cartes : une autre valeur ici, et tout est recompté. */
export function statsSignature(nodes: readonly { data: { id: string; type: string; title: string; page?: string; fiche?: Record<string, string> } }[]): string {
  return nodes
    .map(({ data: d }) => {
      const f = d.fiche ?? {};
      return [d.id, d.type, d.title, d.page ?? "", f.genre ?? "", f.surnoms ?? "", f.pov ?? "", f.prenom ?? "", f.nom ?? ""].join("\u0001");
    })
    .join("\u0002");
}
