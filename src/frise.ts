// La frise (#173) : le récit en cartes posées sur une ligne, dont la largeur suit la longueur (pages d'un scénario,
// mots d'un roman ramenés en pages). Une nouvelle vue, au même titre que le canevas. Rien n'est enregistré : tout se
// relit dans le projet (ordre du Plan ou du Fountain, cases de la structure, chapitres, épisodes, fils, fiches).
// Fonctions pures, testées (frise.test.ts) ; le composant est components/Frise.tsx.

import { arrange, chapterOf, hasSubBeats, type CustomTemplate, type Plan, type PlanTemplate } from "./plan";
import { blocks, moveBlock } from "./screenplay/sequence";
import { beatOf } from "./screenplay/template";
import { seriesMark } from "./screenplay/series";
import type { ScreenplayElement } from "./screenplay/model";
import { fortuneCurve, type CurvePoint } from "./ribbon";

/** Une scène de la frise. `id` : sa carte, ou `@<index>` pour une scène de scénario sans carte. */
export interface FriseScene {
  id: string;
  /** Titre de la carte, ou en-tête de la scène (scénario). */
  title: string;
  /** Longueur en pages (un roman : mots ramenés à des pages). */
  size: number;
  /** Mots d'une scène de roman. */
  words?: number;
}

/**
 * Une rangée de la vue « Récit » : une case de la structure, un chapitre, un épisode, ou les scènes hors de tout
 * cela (`key` null).
 */
export interface FriseRow {
  key: string | null;
  kind: "beat" | "chapter" | "episode" | "none";
  scenes: FriseScene[];
}

export type FriseGroup = "story" | "plots" | "chars";
export const FRISE_GROUPS: FriseGroup[] = ["story", "plots", "chars"];

/** Pixels par page, du plus serré au plus large (boutons − et +). */
export const FRISE_SCALES = [8, 16, 32, 64] as const;
export const DEFAULT_SCALE = 1;
/** Largeur la plus petite d'une carte (une scène de deux lignes reste lisible et se touche au doigt). */
export const MIN_CARD = 112;
/** Espace entre deux cartes. */
export const CARD_GAP = 6;

const sizeOf = (rows: FriseRow[]) => rows.reduce((a, r) => a + r.scenes.reduce((b, s) => b + s.size, 0), 0);
export const rowSize = (row: FriseRow) => row.scenes.reduce((a, s) => a + s.size, 0);
export const friseTotal = sizeOf;

/**
 * Scénario : les scènes dans l'ordre du fichier. Une série se range par épisode ; sinon une structure posée
 * (cases du gabarit, actes et séquences de l'auteur) se range par case ; sinon une seule rangée. `pages` mesure un
 * bloc, `keep` dit si une case vide garde sa rangée (un ensemble de sous-cases, non).
 */
export function screenplayRows(
  elements: ScreenplayElement[],
  pages: (start: number, end: number) => number,
  mode: "episodes" | "beats" | "none",
  beatKeys: ReadonlySet<string> = new Set(),
  keep: (key: string) => boolean = () => true,
): FriseRow[] {
  const rows: FriseRow[] = [{ key: null, kind: "none", scenes: [] }];
  for (const b of blocks(elements)) {
    if (b.kind === "section") {
      if (mode === "episodes") {
        const mark = seriesMark(elements[b.start]);
        if (mark?.kind === "episode") rows.push({ key: mark.id, kind: "episode", scenes: [] });
      } else if (mode === "beats") {
        const key = beatOf(b.text);
        if (key && beatKeys.has(key)) rows.push({ key, kind: "beat", scenes: [] });
      }
      continue;
    }
    if (b.omitted) continue;
    rows[rows.length - 1].scenes.push({ id: b.cardId ?? `@${b.start}`, title: b.text, size: pages(b.start, b.end) });
  }
  return rows.filter((r, i) => (i === 0 ? r.scenes.length > 0 : r.scenes.length > 0 || (r.kind === "beat" && r.key !== null && keep(r.key)) || r.kind === "episode"));
}

/**
 * Roman : les scènes du récit dans l'ordre du Plan. Avec une structure, une rangée par case (vides comprises, sauf
 * un ensemble de sous-cases) puis les scènes à placer ; en plan libre, une rangée par chapitre s'il y en a.
 */
export function novelRows(plan: Plan, sceneIds: string[], title: (id: string) => string, words: (id: string) => number, wordsPerPage: number): FriseRow[] {
  const scene = (id: string): FriseScene => {
    const w = words(id);
    return { id, title: title(id), size: w / wordsPerPage, words: w };
  };
  const { beats, unplaced } = arrange(plan, sceneIds);
  if (plan.template !== "libre") {
    const rows: FriseRow[] = beats.filter((b) => b.ids.length > 0 || !hasSubBeats(plan.custom, b.key)).map((b) => ({ key: b.key, kind: "beat", scenes: b.ids.map(scene) }));
    if (unplaced.length > 0) rows.push({ key: null, kind: "none", scenes: unplaced.map(scene) });
    return rows;
  }
  const order = [...beats.flatMap((b) => b.ids), ...unplaced];
  if (!(plan.chapters ?? []).length) return order.length > 0 ? [{ key: null, kind: "none", scenes: order.map(scene) }] : [];
  const rows: FriseRow[] = [];
  for (const id of order) {
    const chapter = chapterOf(plan, id)?.id ?? null;
    const last = rows[rows.length - 1];
    if (last && last.key === chapter) last.scenes.push(scene(id));
    else rows.push({ key: chapter, kind: chapter ? "chapter" : "none", scenes: [scene(id)] });
  }
  return rows;
}

/** Place d'une carte : à partir de `x`, sur `w` pixels. */
export interface Slot {
  x: number;
  w: number;
}

/** Largeur d'une carte : sa longueur à l'échelle, jamais moins que `MIN_CARD`. */
export const cardWidth = (size: number, pxPerPage: number) => Math.max(MIN_CARD, Math.round(size * pxPerPage));

/** Les scènes l'une après l'autre, sur une seule ligne. */
export function layoutScenes(scenes: readonly FriseScene[], pxPerPage: number): { slots: Map<string, Slot>; width: number } {
  const slots = new Map<string, Slot>();
  let x = 0;
  for (const s of scenes) {
    const w = cardWidth(s.size, pxPerPage);
    slots.set(s.id, { x, w });
    x += w + CARD_GAP;
  }
  return { slots, width: Math.max(0, x - CARD_GAP) };
}

/**
 * Graduations de la règle : au début de chaque scène, la page où elle commence ; une étiquette seulement quand elle
 * ne touche pas la précédente (`room` pixels).
 */
export function rulerTicks(scenes: readonly FriseScene[], slots: ReadonlyMap<string, Slot>, room = 56): { x: number; page: number; label: boolean }[] {
  const out: { x: number; page: number; label: boolean }[] = [];
  let page = 0;
  let lastLabel = -Infinity;
  let lastPage = -1;
  for (const s of scenes) {
    const slot = slots.get(s.id);
    if (!slot) continue;
    // Une étiquette quand la page change (jamais « 1, 1, 1 ») et qu'elle ne touche pas la précédente.
    const label = slot.x - lastLabel >= room && Math.floor(page) !== lastPage;
    if (label) {
      lastLabel = slot.x;
      lastPage = Math.floor(page);
    }
    out.push({ x: slot.x, page: Math.round(page * 10) / 10, label });
    page += s.size;
  }
  return out;
}

/** Début (x) de chaque rangée sur la ligne commune : les limites des actes dans les vues par intrigue et par personnage. */
export function rowStarts(rows: readonly FriseRow[], slots: ReadonlyMap<string, Slot>): { key: string | null; kind: FriseRow["kind"]; x: number }[] {
  return rows.flatMap((r) => {
    const first = r.scenes[0] && slots.get(r.scenes[0].id);
    return first ? [{ key: r.key, kind: r.kind, x: first.x }] : [];
  });
}

/**
 * Réponses « la scène finit mieux / pire » qui font la courbe d'un personnage (#150, premier pas) : les scènes qu'il
 * raconte (`fiche.pov`) ; pour un personnage principal, aussi les scènes sans point de vue (celles du héros).
 */
export function characterIssues(cards: readonly { id: string; type: string; fiche?: Record<string, string> }[], characterId: string, principal: boolean): Map<string, string> {
  const people = new Set(cards.filter((c) => c.type === "personnage").map((c) => c.id));
  const out = new Map<string, string>();
  for (const c of cards) {
    const issue = c.fiche?.issue;
    if (c.type !== "scene" || !issue) continue;
    const pov = c.fiche?.pov && people.has(c.fiche.pov) ? c.fiche.pov : "";
    if (pov === characterId || (principal && !pov)) out.set(c.id, issue);
  }
  return out;
}

/** Courbe d'une ligne de la frise, en pixels : x au milieu de chaque scène, y entre −1 et 1. Null sous deux réponses. */
export function laneCurve(scenes: readonly FriseScene[], slots: ReadonlyMap<string, Slot>, issues: ReadonlyMap<string, string>): CurvePoint[] | null {
  const placed = scenes.flatMap((s) => {
    const slot = slots.get(s.id);
    return slot ? [{ id: s.id, start: slot.x, length: slot.w }] : [];
  });
  return fortuneCurve(placed, (id) => issues.get(id));
}

/** Rang d'une scène dans la liste des blocs du scénario, ou −1. */
const blockOf = (elements: ScreenplayElement[], id: string) =>
  blocks(elements).findIndex((b) => b.kind === "scene" && (b.cardId === id || (!b.cardId && `@${b.start}` === id)));

/**
 * Scénario : la scène `id` passe juste avant la scène `target` (à la fin du texte si `target` est null), avec son
 * synopsis et son texte. Rend les éléments d'avant si rien ne bouge.
 */
export function moveSceneBefore(elements: ScreenplayElement[], id: string, target: string | null): ScreenplayElement[] {
  const list = blocks(elements);
  const from = blockOf(elements, id);
  if (from < 0) return elements;
  if (target === null) return moveBlock(elements, from, list.length - 1);
  let to = blockOf(elements, target);
  if (to < 0 || to === from) return elements;
  if (from < to) to--;
  return moveBlock(elements, from, to);
}

/**
 * Scénario : la scène un cran plus tôt ou plus tard. Elle passe une section (case, séquence, épisode) comme une
 * scène : un cran de plus la fait changer de partie, comme les flèches du séquencier.
 */
export function stepScene(elements: ScreenplayElement[], id: string, way: "earlier" | "later"): ScreenplayElement[] {
  const from = blockOf(elements, id);
  if (from < 0) return elements;
  const to = from + (way === "earlier" ? -1 : 1);
  const list = blocks(elements);
  // Jamais avant ce qui précède le premier bloc (page de titre) ni après le dernier.
  if (to < 0 || to >= list.length) return elements;
  return moveBlock(elements, from, to);
}

/**
 * Scénario : la scène `id` passe à la fin de la rangée `row` (après sa dernière scène, ou juste sous sa section si
 * elle est vide). Une rangée sans clé (avant toute section) n'a pas de section : sa fin est avant la première.
 */
export function moveSceneToRowEnd(elements: ScreenplayElement[], id: string, row: FriseRow): ScreenplayElement[] {
  const list = blocks(elements);
  const from = blockOf(elements, id);
  if (from < 0) return elements;
  const others = row.scenes.filter((s) => s.id !== id);
  let anchor: number;
  if (others.length > 0) anchor = blockOf(elements, others[others.length - 1].id);
  else if (row.key === null) anchor = -1;
  else
    anchor = list.findIndex((b) => {
      if (b.kind !== "section") return false;
      if (row.kind === "episode") return seriesMark(elements[b.start])?.id === row.key;
      return beatOf(b.text) === row.key;
    });
  if (anchor < 0 && (row.key !== null || others.length > 0)) return elements;
  // Place finale du bloc : juste après l'ancre (l'ancre recule d'un cran si la scène était avant elle).
  const to = from <= anchor ? anchor : anchor + 1;
  return moveBlock(elements, from, Math.max(0, to));
}

/** Libellé de rangée à résoudre par la vue : structure (clé et gabarit), chapitre, épisode. */
export type RowLabelSource = { template: PlanTemplate; custom?: CustomTemplate };
