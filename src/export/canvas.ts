// Export du canevas : le texte (Word, Markdown) et les dimensions de l'image (PNG, PDF). Fonctions pures.
//
// Texte : un cadre = une partie, les cartes dans l'ordre de lecture (rangées de haut en bas, puis de gauche
// à droite). Une carte appartient au plus petit cadre qui contient son centre ; un cadre dans un autre
// porte le nom des deux (« Acte I › Chapitre 1 »). Les cartes hors de tout cadre viennent à la fin.

import type { CardData, CardType, Link } from "../types";
import { isMediaName } from "../media";
import { ficheText, sheetFields } from "../character";
import { htmlToBlocks, relatedRuns, type Block, type Chapter, type ExportDoc } from "./doc";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasCard {
  card: CardData;
  box: Box;
}

export interface CanvasFrame {
  id: string;
  title: string;
  box: Box;
}

export interface CanvasStrings {
  types: Record<CardType, string>;
  untitled: string;
  /** Partie des cartes posées hors de tout cadre. */
  loose: string;
  /** Titre d'un cadre sans nom. */
  untitledFrame: string;
  linkedTo: string;
  fields: Record<string, string>;
  arcTypes: Record<string, string>;
}

const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const contains = (outer: Box, p: { x: number; y: number }) => p.x >= outer.x && p.x <= outer.x + outer.width && p.y >= outer.y && p.y <= outer.y + outer.height;
const holds = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const area = (b: Box) => b.width * b.height;

/** Ordre de lecture : par rangées (deux éléments dont les hauts sont proches sont sur la même), puis de gauche à droite. */
export function readingOrder<T>(items: T[], boxOf: (item: T) => Box, tolerance = 60): T[] {
  const sorted = [...items].sort((a, b) => boxOf(a).y - boxOf(b).y);
  const rows: T[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(boxOf(item).y - boxOf(row[0]).y) <= tolerance) row.push(item);
    else rows.push([item]);
  }
  return rows.flatMap((row) => row.sort((a, b) => boxOf(a).x - boxOf(b).x));
}

/** Le plus petit cadre qui contient le centre de la carte, ou null. */
function ownerOf(box: Box, frames: CanvasFrame[]): CanvasFrame | null {
  const c = center(box);
  return frames.filter((f) => contains(f.box, c)).sort((a, b) => area(a.box) - area(b.box))[0] ?? null;
}

/** Texte du canevas : une partie par cadre (ceux qui ont des cartes), puis les cartes hors cadre. */
export function canvasDoc(
  info: { title: string; author: string; lang: string },
  cards: CanvasCard[],
  frames: CanvasFrame[],
  links: Pick<Link, "source" | "target" | "label">[],
  strings: CanvasStrings,
): ExportDoc {
  const titleOf = (id: string) => cards.find((c) => c.card.id === id)?.card.title.trim() || strings.untitled;
  const frameName = (f: CanvasFrame) => f.title.trim() || strings.untitledFrame;
  // Nom complet d'un cadre : ceux qui l'englobent d'abord, du plus grand au plus petit.
  const path = (f: CanvasFrame) =>
    [...frames.filter((o) => o.id !== f.id && holds(o.box, f.box)).sort((a, b) => area(b.box) - area(a.box)), f].map(frameName).join(" › ");

  const blocksOf = (card: CardData): Block[] => {
    const blocks: Block[] = [{ kind: "heading", runs: [{ text: card.title.trim() || strings.untitled }], anchor: card.id }];
    blocks.push({ kind: "paragraph", runs: [{ text: strings.types[card.type], italic: true }] });
    if (card.image && isMediaName(card.image)) blocks.push({ kind: "image", name: card.image });
    for (const key of sheetFields(card.type)) {
      const value = card.fiche?.[key]?.trim();
      if (value) blocks.push({ kind: "paragraph", runs: [{ text: `${strings.fields[key] ?? key} : `, bold: true }, { text: ficheText(key, value, strings.arcTypes) }] });
    }
    blocks.push(...htmlToBlocks(card.html).map((b): Block => (b.kind === "heading" ? { kind: "paragraph", runs: b.runs.map((r) => ({ ...r, bold: true })) } : b)));
    const related = relatedRuns(card.id, links, titleOf);
    if (related.length > 0) blocks.push({ kind: "paragraph", runs: [{ text: `${strings.linkedTo} : `, italic: true }, ...related] });
    return blocks;
  };

  const owned = new Map<string, CanvasCard[]>();
  const loose: CanvasCard[] = [];
  for (const c of cards) {
    const owner = ownerOf(c.box, frames);
    if (owner) owned.set(owner.id, [...(owned.get(owner.id) ?? []), c]);
    else loose.push(c);
  }
  const chapters: Chapter[] = readingOrder(frames, (f) => f.box)
    .filter((f) => owned.has(f.id))
    .map((f) => ({ title: path(f), blocks: readingOrder(owned.get(f.id)!, (c) => c.box).flatMap((c) => blocksOf(c.card)) }));
  if (loose.length > 0) chapters.push({ title: strings.loose, blocks: readingOrder(loose, (c) => c.box).flatMap((c) => blocksOf(c.card)) });
  return { ...info, chapters };
}

/** Rectangle qui englobe toutes les cartes et tous les cadres. */
export function canvasBounds(all: Box[]): Box | null {
  if (all.length === 0) return null;
  const x = Math.min(...all.map((b) => b.x));
  const y = Math.min(...all.map((b) => b.y));
  return { x, y, width: Math.max(...all.map((b) => b.x + b.width)) - x, height: Math.max(...all.map((b) => b.y + b.height)) - y };
}

/** Qualité d'une image du canevas : côté le plus long et surface maximale (les navigateurs limitent un canvas). */
export const IMAGE_QUALITY = {
  /** PNG et PDF standard : léger, lisible à l'écran. */
  standard: { maxSide: 3200, maxArea: 12_000_000 },
  /** PDF grand format : pour l'impression (A1 et plus). */
  large: { maxSide: 9000, maxArea: 40_000_000 },
} as const;
export type ImageQuality = keyof typeof IMAGE_QUALITY;

/**
 * Taille de l'image et échelle (pixels par unité du canevas) pour une zone donnée, marge comprise.
 * Jamais plus grande que 3 pixels par unité : au-delà, rien ne gagne en netteté.
 */
export function imageSize(bounds: Box, quality: ImageQuality, padding = 40): { width: number; height: number; scale: number } {
  const { maxSide, maxArea } = IMAGE_QUALITY[quality];
  const w = bounds.width + padding * 2;
  const h = bounds.height + padding * 2;
  const scale = Math.min(3, maxSide / Math.max(w, h), Math.sqrt(maxArea / (w * h)));
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale };
}
