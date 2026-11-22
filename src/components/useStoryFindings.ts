// Questions sur l'histoire de l'onglet « Vérifier » (lots 6 et 7 de la Bible v2) : relues dans le projet ouvert,
// avec les statistiques des personnages (mêmes comptes que la fenêtre Statistiques), la longueur du pilote et
// les scènes qui nomment chaque objet. Rien n'est enregistré.

import { unthreaded } from "../threadFilter";
import { setupProblems } from "../setups";
import { transitionsToReread } from "../transitions";
import { approvedJunctions, junctionOrder } from "../projectJunctions";
import { numbersKey, usePaperbackSpreads } from "../interactive/spreads";
import { useMemo } from "react";
import { currentScript, useCosmos } from "../store";
import { useSettings } from "../settings";
import { useT } from "../i18n";
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
import { useInteractive } from "../interactive/useInteractive";
import { interactiveScenes } from "../interactive/scenes";
import { verifyKey, verifyStory } from "../interactive/verify";
import { readFactLabels } from "../interactive/facts";
import { projectSections } from "../interactive/projectSections";

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
  const interactive = useInteractive();
  const metaKeep = useCosmos((s) => s.metaKeep);
  // Roman interactif (lot 5) : le chemin du lecteur.
  const untitled = useT().interactive.map.untitled;
  const spreads = usePaperbackSpreads();
  const verified = useMemo<Finding[]>(() => {
    if (!interactive) return [];
    const scenes = interactiveScenes(nodes, plan);
    const titles = new Map(scenes.map((sc) => [sc.id, sc.title.trim() || untitled]));
    const sections = projectSections({ nodes, plan, manuscript, metaKeep });
    // Pages du dernier livre broché composé, si les numéros n'ont pas changé depuis (lot 13).
    const spans = spreads.key === numbersKey(sections.numbers) ? spreads.spans : null;
    return verifyStory(scenes, manuscript, readFactLabels(metaKeep), sections, spans).map((p) => ({
      key: `verify:${verifyKey(p)}`,
      rule: p.rule,
      at: -1,
      scene: 0,
      sceneId: p.scene,
      text: titles.get(p.scene ?? "") ?? "",
      ...(p.label ? { names: [p.label] } : {}),
    }));
  }, [interactive, nodes, plan, manuscript, metaKeep, untitled, spreads]);
  // Enchaînements à relire après un déplacement (#120), jamais dans un roman interactif.
  const rereads = useMemo(
    () => (interactive ? [] : transitionsToReread(approvedJunctions(metaKeep), junctionOrder(kind, nodes, plan, full))),
    [interactive, metaKeep, kind, nodes, plan, full],
  );
  const story = useMemo(() => {
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
    // Intrigues et thèmes reliés à aucune scène du récit (#118).
    const sceneIds = kind === "scenario" ? listScenes(full?.elements ?? elements).flatMap((x) => (x.cardId ? [x.cardId] : [])) : order;
    const unthreadedIds = unthreaded(cards, edges, sceneIds).map((c) => c.id);
    return checkStory(cards, rows, kind, pitch, { pages, named, drifts, episodes: kind === "scenario" ? episodes.length : undefined, series, unthreaded: unthreadedIds, setups: setupProblems(edges, sceneIds), rereads });
  }, [kind, screenplay, full, paper, nodes, plan, manuscript, pitch, lang, drifts, edges, episodeLabel, rereads]);
  return useMemo(() => (verified.length ? [...verified, ...story] : story), [verified, story]);
}
