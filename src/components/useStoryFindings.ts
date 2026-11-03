// Questions sur l'histoire de l'onglet « Vérifier » (lots 6 et 7 de la Bible v2) : relues dans le projet ouvert,
// avec les statistiques des personnages (mêmes comptes que la fenêtre Statistiques), la longueur du pilote et
// les scènes qui nomment chaque objet. Rien n'est enregistré.

import { useMemo } from "react";
import { currentScript, useCosmos } from "../store";
import { useSettings } from "../settings";
import { bookOrder } from "../book";
import { novelReport, screenplayReport } from "../review/report";
import { checkStory, type Finding } from "../review/checks";
import { scenesNaming as scriptScenesNaming } from "../review/filter";
import { paginate } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { scenesNaming } from "../manuscript";
import { useRibbon } from "./useRibbon";
import { allEpisodes, episodeScript } from "../screenplay/series";
import { seriesLinks } from "../episodes";
import { listScenes, sceneCharacters } from "../screenplay/scenes";
import { useEpisodeLabel } from "./EpisodePicker";

export function useStoryFindings(): Finding[] {
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos(currentScript);
  const full = useCosmos((s) => s.screenplay);
  const paper = useCosmos((s) => s.paper);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const pitch = useCosmos((s) => s.pitch);
  const lang = useSettings((s) => s.lang);
  const drifts = useRibbon()?.drifts;
  const edges = useCosmos((s) => s.edges);
  const episodeLabel = useEpisodeLabel();
  return useMemo(() => {
    const cards = nodes.map((n) => n.data);
    const order = kind === "scenario" ? [] : bookOrder(nodes, plan);
    const rows = kind === "scenario" ? (screenplay ? screenplayReport(screenplay.elements, cards, lang) : []) : novelReport(manuscript, order, cards);
    const elements = screenplay?.elements ?? [];
    // Série : la longueur attendue est celle du pilote (premier épisode), pas de toute la saison.
    const episodes = full ? allEpisodes(full.elements) : [];
    const pilot = full && episodes.length > 0 ? episodeScript(full, episodes[0].id).elements : elements;
    const pages = kind === "scenario" && pilot.length > 0 ? paginate(pilot, LAYOUTS[paper]).pages : 0;
    // Scènes qui nomment chaque objet (titre entier, sans casse ni accents).
    const named = new Map<string, number>();
    for (const c of cards) {
      if (c.type !== "objet" || !c.title.trim()) continue;
      if (kind === "scenario") named.set(c.id, scriptScenesNaming(elements, c.title.trim()).length);
      else named.set(c.id, scenesNaming(c, manuscript, order));
    }
    // Série (lot 3) : longueur et personnages de chaque épisode, pour « Vérifier ».
    const series =
      kind === "scenario" && full && episodes.length > 0
        ? (() => {
            const parts = episodes.map((ep) => {
              const els = full.elements.slice(ep.start, ep.end);
              return { ep, els, scenes: listScenes(els).map((sc) => ({ cardId: sc.cardId, speakers: sceneCharacters(els, sc).map((c) => c.name) })) };
            });
            const links = seriesLinks(parts.map((p) => ({ id: p.ep.id, scenes: p.scenes })), cards, edges);
            return parts.map(({ ep, els }) => ({
              id: ep.id,
              label: episodeLabel(ep),
              pages: els.length > 0 ? paginate(els, LAYOUTS[paper]).pages : 0,
              cast: new Set(links.filter((l) => l.source === ep.id).map((l) => l.target)),
            }));
          })()
        : undefined;
    return checkStory(cards, rows, kind, pitch, { pages, named, drifts, episodes: kind === "scenario" ? episodes.length : undefined, series });
  }, [kind, screenplay, full, paper, nodes, plan, manuscript, pitch, lang, drifts, edges, episodeLabel]);
}
