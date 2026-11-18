// Roman interactif, lot 11 (#91) : ce que le canevas montre de l'histoire. Calculé une fois par `Toile`, jamais par
// chaque carte : les flèches de choix (passées à React Flow avec les fils) et les repères des cartes Scène, posés dans
// un petit store d'affichage que chaque carte lit par son identifiant. Rien n'est enregistré.

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { MarkerType, type Edge } from "@xyflow/react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { useInteractive } from "./useInteractive";
import { interactiveScenes } from "./scenes";
import { END_TARGET, choiceGraph, type ChoiceEdge, type SceneRef } from "./choices";
import { verifyStory } from "./verify";
import { choiceEdgeId, labelPlaces, marksKey, parallelOffsets, sceneMarks, scenesKey } from "./storyMap";
import { numberSections } from "./gamebook";
import { interactiveSlugs } from "./scenes";
import { ruleSummary } from "../components/ChoiceRules";
import { projectFacts } from "./projectFacts";
import { readFactLabels, type Fact } from "./facts";

/** Repères des cartes Scène (chaînes de `marksKey`), par identifiant. État d'affichage. */
export const useStoryMarks = create<{ byId: Record<string, string>; numbers: Record<string, number> }>(() => ({ byId: {}, numbers: {} }));

const NO_MARKS: Record<string, string> = {};
const NO_NUMBERS: Record<string, number> = {};
const NO_FACTS: Fact[] = [];

export interface StoryMap {
  scenes: SceneRef[];
  graph: ChoiceEdge[];
  /** Flèches de choix pour React Flow (sans les fins, qui sont des repères de la carte). */
  edges: Edge[];
}

/** L'histoire telle que le canevas la montre, ou null hors d'un roman interactif. */
export function useStoryMap(): StoryMap | null {
  const t = useT();
  const m = t.interactive.map;
  const interactive = useInteractive();
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const metaKeep = useCosmos((s) => s.metaKeep);
  // Les cartes bougent sans cesse sur le canevas : la liste des scènes n'est refaite que si ses titres ou son ordre changent.
  const live = interactive ? interactiveScenes(nodes, plan) : null;
  const key = live ? scenesKey(live) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scenes = useMemo(() => live ?? [], [key]);
  const graph = useMemo(() => (interactive ? choiceGraph(manuscript, scenes) : []), [interactive, manuscript, scenes]);
  const points = useMemo(() => (interactive ? verifyStory(scenes, manuscript, readFactLabels(metaKeep)) : []), [interactive, scenes, manuscript, metaKeep]);
  // Hors d'un roman interactif, rien n'est lu : un roman ordinaire ne paie rien à chaque déplacement de carte.
  const facts = useCosmos((s) => (interactive ? projectFacts(s) : NO_FACTS));

  useEffect(() => {
    if (!interactive) {
      if (useStoryMarks.getState().byId !== NO_MARKS) useStoryMarks.setState({ byId: NO_MARKS, numbers: NO_NUMBERS });
      return;
    }
    const byId: Record<string, string> = {};
    for (const [id, marks] of sceneMarks(scenes, graph, manuscript, points)) byId[id] = marksKey(marks);
    // Numéro de chaque scène dans le livre-jeu imprimé (le départ au 1), le même que dans le Plan.
    const numbers: Record<string, number> = {};
    const { nodes: all, plan: p } = useCosmos.getState();
    for (const sec of numberSections({ scenes, slugs: interactiveSlugs(all, p), manuscript })) numbers[sec.id] = sec.n;
    useStoryMarks.setState({ byId, numbers });
  }, [interactive, scenes, graph, manuscript, points]);
  // Le canevas se ferme (autre vue, autre projet) : plus de repères.
  useEffect(() => () => useStoryMarks.setState({ byId: NO_MARKS, numbers: NO_NUMBERS }), []);

  const edges = useMemo<Edge[]>(() => {
    if (!interactive) return [];
    const titleOf = (id: string) => scenes.find((s) => s.id === id)?.title.trim() || m.untitled;
    const drawn = graph.filter((e): e is ChoiceEdge & { to: string } => !!e.to && e.to !== END_TARGET && e.to !== e.from);
    const offsets = parallelOffsets(drawn);
    const places = labelPlaces(drawn);
    return drawn
      .map((e) => {
        // Un choix soumis à un fait, ou qui en donne un, le dit sur sa flèche.
        const rules = ruleSummary(e, facts, { ifFact: m.edgeIf, ifNot: m.edgeIfNot, gives: m.edgeGives });
        return {
          id: choiceEdgeId(e.from, e.index),
          type: "floating",
          source: e.from,
          target: e.to,
          label: [rules.before, e.label || m.defaultLabel, rules.after].filter(Boolean).join(" · "),
          ariaLabel: fmt(m.edgeAria, { label: e.label || m.defaultLabel, from: titleOf(e.from), to: titleOf(e.to) }),
          className: e.label ? "choice-edge" : "choice-edge is-unnamed",
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--accent)" },
          // Choix soumis à une condition : flèche en pointillé.
          style: { stroke: "var(--accent)", strokeWidth: 1.8, ...(e.cond ? { strokeDasharray: "6 4" } : {}) },
          interactionWidth: 32,
          // Étiquette en pilule, posée loin des choix voisins (`labelPlaces`) ; son nom dit d'où à où va le choix.
          data: {
            choice: true,
            pill: true,
            pillClass: e.label ? "" : "is-unnamed",
            pillTitle: fmt(m.edgeAria, { label: e.label || m.defaultLabel, from: titleOf(e.from), to: titleOf(e.to) }),
            offset: offsets.get(`${e.from}:${e.index}`) ?? 0,
            labelAt: places.get(`${e.from}:${e.index}`) ?? 0.5,
          },
        } satisfies Edge;
      });
    // Les textes suivent la langue : `t` change avec elle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, graph, scenes, facts, t]);

  return interactive ? { scenes, graph, edges } : null;
}
