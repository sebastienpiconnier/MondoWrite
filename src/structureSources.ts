// Ce que les aides « Structure et Bible » (ai/structure.ts) lisent du projet ouvert : cartes et texte de leurs scènes,
// scènes du récit en paragraphes, scènes à dépouiller, cases du gabarit avec leurs scènes. Fonctions pures, qui
// reçoivent l'état du projet (ou ce qu'il en faut) : rien n'est enregistré.

import type { CardData, ProjectKind } from "./types";
import type { Screenplay } from "./screenplay/model";
import { arrange, templateBeats, type Plan, type PlanTemplate } from "./plan";
import { bookOrder, storyScenes } from "./book";
import { plainText } from "./search";
import { headingOf, sceneBody, sceneText } from "./screenplay/sceneText";
import { listScenes, sceneSynopsis } from "./screenplay/scenes";
import { screenplayPlan } from "./screenplay/template";
import { htmlParagraphs, screenplayParagraphs, wireCardOf, type BeatRow, type BreakdownScene, type RetroScene, type WireCard } from "./ai/structure";

/** Une carte posée sur le canevas (CardNode, ou ce qu'il en faut). */
export interface Positioned {
  id: string;
  data: CardData;
  position: { x: number; y: number };
}

export interface ProjectSource {
  kind: ProjectKind;
  nodes: Positioned[];
  plan: Plan;
  manuscript: Record<string, string>;
  screenplay: Screenplay | null;
}

/** Texte d'une scène : synopsis et texte (manuscrit d'un roman, corps Fountain d'un scénario). */
export function sceneTextOf(s: ProjectSource, card: CardData, lang: string): string {
  if (card.type !== "scene") return "";
  if (s.kind === "scenario" && s.screenplay) {
    const at = headingOf(s.screenplay.elements, card.id);
    return at >= 0 ? [sceneSynopsis(s.screenplay.elements, at), sceneText(sceneBody(s.screenplay.elements, at), lang)].filter(Boolean).join("\n") : "";
  }
  return [card.fiche?.synopsis ?? "", plainText(s.manuscript[card.id] ?? "")].filter(Boolean).join("\n");
}

/** Les cartes pour « Ranger les fils ». */
export const wireCards = (s: ProjectSource, lang: string): WireCard[] => s.nodes.map((n) => wireCardOf(n.data, sceneTextOf(s, n.data, lang)));

/** Le récit en scènes et paragraphes, dans l'ordre de lecture (livre d'un roman, fichier Fountain d'un scénario). */
export function storyParagraphs(s: ProjectSource, lang: string): RetroScene[] {
  if (s.kind === "scenario") {
    if (!s.screenplay) return [];
    const elements = s.screenplay.elements;
    return listScenes(elements).map((scene) => ({ id: scene.cardId ?? `#${scene.number}`, heading: scene.text, paragraphs: screenplayParagraphs(elements.slice(scene.index, scene.end), lang) }));
  }
  return bookOrder(s.nodes, s.plan).flatMap((id) => (s.manuscript[id] ? [{ id, paragraphs: htmlParagraphs(s.manuscript[id]) }] : []));
}

/** Scènes du scénario à dépouiller (celles qui ont une carte : leur fiche reçoit le dépouillement), dans l'ordre. */
export function breakdownScenes(screenplay: Screenplay | null, lang: string, only?: string): BreakdownScene[] {
  if (!screenplay) return [];
  const elements = screenplay.elements;
  return listScenes(elements).flatMap((scene) => {
    if (!scene.cardId || (only && scene.cardId !== only)) return [];
    const lines = screenplayParagraphs(elements.slice(scene.index, scene.end), lang, true);
    return lines.length > 1 ? [{ id: scene.cardId, heading: scene.text, text: lines.join("\n") }] : [];
  });
}

/** Cases du gabarit en place, dans l'ordre, avec leurs scènes (titre et synopsis). Vide pour un plan libre. */
export function beatRows(s: ProjectSource, label: (key: string) => { label: string; hint: string }): { template: PlanTemplate | null; rows: BeatRow[] } {
  const cards = new Map(s.nodes.map((n) => [n.id, n.data]));
  const scene = (id: string) => {
    const card = cards.get(id);
    const at = s.kind === "scenario" && s.screenplay ? headingOf(s.screenplay.elements, id) : -1;
    const synopsis = at >= 0 ? sceneSynopsis(s.screenplay!.elements, at) : (card?.fiche?.synopsis ?? "");
    return { id, title: card?.title.trim() ?? "", synopsis };
  };
  if (s.kind === "scenario") {
    const plan = screenplayPlan(s.screenplay?.elements ?? []);
    if (plan.template === "libre") return { template: null, rows: [] };
    return { template: plan.template, rows: templateBeats(plan.template, plan.custom).map((key) => ({ key, ...label(key), scenes: (plan.beats[key] ?? []).map(scene) })) };
  }
  if (s.plan.template === "libre") return { template: null, rows: [] };
  return { template: s.plan.template, rows: arrange(s.plan, storyScenes(s.nodes)).beats.map((b) => ({ key: b.key, ...label(b.key), scenes: b.ids.map(scene) })) };
}
