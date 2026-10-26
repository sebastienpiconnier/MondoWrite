// Mise en pages du PDF de la Bible (Bible v2) : le contenu de biblePack.ts, dans un rendu de bibleThemes.ts.
// Fonction pure : le texte est mesuré par une fonction reçue (les polices de pdf-lib dans l'app, une mesure
// simple dans les tests), les images par leurs dimensions. Rend des pages faites d'opérations de dessin, en
// points, l'origine en HAUT à gauche ; biblePdf.ts les dessine (et retourne l'axe vertical).
// Règles : chaque partie commence sur une page ; un titre n'est jamais seul en bas de page ; un bloc court
// (cases, arc, vignettes, affiche d'un personnage) n'est jamais coupé ; un paragraphe se coupe entre deux lignes.

import type { Accent, FontFile, FontKey, Rgb, ThemeDef } from "./bibleThemes";
import type { BiblePack, PackBlock, PackRun } from "./biblePack";

export interface Metrics {
  width(text: string, font: FontFile, size: number): number;
}

export type Op =
  | { op: "text"; x: number; y: number; text: string; font: FontFile; size: number; color: Rgb }
  | { op: "rect"; x: number; y: number; w: number; h: number; color: Rgb }
  | { op: "line"; x1: number; y1: number; x2: number; y2: number; color: Rgb; width: number }
  /** `crop` : l'image remplit la boîte (le surplus est coupé) ; sinon elle y tient entière. */
  | { op: "image"; name: string; x: number; y: number; w: number; h: number; crop: boolean };

export interface LaidPage {
  ops: Op[];
  /** Signet du PDF : titre de la partie qui commence sur cette page. */
  mark?: string;
}

export interface LayoutInput {
  pack: BiblePack;
  theme: ThemeDef;
  accent: Accent;
  paper: "a4" | "letter";
  metrics: Metrics;
  /** Dimensions d'une image (pixels), ou null si elle n'a pas pu être chargée. */
  imageSize: (name: string) => { w: number; h: number } | null;
}

export const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGIN = { side: 64, top: 74, bottom: 66 };

/** Espaces que les polices n'ont pas toutes : l'espace fine insécable devient une insécable ordinaire. */
export const printable = (s: string) => s.replace(/[  ]/g, " ").replace(/[​­]/g, "");

interface Seg {
  text: string;
  font: FontFile;
}
export interface Line {
  segs: { text: string; font: FontFile; x: number }[];
  width: number;
}

/** Coupe des segments de texte en lignes de `max` points au plus (un mot trop long reste entier). */
export function wrap(runs: Seg[], max: number, size: number, metrics: Metrics): Line[] {
  // Mots : suites de morceaux sans espace ordinaire (l'insécable lie deux morceaux).
  const words: Seg[][] = [];
  let current: Seg[] = [];
  for (const run of runs) {
    const parts = printable(run.text).split(/([ \t\n]+)/);
    for (const part of parts) {
      if (part === "") continue;
      if (/^[ \t\n]+$/.test(part)) {
        if (current.length > 0) words.push(current);
        current = [];
      } else current.push({ text: part, font: run.font });
    }
  }
  if (current.length > 0) words.push(current);
  const lines: Line[] = [];
  let line: Line = { segs: [], width: 0 };
  for (const word of words) {
    const w = word.reduce((sum, s) => sum + metrics.width(s.text, s.font, size), 0);
    const space = line.segs.length > 0 ? metrics.width(" ", word[0].font, size) : 0;
    if (line.segs.length > 0 && line.width + space + w > max) {
      lines.push(line);
      line = { segs: [], width: 0 };
    }
    let x = line.width + (line.segs.length > 0 ? metrics.width(" ", word[0].font, size) : 0);
    for (const s of word) {
      line.segs.push({ text: s.text, font: s.font, x });
      x += metrics.width(s.text, s.font, size);
    }
    line.width = x;
  }
  if (line.segs.length > 0) lines.push(line);
  return lines;
}

export function layoutBible({ pack, theme, accent, paper, metrics, imageSize }: LayoutInput): LaidPage[] {
  const [W, H] = PAGE_SIZES[paper];
  const F = (k: FontKey) => theme.fonts[k];
  const S = theme.size;
  const left = MARGIN.side;
  const width = W - 2 * MARGIN.side;
  const bottom = H - MARGIN.bottom;
  const pages: LaidPage[] = [];
  let page: LaidPage = { ops: [] };
  let y = 0;
  let sectionTitle = "";

  const text = (x: number, yy: number, s: string, font: FontFile, size: number, color: Rgb) => {
    if (s) page.ops.push({ op: "text", x, y: yy, text: printable(s), font, size, color });
  };
  const runsToSegs = (runs: PackRun[], base: FontKey = "text"): Seg[] =>
    runs.map((r) => ({ text: r.text, font: r.bold ? F(base === "ui" ? "uiBold" : "textBold") : r.italic ? F("textItalic") : F(base) }));
  /** Lignes dessinées à partir de `y` ; coupe de page entre deux lignes. */
  const drawLines = (lines: Line[], x: number, size: number, color: Rgb, lead = theme.leading) => {
    for (const l of lines) {
      ensure(size * lead);
      y += size * lead;
      for (const s of l.segs) text(x + s.x, y - size * (lead - 1) * 0.5 - size * 0.22, s.text, s.font, size, color);
    }
  };

  // --- Pages ---------------------------------------------------------------------------------------------
  const header = () => {
    if (theme.band) {
      page.ops.push({ op: "rect", x: 0, y: 0, w: W, h: 20, color: theme.band });
      page.ops.push({ op: "rect", x: left, y: 20, w: 46, h: 2, color: accent.dark });
    }
    const color = theme.muted;
    text(left, 46, pack.title.toLocaleUpperCase(), F("ui"), S.kicker, color);
    const right = sectionTitle.toLocaleUpperCase();
    text(W - MARGIN.side - metrics.width(printable(right), F("ui"), S.kicker), 46, right, F("ui"), S.kicker, color);
    if (!theme.band) page.ops.push({ op: "line", x1: left, y1: 52, x2: W - MARGIN.side, y2: 52, color: theme.line, width: 0.5 });
  };
  const newPage = (mark?: string) => {
    if (page.ops.length > 0) pages.push(page);
    page = { ops: [{ op: "rect", x: 0, y: 0, w: W, h: H, color: theme.paper }], ...(mark ? { mark } : {}) };
    header();
    y = MARGIN.top;
  };
  /** Place pour `h` points ? Sinon page suivante. */
  const ensure = (h: number) => {
    if (y + h > bottom && y > MARGIN.top + 1) newPage();
  };

  // --- Couverture ----------------------------------------------------------------------------------------
  const cover = () => {
    const c = theme.cover;
    const acc = c.dark ? accent.dark : accent.paper;
    page = { ops: [{ op: "rect", x: 0, y: 0, w: W, h: H, color: c.bg }] };
    const img = pack.cover ? imageSize(pack.cover) : null;
    if (pack.cover && img) page.ops.push({ op: "image", name: pack.cover, x: 0, y: 0, w: W, h: H * 0.52, crop: true });
    text(left, img ? H * 0.52 + 34 : 64, pack.kind.toLocaleUpperCase(), F("uiBold"), S.kicker + 1, acc);
    // Bloc du bas : filet, titre, accroche, ligne de présentation, auteur, date.
    const titleLines = wrap([{ text: pack.title, font: F("display") }], width, S.cover, metrics);
    const tagLines = pack.tagline ? wrap([{ text: pack.tagline, font: F("textItalic") }], width * 0.9, S.lead + 3, metrics) : [];
    const blockH = 18 + titleLines.length * S.cover * 1.06 + 10 + tagLines.length * (S.lead + 3) * 1.4 + 40 + (pack.author ? 18 : 0);
    let yy = Math.max(img ? H * 0.52 + 70 : H * 0.4, H - 72 - blockH);
    page.ops.push({ op: "rect", x: left, y: yy, w: 40, h: 1.6, color: acc });
    yy += 18;
    for (const l of titleLines) {
      yy += S.cover * 1.06;
      for (const s of l.segs) text(left + s.x, yy - S.cover * 0.2, s.text, s.font, S.cover, c.ink);
    }
    yy += 10;
    for (const l of tagLines) {
      yy += (S.lead + 3) * 1.4;
      for (const s of l.segs) text(left + s.x, yy - 4, s.text, s.font, S.lead + 3, c.muted);
    }
    yy += 30;
    text(left, yy, pack.meta.toLocaleUpperCase(), F("ui"), S.kicker + 0.5, c.muted);
    if (pack.author) text(left, yy + 20, pack.author, F("text"), S.body + 1, c.ink);
    text(W - MARGIN.side - metrics.width(printable(pack.date), F("ui"), S.kicker + 0.5), H - 40, pack.date, F("ui"), S.kicker + 0.5, c.muted);
    pages.push(page);
    page = { ops: [] };
  };

  // --- Blocs ---------------------------------------------------------------------------------------------
  const cellsHeight = (items: { label: string; value: string }[], cols: number, cellW: number) => {
    const rows: number[] = [];
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols).map((it) => wrap([{ text: it.value, font: F("text") }], cellW - 20, S.small + 0.5, metrics).length);
      rows.push(Math.max(...row));
    }
    return rows.map((n) => 26 + n * (S.small + 0.5) * 1.4 + 8);
  };
  const drawCells = (items: { label: string; value: string }[], arrow = false) => {
    const cols = Math.min(arrow ? 2 : 3, items.length);
    const gap = arrow ? 22 : 8;
    const cellW = (width - gap * (cols - 1)) / cols;
    const heights = cellsHeight(items, cols, cellW);
    heights.forEach((h, r) => {
      ensure(h + 8);
      const top = y + 6;
      items.slice(r * cols, r * cols + cols).forEach((it, i) => {
        const x = left + i * (cellW + gap);
        page.ops.push({ op: "rect", x, y: top, w: cellW, h, color: theme.soft });
        text(x + 10, top + 15, it.label.toLocaleUpperCase(), F("uiBold"), S.kicker, theme.muted);
        let yy = top + 22;
        for (const l of wrap([{ text: it.value, font: F("text") }], cellW - 20, S.small + 0.5, metrics)) {
          yy += (S.small + 0.5) * 1.4;
          for (const s of l.segs) text(x + 10 + s.x, yy - 2, s.text, s.font, S.small + 0.5, theme.ink);
        }
        // Flèche dessinée : « → » n'est pas dans le sous-ensemble latin des polices.
        if (arrow && i === 0) {
          const ax = x + cellW + 5;
          const ay = top + h / 2;
          page.ops.push({ op: "line", x1: ax, y1: ay, x2: ax + 12, y2: ay, color: accent.paper, width: 1.2 });
          page.ops.push({ op: "line", x1: ax + 8, y1: ay - 4, x2: ax + 12, y2: ay, color: accent.paper, width: 1.2 });
          page.ops.push({ op: "line", x1: ax + 8, y1: ay + 4, x2: ax + 12, y2: ay, color: accent.paper, width: 1.2 });
        }
      });
      y = top + h + 2;
    });
    y += 6;
  };

  const block = (b: PackBlock, next?: PackBlock) => {
    switch (b.kind) {
      case "pageBreak":
        newPage();
        return;
      case "rule":
        ensure(30);
        y += 14;
        page.ops.push({ op: "line", x1: left, y1: y, x2: left + width, y2: y, color: theme.line, width: 0.7 });
        y += 10;
        return;
      case "h2":
      case "h3": {
        const size = b.kind === "h2" ? S.h2 : S.h3;
        const lines = wrap([{ text: b.text, font: F("display") }], width, size, metrics);
        ensure(lines.length * size * 1.3 + 14 + (next ? S.body * theme.leading * 2 : 0));
        y += b.kind === "h2" ? 14 : 10;
        drawLines(lines, left, size, theme.ink, 1.3);
        if (b.kind === "h3" && b.sub) {
          y += S.small * 1.3;
          text(left, y - 2, b.sub, F("textItalic"), S.small, theme.muted);
        }
        y += 4;
        return;
      }
      case "label": {
        ensure(22 + S.body * theme.leading * 2);
        y += 12;
        y += S.kicker * 1.4;
        text(left, y, b.text.toLocaleUpperCase(), F("uiBold"), S.kicker, accent.paper);
        y += 4;
        return;
      }
      case "lead": {
        const lines = wrap([{ text: b.text, font: F("text") }], width, S.lead, metrics);
        page.ops.push({ op: "rect", x: left, y: y + 6, w: 2, h: Math.min(lines.length * S.lead * 1.45 + 4, bottom - y - 6), color: accent.paper });
        drawLines(lines, left + 14, S.lead, theme.ink, 1.45);
        y += 8;
        return;
      }
      case "para": {
        const size = b.small ? S.small : S.body;
        const lines = wrap(runsToSegs(b.runs), width, size, metrics);
        drawLines(lines, left, size, b.muted ? theme.muted : theme.ink);
        y += size * 0.45;
        return;
      }
      case "chips": {
        const lines = wrap([{ text: b.items.join("  ·  "), font: F("ui") }], width, S.small, metrics);
        y += 4;
        drawLines(lines, left, S.small, theme.muted, 1.6);
        y += 4;
        return;
      }
      case "cells":
        drawCells(b.items);
        return;
      case "arc":
        drawCells([b.from.value ? b.from : { ...b.from, value: "…" }, b.to.value ? b.to : { ...b.to, value: "…" }], true);
        return;
      case "person": {
        const boxW = 78;
        const boxH = 98;
        const textX = left + boxW + 20;
        const textW = width - boxW - 20;
        const nameLines = wrap([{ text: b.name, font: F("display") }], textW, S.h1, metrics);
        const hookLines = b.hook ? wrap([{ text: b.hook, font: F("textItalic") }], textW, S.lead, metrics) : [];
        const h = Math.max(boxH, nameLines.length * S.h1 * 1.2 + 20 + hookLines.length * S.lead * 1.4);
        ensure(h + 16);
        const top = y + 6;
        if (b.image && imageSize(b.image)) page.ops.push({ op: "image", name: b.image, x: left, y: top, w: boxW, h: boxH, crop: true });
        else {
          page.ops.push({ op: "rect", x: left, y: top, w: boxW, h: boxH, color: accent.paper });
          const iw = metrics.width(b.initials, F("display"), 26);
          text(left + (boxW - iw) / 2, top + boxH / 2 + 9, b.initials, F("display"), 26, theme.paper);
        }
        y = top - 4;
        for (const l of nameLines) {
          y += S.h1 * 1.2;
          for (const s of l.segs) text(textX + s.x, y, s.text, s.font, S.h1, theme.ink);
        }
        if (b.meta) {
          y += 16;
          text(textX, y, b.meta.toLocaleUpperCase(), F("ui"), S.kicker + 0.5, theme.muted);
        }
        y += 4;
        for (const l of hookLines) {
          y += S.lead * 1.4;
          for (const s of l.segs) text(textX + s.x, y, s.text, s.font, S.lead, theme.muted);
        }
        y = Math.max(y, top + boxH) + 14;
        return;
      }
      case "thumbs": {
        const items = b.items.filter((it) => imageSize(it.image));
        if (items.length === 0) return;
        const gap = 8;
        const cols = Math.max(items.length, 3);
        const w = (width - gap * (cols - 1)) / cols;
        const h = w * 0.72;
        ensure(h + 26);
        const top = y + 8;
        items.forEach((it, i) => {
          const x = left + i * (w + gap);
          page.ops.push({ op: "image", name: it.image, x, y: top, w, h, crop: true });
          const cap = wrap([{ text: it.caption, font: F("ui") }], w, S.kicker + 0.5, metrics)[0];
          if (cap) for (const s of cap.segs) text(x + s.x, top + h + 11, s.text, s.font, S.kicker + 0.5, theme.muted);
        });
        y = top + h + 22;
        return;
      }
      case "grid": {
        // Numéros en tête de colonne, légende dessous : un libellé de case ne tiendrait pas dans une colonne étroite.
        const labelW = Math.min(150, width * 0.32);
        const colW = (width - labelW) / b.cols.length;
        const cell = Math.min(colW - 3, 14);
        const rowH = Math.max(cell + 6, S.small * 1.5);
        ensure(18 + rowH * Math.min(b.rows.length, 3));
        y += 6;
        b.cols.forEach((_, i) => {
          const n = String(i + 1);
          text(left + labelW + i * colW + (colW - metrics.width(n, F("ui"), S.kicker)) / 2, y + S.kicker, n, F("ui"), S.kicker, theme.muted);
        });
        y += S.kicker + 6;
        for (const row of b.rows) {
          ensure(rowH);
          const label = wrap([{ text: row.label, font: F("textBold") }], labelW - 8, S.small, metrics)[0];
          if (label) for (const sg of label.segs) text(left + sg.x, y + rowH / 2 + S.small * 0.35, sg.text, sg.font, S.small, theme.ink);
          row.cells.forEach((on, i) => {
            const x = left + labelW + i * colW + (colW - cell) / 2;
            page.ops.push({ op: "rect", x, y: y + (rowH - cell) / 2, w: cell, h: cell, color: on ? accent.paper : theme.soft });
          });
          y += rowH;
        }
        const legend = b.cols.map((c, i) => `${i + 1} ${c}`).join("  ·  ");
        y += 4;
        drawLines(wrap([{ text: legend, font: F("ui") }], width, S.kicker + 0.5, metrics), left, S.kicker + 0.5, theme.muted, 1.5);
        y += 8;
        return;
      }
      case "list": {
        const cols = b.columns;
        const gap = 18;
        const colW = (width - gap * (cols - 1)) / cols;
        const markW = b.items.some((it) => it.mark) ? 22 : 0;
        for (let i = 0; i < b.items.length; i += cols) {
          const row = b.items.slice(i, i + cols).map((it) => ({
            it,
            main: wrap([{ text: it.text, font: F("textBold") }], colW - markW, S.body, metrics),
            note: it.note ? wrap([{ text: it.note, font: F("text") }], colW - markW, S.small, metrics) : [],
          }));
          const h = Math.max(...row.map((r) => r.main.length * S.body * 1.35 + r.note.length * S.small * 1.35)) + 7;
          ensure(h);
          const top = y;
          row.forEach((r, c) => {
            const x = left + c * (colW + gap);
            let yy = top;
            if (r.it.mark) text(x, top + S.body * 1.35 - 3, r.it.mark, F("uiBold"), S.small, accent.paper);
            for (const l of r.main) {
              yy += S.body * 1.35;
              for (const s of l.segs) text(x + markW + s.x, yy - 3, s.text, s.font, S.body, theme.ink);
            }
            for (const l of r.note) {
              yy += S.small * 1.35;
              for (const s of l.segs) text(x + markW + s.x, yy - 2, s.text, s.font, S.small, theme.muted);
            }
          });
          y = top + h;
          page.ops.push({ op: "line", x1: left, y1: y - 3, x2: left + width, y2: y - 3, color: theme.line, width: 0.4 });
        }
        y += 4;
        return;
      }
    }
  };

  cover();
  for (const section of pack.sections) {
    sectionTitle = section.title;
    newPage(section.title);
    y += S.kicker * 1.4;
    text(left, y, section.kicker.toLocaleUpperCase(), F("uiBold"), S.kicker, accent.paper);
    const titleLines = wrap([{ text: section.title, font: F("display") }], width, S.h1 + 4, metrics);
    y += 6;
    drawLines(titleLines, left, S.h1 + 4, theme.ink, 1.2);
    y += 8;
    page.ops.push({ op: "rect", x: left, y, w: 34, h: 1.4, color: accent.paper });
    y += 10;
    section.blocks.forEach((b, i) => block(b, section.blocks[i + 1]));
  }
  if (page.ops.length > 0) pages.push(page);

  // Folios (la couverture n'en a pas).
  pages.forEach((p, i) => {
    if (i === 0) return;
    const n = String(i + 1);
    p.ops.push({ op: "text", x: (W - metrics.width(n, F("ui"), S.kicker + 1)) / 2, y: H - 30, text: n, font: F("ui"), size: S.kicker + 1, color: theme.muted });
  });
  return pages;
}
