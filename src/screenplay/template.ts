// Gabarits du séquencier (trois actes, Save the Cat, huit séquences, épisode de série).
// Dans un scénario, une case de gabarit est une section Fountain (« # Catalyseur ») : l'ordre des scènes
// reste celui du fichier, et les autres logiciels voient de simples sections. Pour reconnaître les
// sections posées par un gabarit, chacune porte une note [[cosmos:beat:<clé>]], ignorée ailleurs.
// Fonctions pures : même objet rendu quand rien ne change.

import type { Screenplay, ScreenplayElement } from "./model";
import { blocks, moveBlock } from "./sequence";
import { EMPTY_PLAN, PLAN_TEMPLATES, type Plan, type PlanTemplate } from "../plan";

/** Gabarits proposés pour un scénario, dans l'ordre du menu. */
export const SCREENPLAY_TEMPLATES = ["troisActes", "saveTheCat", "huitSequences", "episode", "voyageHeros", "cercleHarmon", "freytag", "hauge", "septPoints", "kishotenketsu", "romance", "polar"] as const satisfies readonly PlanTemplate[];
export type ScreenplayTemplate = (typeof SCREENPLAY_TEMPLATES)[number];
export const isScreenplayTemplate = (v: unknown): v is ScreenplayTemplate => SCREENPLAY_TEMPLATES.includes(v as ScreenplayTemplate);

const BEAT_RE = /\s*\[\[cosmos:beat:([a-z0-9_]+)\]\]/;

/** Clé de case portée par une section, sinon null. */
export const beatOf = (text: string): string | null => BEAT_RE.exec(text)?.[1] ?? null;

/** Texte d'une section sans sa note de gabarit (ce que l'auteur lit). */
export const sectionLabel = (text: string): string => text.replace(BEAT_RE, "").trim();

const isBeat = (el: ScreenplayElement) => el.type === "section" && beatOf(el.text) !== null;

/** Gabarit en place dans ce scénario, d'après ses sections. */
export function currentTemplate(elements: ScreenplayElement[]): ScreenplayTemplate | null {
  for (const el of elements) {
    const key = el.type === "section" ? beatOf(el.text) : null;
    if (!key) continue;
    const found = SCREENPLAY_TEMPLATES.find((t) => (PLAN_TEMPLATES[t] as readonly string[]).includes(key));
    if (found) return found;
  }
  return null;
}

/**
 * Pose un gabarit (ou le retire, `template` null). Les sections d'un gabarit précédent sont retirées ;
 * les sections écrites par l'auteur et tout le texte restent. La première case se place avant la première
 * scène, les suivantes à la fin : toutes les scènes sont d'abord dans la première case, à l'auteur de les répartir.
 */
export function applyTemplate(screenplay: Screenplay, template: ScreenplayTemplate | null, label: (key: string) => string): Screenplay {
  if (currentTemplate(screenplay.elements) === template) return screenplay;
  const kept = screenplay.elements.filter((el) => !isBeat(el));
  if (!template) return { ...screenplay, elements: kept };
  const sections = PLAN_TEMPLATES[template].map(
    (key): ScreenplayElement => ({ type: "section", depth: 1, text: `${label(key)} [[cosmos:beat:${key}]]` }),
  );
  const first = kept.findIndex((el) => el.type === "sceneHeading" || el.type === "section");
  const at = first === -1 ? kept.length : first;
  return { ...screenplay, elements: [...kept.slice(0, at), sections[0], ...kept.slice(at), ...sections.slice(1)] };
}

/**
 * Range la scène (bloc `from`) à la fin de la section (bloc `section`) : après la dernière scène
 * qui précède la section suivante. Même tableau si elle y est déjà la dernière.
 */
export function moveToSection(elements: ScreenplayElement[], from: number, section: number): ScreenplayElement[] {
  const list = blocks(elements);
  if (list[from]?.kind !== "scene" || list[section]?.kind !== "section") return elements;
  let last = section;
  while (last + 1 < list.length && list[last + 1].kind === "scene") last++;
  if (from === last) return elements;
  return moveBlock(elements, from, from < last ? last : last + 1);
}

/** Bloc de la section qui contient ce bloc (la dernière section placée avant lui), ou -1. */
export function sectionOf(elements: ScreenplayElement[], block: number): number {
  const list = blocks(elements);
  for (let i = Math.min(block, list.length - 1); i >= 0; i--) if (list[i].kind === "section") return i;
  return -1;
}

/**
 * Plan d'un scénario lu dans ses sections, comme celui d'un roman : le gabarit en place et, pour chaque case,
 * les cartes de ses scènes dans l'ordre du fichier. Une scène placée avant la première case n'est dans
 * aucune (elle sera « À placer ») ; une section de l'auteur ne change pas de case. Sans gabarit : plan libre.
 * Sert au canevas (« Organiser », cadres des cases), jamais écrit dans cosmos.json.
 */
export function screenplayPlan(elements: ScreenplayElement[]): Plan {
  const template = currentTemplate(elements);
  if (!template) return EMPTY_PLAN;
  const keys = new Set<string>(PLAN_TEMPLATES[template]);
  const beats: Record<string, string[]> = {};
  let beat: string | null = null;
  for (const el of elements) {
    if (el.type === "section") {
      const key = beatOf(el.text);
      if (key && keys.has(key)) beat = key;
    } else if (el.type === "sceneHeading" && el.cardId && beat) {
      (beats[beat] ??= []).push(el.cardId);
    }
  }
  return { template, beats };
}

/**
 * Range la scène de la carte `cardId` dans la case `beat` (section du gabarit), à la place `index` parmi les
 * scènes de cette case (à la fin sans index). Les sections de l'auteur à l'intérieur de la case sont
 * enjambées. Même tableau si rien ne bouge ou si la scène ou la case n'existent pas.
 */
export function placeSceneInBeat(elements: ScreenplayElement[], cardId: string, beat: string, index?: number): ScreenplayElement[] {
  const list = blocks(elements);
  const from = list.findIndex((b) => b.kind === "scene" && b.cardId === cardId);
  const section = list.findIndex((b) => b.kind === "section" && beatOf(b.text) === beat);
  if (from < 0 || section < 0) return elements;
  const isBeatSection = (i: number) => list[i].kind === "section" && beatOf(list[i].text) !== null;
  let next = section + 1;
  while (next < list.length && !isBeatSection(next)) next++;
  const inside: number[] = [];
  for (let i = section + 1; i < next; i++) if (list[i].kind === "scene" && i !== from) inside.push(i);
  const order = list.map((_, i) => i).filter((i) => i !== from);
  const at = index !== undefined && index >= 0 && index < inside.length ? order.indexOf(inside[index]) : next < list.length ? order.indexOf(next) : order.length;
  order.splice(at, 0, from);
  if (order.every((v, i) => v === i)) return elements;
  const head = elements.slice(0, list[0].start);
  return head.concat(...order.map((i) => elements.slice(list[i].start, list[i].end)));
}
