// Couverture complète du livre broché pour KDP (#78, docs/plan-couverture-kdp.md) : mise en page pure, testée.
// Le gabarit (`coverLayout`) donne les mesures ; ici on place l'image du premier plat (cadrée pour remplir le plat
// et son fond perdu), le titre et le nom de l'auteur, le texte du dos (à partir de SPINE_TEXT_PAGES), et la
// quatrième (accroche, texte, présentation de l'auteur), toujours hors de la place du code-barres. Pas d'ISBN
// écrit à part : le code-barres que KDP imprime porte déjà l'ISBN en clair au-dessus des barres. Les
// couleurs se décident au dessin (paperbackPdf.ts), d'après l'image (coverImage.ts). Les textes trop longs ne sont
// jamais coupés en silence : un contrôle le dit, et l'enregistrement attend qu'on raccourcisse.
// Origine en haut à gauche, en points ; `y` d'un texte est sa ligne de base.

import { INCH, coverLayout, type Box, type CoverLayout, type FontStyle } from "./paperback";
import { SPINE_TEXT_PAGES, type PaperId, type TrimId } from "./printOptions";
import type { CoverDesign } from "./coverDesign";

/** Résolution demandée par KDP pour les images imprimées. */
export const PRINT_DPI = 300;
/** En dessous, l'image sera nettement floue à l'impression. */
export const BLURRY_DPI = 200;
/** Hauteur des capitales, en fraction du corps (Crimson Text). */
const CAP = 0.64;
/** Marge du texte du dos de part et d'autre (KDP : 0,0625 in au moins). */
const SPINE_MARGIN = 0.0625 * INCH;
/** Plus petit corps lisible sur le dos. */
const SPINE_MIN_SIZE = 6;

export interface CoverMetrics {
  width: (text: string, font: FontStyle, size: number) => number;
}

export interface CoverTexts {
  title: string;
  author: string;
  tagline: string;
  /** Quatrième de couverture : paragraphes séparés par des lignes. */
  back: string;
  /** Présentation de l'auteur (parcours du profil), vide si décochée. */
  bio: string;
}

export interface FullCoverInput {
  trim: TrimId;
  paper: PaperId;
  pages: number;
  design: CoverDesign;
  texts: CoverTexts;
  /** Taille de l'image du premier plat, en pixels ; null : premier plat uni. */
  image: { width: number; height: number } | null;
}

/** Partie de l'image source à dessiner dans le premier plat (pixels). */
export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export type CoverPanel = "front" | "spine" | "back";

export interface CoverText {
  text: string;
  x: number;
  y: number;
  size: number;
  font: FontStyle;
  panel: CoverPanel;
  /** Texte du dos : écrit de haut en bas. */
  rotate?: -90;
  spacing?: number;
}

export type CoverCheck =
  | { kind: "noTitle" }
  | { kind: "noImage" }
  | { kind: "lowRes"; dpi: number; severe: boolean }
  | { kind: "noBack" }
  | { kind: "backOverflow"; lines: number }
  | { kind: "noSpineText" }
  | { kind: "spineTooThin" };

/** Contrôles qui empêchent d'enregistrer : le fichier ne serait pas celui qu'on croit. */
export const BLOCKING: readonly CoverCheck["kind"][] = ["noTitle", "backOverflow"];

export interface FullCoverLayout {
  cover: CoverLayout;
  /** Premier plat avec son fond perdu (haut, bas, bord extérieur). */
  frontBox: Box;
  /** Quatrième avec son fond perdu. */
  backBox: Box;
  /** Dos, sur toute la hauteur. */
  spineBox: Box;
  crop: Crop | null;
  /** Résolution de l'image sur le premier plat (pixels par pouce), null sans image. */
  dpi: number | null;
  /** Zones du premier plat où vont le titre et le nom, pour choisir l'encre d'après l'image. */
  titleZone: Box | null;
  authorZone: Box | null;
  texts: CoverText[];
  checks: CoverCheck[];
}

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Cadrage « remplir » : l'image couvre toute la boîte, coupée sur les côtés ou en haut et en bas selon `crop`. */
export function coverCrop(image: { width: number; height: number }, target: { width: number; height: number }, crop: CoverDesign["crop"]): Crop {
  const want = target.width / target.height;
  const have = image.width / image.height;
  if (have > want) {
    const sw = image.height * want;
    return { sx: (image.width - sw) / 2, sy: 0, sw, sh: image.height };
  }
  const sh = image.width / want;
  const sy = crop === "top" ? 0 : crop === "bottom" ? image.height - sh : (image.height - sh) / 2;
  return { sx: 0, sy, sw: image.width, sh };
}

/** Une zone du premier plat (points) dans l'image source (pixels), pour y mesurer la lumière. */
export function zoneInImage(zone: Box, frontBox: Box, crop: Crop): Crop {
  const kx = crop.sw / frontBox.width;
  const ky = crop.sh / frontBox.height;
  return { sx: crop.sx + (zone.x - frontBox.x) * kx, sy: crop.sy + (zone.y - frontBox.y) * ky, sw: zone.width * kx, sh: zone.height * ky };
}

/** Lignes d'un texte coupé aux espaces dans une largeur ; null si un mot seul ne tient pas. */
export function wrap(text: string, maxWidth: number, font: FontStyle, size: number, m: CoverMetrics): string[] | null {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (m.width(word, font, size) > maxWidth) return null;
    const next = cur ? `${cur} ${word}` : word;
    if (cur && m.width(next, font, size) > maxWidth) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Le plus grand corps (de `from` à `min`, par pas de `step`) où le texte tient en `maxLines` lignes. */
function fitLines(text: string, maxWidth: number, font: FontStyle, from: number, min: number, maxLines: number, m: CoverMetrics, step = 1): { size: number; lines: string[] } | null {
  for (let size = from; size >= min; size -= step) {
    const lines = wrap(text, maxWidth, font, size, m);
    if (lines && lines.length <= maxLines) return { size, lines };
  }
  return null;
}

/** Luminance relative d'une couleur « #rrggbb » (0 : noir, 1 : blanc). */
export function luminance(hex: string): number {
  const v = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * v(1) + 0.7152 * v(3) + 0.0722 * v(5);
}

/** Encre lisible sur un fond : claire sur un fond sombre, foncée sur un fond clair. */
export const inkOn = (hex: string): "light" | "dark" => (luminance(hex) > 0.36 ? "dark" : "light");

/** Une couche de l'ombre portée : décalage (points) et opacité. */
export interface ShadowPass {
  dx: number;
  dy: number;
  opacity: number;
}

/**
 * Ombre portée douce d'un texte de corps `size` : une couche décalée vers le bas à droite, entourée de deux anneaux
 * de couches plus pâles pour fondre le bord (pdf-lib ne sait pas flouter). Décalage et rayon suivent le corps.
 */
export function shadowPasses(size: number): ShadowPass[] {
  const dx = size * 0.02;
  const dy = size * 0.035;
  // Deux anneaux de huit couches, de plus en plus pâles : un bord fondu plutôt qu'un relief.
  const ring = (r: number, opacity: number) =>
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return { dx: dx + r * Math.cos(a), dy: dy + r * Math.sin(a), opacity };
    });
  return [...ring(Math.max(1.2, size * 0.09), 0.035), ...ring(Math.max(0.6, size * 0.045), 0.06), { dx, dy, opacity: 0.22 }];
}

/** Couleur « #rrggbb » d'une moyenne RVB (0 à 255). */
export const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;

export function layoutFullCover(input: FullCoverInput, m: CoverMetrics): FullCoverLayout {
  const { design, texts } = input;
  const cover = coverLayout(input.trim, input.paper, input.pages);
  const H = cover.height;
  const bleed = cover.trim.y;
  const frontBox = box(cover.front.x, 0, cover.width - cover.front.x, H);
  const backBox = box(0, 0, cover.spine.x, H);
  const spineBox = box(cover.spine.x, 0, cover.spine.width, H);
  const checks: CoverCheck[] = [];
  const out: CoverText[] = [];

  // Image du premier plat.
  let crop: Crop | null = null;
  let dpi: number | null = null;
  if (input.image && input.image.width > 0 && input.image.height > 0) {
    crop = coverCrop(input.image, frontBox, design.crop);
    dpi = Math.round(crop.sw / (frontBox.width / INCH));
    if (dpi < PRINT_DPI) checks.push({ kind: "lowRes", dpi, severe: dpi < BLURRY_DPI });
  } else checks.push({ kind: "noImage" });

  // Titre et nom sur le premier plat, dans sa zone sûre, avec de l'air autour.
  const title = oneLine(texts.title);
  const author = oneLine(texts.author);
  const safe = cover.safe[1];
  const inset = 0.2 * INCH;
  const textWidth = safe.width - 2 * inset;
  let titleZone: Box | null = null;
  let authorZone: Box | null = null;
  if (!design.titleOnImage) {
    if (!title) checks.push({ kind: "noTitle" });
    const startSize = Math.round(Math.min(72, (cover.front.width / INCH) * 9));
    const fit = title ? fitLines(title, textWidth, "bold", startSize, 16, 3, m) : null;
    const authorSize = fit ? Math.max(11, Math.round(fit.size * 0.38)) : 14;
    const upper = author.toLocaleUpperCase();
    const spacing = authorSize * 0.12;
    const authorFit = upper ? fitLines(upper, textWidth - spacing * upper.length, "regular", authorSize, 8, 1, m) : null;
    const top = safe.y + 0.35 * INCH;
    const bottom = safe.y + safe.height - 0.35 * INCH;
    if (fit) {
      const lead = fit.size * 1.08;
      const height = (fit.lines.length - 1) * lead + fit.size * CAP;
      const firstBase = design.titlePlace === "top" ? top + fit.size * CAP : bottom - height + fit.size * CAP;
      fit.lines.forEach((line, i) => {
        const w = m.width(line, "bold", fit.size);
        out.push({ text: line, x: safe.x + (safe.width - w) / 2, y: firstBase + i * lead, size: fit.size, font: "bold", panel: "front" });
      });
      titleZone = box(safe.x, firstBase - fit.size * CAP - 0.15 * INCH, safe.width, height + 0.3 * INCH);
    }
    if (authorFit) {
      const s = authorFit.size;
      const base = design.titlePlace === "top" ? bottom : top + s * CAP;
      const line = authorFit.lines[0];
      const w = m.width(line, "regular", s) + spacing * Math.max(0, [...line].length - 1);
      out.push({ text: line, x: safe.x + (safe.width - w) / 2, y: base, size: s, font: "regular", panel: "front", spacing: s * 0.12 });
      authorZone = box(safe.x, base - s * CAP - 0.15 * INCH, safe.width, s * CAP + 0.3 * INCH);
    }
  }

  // Dos : titre puis nom, de haut en bas, seulement quand KDP l'imprime et que le corps reste lisible.
  if (input.pages < SPINE_TEXT_PAGES) checks.push({ kind: "noSpineText" });
  else if (title || author) {
    const room = cover.spine.width - 2 * SPINE_MARGIN;
    const length = cover.spine.height - 2 * (0.3 * INCH);
    const gap = 0.25 * INCH;
    const runs = [title && { text: title, font: "bold" as const }, author && { text: author, font: "regular" as const }].filter((r): r is { text: string; font: "bold" | "regular" } => !!r);
    let size = Math.min(16, Math.floor((room / CAP) * 0.85));
    const total = (s: number) => runs.reduce((sum, r) => sum + m.width(r.text, r.font, s), 0) + gap * (runs.length - 1);
    while (size >= SPINE_MIN_SIZE && total(size) > length) size -= 0.5;
    if (size < SPINE_MIN_SIZE) checks.push({ kind: "spineTooThin" });
    else {
      let y = cover.spine.y + (cover.spine.height - total(size)) / 2;
      const x = cover.spine.x + cover.spine.width / 2 - (size * CAP) / 2;
      for (const r of runs) {
        out.push({ text: r.text, x, y, size, font: r.font, panel: "spine", rotate: -90 });
        y += m.width(r.text, r.font, size) + gap;
      }
    }
  }

  // Quatrième : accroche, texte, présentation de l'auteur ; rien sous le haut du code-barres.
  const left = cover.back.x + 0.5 * INCH;
  const width = cover.back.width - 1 * INCH;
  const topY = bleed + 0.6 * INCH;
  const limit = cover.barcode.y - 0.3 * INCH;
  const tagline = oneLine(texts.tagline);
  const paragraphs = texts.back
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map(oneLine)
    .filter(Boolean);
  const bio = oneLine(texts.bio);
  if (paragraphs.length === 0) checks.push({ kind: "noBack" });
  const backTexts = (body: number): { texts: CoverText[]; over: number } => {
    const res: CoverText[] = [];
    let y = topY;
    let over = 0;
    const put = (lines: string[], font: FontStyle, size: number, lead: number) => {
      for (const line of lines) {
        const base = y + size * CAP;
        if (base > limit) over++;
        else res.push({ text: line, x: left, y: base, size, font, panel: "back" });
        y += lead;
      }
    };
    if (tagline) {
      const s = body + 4;
      put(wrap(tagline, width, "boldItalic", s, m) ?? [tagline], "boldItalic", s, s * 1.25);
      y += body * 0.9;
    }
    for (const p of paragraphs) {
      put(wrap(p, width, "regular", body, m) ?? [p], "regular", body, body * 1.4);
      y += body * 0.6;
    }
    if (bio && author) {
      y += body * 0.8;
      const s = body - 1;
      put([author], "bold", s, s * 1.35);
      put(wrap(bio, width, "italic", s, m) ?? [bio], "italic", s, s * 1.35);
    }
    return { texts: res, over };
  };
  let back = backTexts(11);
  for (const size of [10.5, 10, 9.5]) {
    if (back.over === 0) break;
    back = backTexts(size);
  }
  if (back.over > 0) checks.push({ kind: "backOverflow", lines: back.over });
  out.push(...back.texts);

  return { cover, frontBox, backBox, spineBox, crop, dpi, titleZone, authorZone, texts: out, checks };
}
