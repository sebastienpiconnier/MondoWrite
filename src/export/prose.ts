// Mise en page d'un document en prose pour le PDF, au format manuscrit : Courier 12, marges d'un pouce,
// double interligne et alinéa pour un manuscrit, italique rendu par un soulignement (l'usage en Courier).
// Fonction pure : elle rend des pages de lignes, pdf.ts ne fait que les dessiner.

import { SCENE_BREAK, runsText, type Block, type ExportDoc, type Run } from "./doc";

export interface ProseGeometry {
  /** Caractères par ligne et lignes par page, entre les marges. */
  cols: number;
  rows: number;
}

/** Points : 72 par pouce. Courier 12 : 7,2 points par caractère, 12 par ligne, marges d'un pouce. */
export const PROSE_CHAR = 7.2;
export const PROSE_LINE = 12;
export const PROSE_MARGIN = 72;

export const proseGeometry = (width: number, height: number): ProseGeometry => ({
  cols: Math.floor((width - 2 * PROSE_MARGIN) / PROSE_CHAR + 1e-6),
  rows: Math.floor((height - 2 * PROSE_MARGIN) / PROSE_LINE + 1e-6),
});

export interface ProseSegment {
  col: number;
  text: string;
  bold?: boolean;
  underline?: boolean;
}

export interface ProseLine {
  row: number;
  segments: ProseSegment[];
}

/** Image posée sur une page : ligne du haut, colonne de gauche, taille en points. */
export interface ProseImage {
  row: number;
  name: string;
  width: number;
  height: number;
}

export interface ProsePage {
  /** Numéro affiché en haut de page ; absent sur la page de titre. */
  number?: number;
  lines: ProseLine[];
  images?: ProseImage[];
  /** Chapitres qui commencent sur cette page (signets du PDF). */
  marks?: string[];
}

/** Nombre de mots arrondi d'un manuscrit (page de garde) : à la centaine, au millier au-delà de 10 000. */
export const roundWords = (n: number) => (n < 10000 ? Math.max(100, Math.round(n / 100) * 100) : Math.round(n / 1000) * 1000);

/** Côté maximal d'une image dans le PDF (points) : 3 pouces. */
export const PROSE_IMAGE_BOX = 216;

interface Word {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Collé au mot précédent (changement de style au milieu d'un mot). */
  glued?: boolean;
}

/** Découpe des passages en lignes de mots : une sous-liste par retour à la ligne voulu par l'auteur. */
function words(runs: Run[]): Word[][] {
  const lines: Word[][] = [[]];
  let glue = false;
  for (const run of runs) {
    run.text.split("\n").forEach((part, i) => {
      if (i > 0) {
        lines.push([]);
        glue = false;
      }
      const tokens = part.split(/( +)/);
      for (const token of tokens) {
        if (token === "") continue;
        if (/^ +$/.test(token)) {
          glue = false;
          continue;
        }
        lines[lines.length - 1].push({ text: token, bold: run.bold, italic: run.italic, glued: glue });
        glue = true;
      }
    });
  }
  return lines;
}

/** Retour à la ligne par mots entiers ; un mot plus long que la ligne est coupé. */
function wrap(runs: Run[], width: (line: number) => number): Word[][] {
  const out: Word[][] = [];
  for (const source of words(runs)) {
    let line: Word[] = [];
    let used = 0;
    const flush = () => {
      out.push(line);
      line = [];
      used = 0;
    };
    for (let word of source) {
      for (;;) {
        const max = Math.max(1, width(out.length));
        const gap = line.length > 0 && !word.glued ? 1 : 0;
        if (used + gap + word.text.length <= max) {
          line.push(line.length === 0 ? { ...word, glued: false } : word);
          used += gap + word.text.length;
          break;
        }
        if (line.length > 0) {
          flush();
          continue;
        }
        line.push({ ...word, text: word.text.slice(0, max), glued: false });
        flush();
        word = { ...word, text: word.text.slice(max), glued: false };
        if (word.text === "") break;
      }
    }
    if (line.length > 0 || source.length === 0) flush();
  }
  return out;
}

function segments(line: Word[], start: number): ProseSegment[] {
  const out: ProseSegment[] = [];
  let col = start;
  for (const word of line) {
    const gap = out.length > 0 && !word.glued ? 1 : 0;
    const last = out[out.length - 1];
    if (last && !!last.bold === !!word.bold && !!last.underline === !!word.italic) last.text += `${gap ? " " : ""}${word.text}`;
    else out.push({ col: col + gap, text: word.text, ...(word.bold ? { bold: true } : {}), ...(word.italic ? { underline: true } : {}) });
    col += gap + word.text.length;
  }
  return out;
}

const lineLength = (line: Word[]) => line.reduce((sum, w, i) => sum + w.text.length + (i > 0 && !w.glued ? 1 : 0), 0);

export function layoutProse(doc: ExportDoc, { cols, rows }: ProseGeometry): ProsePage[] {
  const pages: ProsePage[] = [];
  // Page de titre : le titre au tiers de la page, l'auteur dessous.
  const titleLines = wrap([{ text: doc.title.toUpperCase(), bold: true }], () => cols);
  const cover: ProseLine[] = titleLines.map((line, i) => ({ row: Math.floor(rows / 3) + i * 2, segments: segments(line, Math.max(0, Math.floor((cols - lineLength(line)) / 2))) }));
  if (doc.author) {
    wrap([{ text: doc.author }], () => cols).forEach((line, i) =>
      cover.push({ row: Math.floor(rows / 3) + titleLines.length * 2 + 2 + i * 2, segments: segments(line, Math.max(0, Math.floor((cols - lineLength(line)) / 2))) }),
    );
  }
  // Coordonnées de l'auteur en haut à gauche, comme sur la page de garde d'un manuscrit envoyé à un éditeur.
  (doc.contact ?? []).forEach((text, i) => {
    if (i < Math.floor(rows / 3) - 1) cover.push({ row: i, segments: segments(wrap([{ text }], () => cols)[0] ?? [], 0) });
  });
  const shunn = doc.indent ? doc.shunn : undefined;
  if (shunn) {
    // Format Shunn : le nombre de mots en haut à droite, le titre au milieu de la page, « par Untel » dessous.
    cover.splice(0, titleLines.length + (doc.author ? 1 : 0));
    cover.push({ row: 0, segments: [{ col: Math.max(0, cols - shunn.words.length), text: shunn.words }] });
    const middle = Math.floor(rows / 2) - 1;
    titleLines.forEach((line, i) => cover.push({ row: middle + i * 2, segments: segments(line, Math.max(0, Math.floor((cols - lineLength(line)) / 2))) }));
    if (shunn.byline) {
      wrap([{ text: shunn.byline }], () => cols).forEach((line, i) =>
        cover.push({ row: middle + titleLines.length * 2 + 2 + i * 2, segments: segments(line, Math.max(0, Math.floor((cols - lineLength(line)) / 2))) }),
      );
    }
  }
  pages.push({ lines: cover });

  // Manuscrit : double interligne. Autre document (bible) : interligne simple, une ligne vide entre les paragraphes.
  const step = doc.indent ? 2 : 1;
  let page: ProsePage | null = null;
  let row = 0;
  let number = 0;
  const newPage = () => {
    page = { number: ++number, lines: [] };
    pages.push(page);
    row = 0;
  };
  const room = (lines: number) => {
    if (!page || row + (lines - 1) * step + 1 > rows) newPage();
  };
  const put = (line: Word[], col: number) => {
    room(1);
    page!.lines.push({ row, segments: segments(line, col) });
    row += step;
  };
  /** Signet : le chapitre commence sur la page en cours. */
  const mark = (title: string) => {
    if (page) (page.marks ??= []).push(title);
  };
  const skip = (n: number) => {
    if (page && row > 0) row += n;
  };

  const heading = (runs: Run[], centered: boolean) => {
    const lines = wrap(runs.map((r) => ({ ...r, bold: true })), () => cols);
    skip(doc.indent ? 2 : 2);
    // Un titre ne reste pas seul en bas de page : il lui faut deux lignes de texte derrière lui.
    room(lines.length + 2);
    for (const line of lines) put(line, centered ? Math.max(0, Math.floor((cols - lineLength(line)) / 2)) : 0);
    skip(doc.indent ? 0 : 1);
  };

  const paragraph = (block: Extract<Block, { kind: "paragraph" }>) => {
    const mark = block.list ? (block.list === "number" ? `${block.index ?? 1}. ` : "• ") : "";
    const base = (block.quote ? 5 : 0) + (block.list ? 2 : 0);
    const first = base + (doc.indent && !block.list && !block.quote ? 5 : 0);
    const hang = base + mark.length;
    const lines = wrap(block.runs, (i) => cols - (i === 0 ? first + mark.length : hang));
    lines.forEach((line, i) => put(i === 0 && mark ? [{ text: mark.trimEnd() }, ...line] : line, i === 0 ? first : hang));
    if (!doc.indent) skip(1);
  };

  const image = (name: string) => {
    const source = doc.images?.[name];
    if (!source) return;
    const box = Math.min(PROSE_IMAGE_BOX, rows * PROSE_LINE);
    const scale = Math.min(box / Math.max(source.width, 1), box / Math.max(source.height, 1));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const need = Math.ceil(height / PROSE_LINE);
    if (!page || row + need > rows) newPage();
    (page!.images ??= []).push({ row, name, width, height });
    row += need + 1;
  };

  for (const chapter of doc.chapters) {
    if (shunn) {
      // Chapitre en haut d'une nouvelle page, son titre au tiers de la hauteur.
      newPage();
      row = Math.floor(rows / 3);
    }
    heading([{ text: chapter.title }], true);
    mark(chapter.title);
    for (const block of chapter.blocks) {
      if (block.kind === "heading") heading(block.runs, false);
      else if (block.kind === "image") image(block.name);
      else if (shunn && runsText(block.runs).trim() === SCENE_BREAK) put([{ text: "#" }], Math.floor((cols - 1) / 2));
      else paragraph(block);
    }
  }
  return pages;
}
