// Ruban du récit : une bande en haut du Manuscrit et du Scénario, où chaque case du gabarit prend la place que
// ses scènes occupent vraiment (mots d'un roman, pages d'un scénario), avec, en fantôme, la position où cette
// case commence d'ordinaire (BEAT_TARGETS). Rien n'est enregistré : tout se relit dans le projet. Fonctions pures.

import { BEAT_TARGETS, PLAN_TEMPLATES, arrange, templateBeats, type Plan, type PlanBeat, type PlanTemplate } from "./plan";
import { blocks } from "./screenplay/sequence";
import { beatOf, screenplayPlan } from "./screenplay/template";
import type { ScreenplayElement } from "./screenplay/model";

export interface RibbonScene {
  /** Carte de la scène (roman, scénario), ou `@<index>` pour une scène de scénario sans carte. */
  id: string;
  /** Longueur : mots (roman) ou pages (scénario). */
  size: number;
}

/** Une case du gabarit et ses scènes, dans l'ordre du récit. `key` null : scènes hors de toute case. */
export interface RibbonGroup {
  key: string | null;
  scenes: RibbonScene[];
}

export interface RibbonSegment {
  key: string | null;
  /** Début et longueur, en part du récit (0 à 1). */
  start: number;
  length: number;
  scenes: { id: string; start: number; length: number }[];
}

/** Une case qui commence loin de sa place habituelle. */
export interface RibbonDrift {
  key: string;
  /** Où elle commence, et où elle commence d'ordinaire (0 à 1). */
  at: number;
  target: number;
  /** Sa première scène (pour y aller). */
  sceneId: string;
}

export interface Ribbon {
  template: PlanTemplate;
  segments: RibbonSegment[];
  markers: { key: string; at: number }[];
  drifts: RibbonDrift[];
  /** Vrai quand le ruban suit la longueur du texte ; faux tant que le récit est trop peu écrit (une part par scène). */
  measured: boolean;
}

/** Écart au-delà duquel une case est signalée (dix points du récit). */
export const DRIFT = 0.1;
/** En dessous, pas de question : le récit est trop court pour que les proportions disent quelque chose. */
export const DRIFT_MIN_SCENES = 6;
/** Part des scènes écrites pour mesurer le texte plutôt que compter les scènes. */
const WRITTEN_SHARE = 0.8;

export function buildRibbon(template: PlanTemplate, groups: RibbonGroup[]): Ribbon {
  const scenes = groups.flatMap((g) => g.scenes);
  const written = scenes.filter((s) => s.size > 0).length;
  const measured = scenes.length > 0 && written >= scenes.length * WRITTEN_SHARE;
  const sizeOf = (s: RibbonScene) => (measured ? s.size : 1);
  const total = scenes.reduce((a, s) => a + sizeOf(s), 0);
  let pos = 0;
  const segments = groups.map((g): RibbonSegment => {
    const start = total > 0 ? pos / total : 0;
    const inner = g.scenes.map((s) => {
      const at = total > 0 ? pos / total : 0;
      pos += sizeOf(s);
      return { id: s.id, start: at, length: total > 0 ? sizeOf(s) / total : 0 };
    });
    return { key: g.key, start, length: total > 0 ? pos / total - start : 0, scenes: inner };
  });
  const keys = template === "libre" ? [] : (PLAN_TEMPLATES[template] as readonly string[]);
  const markers = keys.flatMap((key) => {
    const at = BEAT_TARGETS[key as PlanBeat];
    return at === undefined ? [] : [{ key, at }];
  });
  const drifts: RibbonDrift[] = [];
  if (measured && scenes.length >= DRIFT_MIN_SCENES) {
    for (const seg of segments) {
      if (!seg.key || seg.scenes.length === 0) continue;
      const target = BEAT_TARGETS[seg.key as PlanBeat];
      if (target === undefined || target === 0) continue;
      if (Math.abs(seg.start - target) > DRIFT) drifts.push({ key: seg.key, at: seg.start, target, sceneId: seg.scenes[0].id });
    }
  }
  return { template, segments, markers, drifts, measured };
}

/** Roman : les cases du plan (vides comprises), puis les scènes « À placer ». */
export function novelGroups(plan: Plan, sceneIds: string[], words: (id: string) => number): RibbonGroup[] {
  const { beats, unplaced } = arrange(plan, sceneIds);
  const scene = (id: string): RibbonScene => ({ id, size: words(id) });
  if (plan.template === "libre") return [{ key: null, scenes: beats[0].ids.map(scene) }];
  return [...beats.map((b) => ({ key: b.key, scenes: b.ids.map(scene) })), ...(unplaced.length > 0 ? [{ key: null, scenes: unplaced.map(scene) }] : [])];
}

/**
 * Scénario : les scènes dans l'ordre du fichier, regroupées par section du gabarit (vides comprises) ; celles
 * d'avant la première case forment un groupe sans case. `pages(start, end)` mesure un bloc.
 */
export function screenplayGroups(elements: ScreenplayElement[], pages: (start: number, end: number) => number): { template: PlanTemplate; groups: RibbonGroup[] } {
  const { template, custom } = screenplayPlan(elements);
  const keys = new Set<string>(templateBeats(template, custom));
  const groups: RibbonGroup[] = [{ key: null, scenes: [] }];
  for (const b of blocks(elements)) {
    if (b.kind === "section") {
      const key = beatOf(b.text);
      if (key && keys.has(key)) groups.push({ key, scenes: [] });
      continue;
    }
    groups[groups.length - 1].scenes.push({ id: b.cardId ?? `@${b.start}`, size: pages(b.start, b.end) });
  }
  return { template, groups: groups.filter((g, i) => i > 0 || g.scenes.length > 0) };
}

/** Un point de la courbe du récit : milieu de la scène (0 à 1) et fortune du héros (−1 à 1). */
export interface CurvePoint {
  id: string;
  x: number;
  y: number;
  /** Faux quand la scène n'a pas dit comment elle finit (la courbe reste à plat). */
  set: boolean;
}

/**
 * Courbe du récit (formes de récit de Vonnegut) : chaque scène qui finit « mieux » pour le héros fait monter
 * la courbe d'un cran, « moins bien » la fait descendre ; sans réponse, elle reste à plat. Mise à l'échelle
 * pour tenir entre −1 et 1. Null tant que moins de deux scènes ont répondu.
 */
export function fortuneCurve(scenes: readonly { id: string; start: number; length: number }[], issueOf: (id: string) => string | undefined): CurvePoint[] | null {
  let level = 0;
  let answered = 0;
  const raw = scenes.map((s) => {
    const issue = issueOf(s.id);
    if (issue === "mieux") level++;
    else if (issue === "pire") level--;
    const set = issue === "mieux" || issue === "pire" || issue === "pareil";
    if (set) answered++;
    return { id: s.id, x: s.start + s.length / 2, y: level, set };
  });
  if (answered < 2) return null;
  const top = Math.max(1, ...raw.map((p) => Math.abs(p.y)));
  return raw.map((p) => ({ ...p, y: p.y / top }));
}
