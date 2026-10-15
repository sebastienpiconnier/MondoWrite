// Livre broché pour l'impression à la demande (KDP d'Amazon) : la mise en page de l'intérieur, page par
// page, et les mesures du gabarit de couverture. Fonctions pures : le texte est mesuré par une fonction
// reçue (les polices du PDF dans paperbackPdf.ts, une mesure simple dans les tests), rien n'est dessiné ici.
//
// Règles reprises de l'export « Paperback for KDP » de NEO (Hugh Howey, licence MIT) : formats et corps
// du texte, marges, grand fond selon le nombre de pages, chapitres en belle page, page 1 au début du
// récit, titres courants et folios aux coins extérieurs, césure, veuves et orphelines, page de copyright,
// mot au lecteur et « Du même auteur ».

import type { Block, Run } from "./doc";
import { SCENE_BREAK, runsText } from "./doc";
import type { PageKind } from "../book";
import { isSceneBreak } from "../import/manuscript";

import { KDP_MIN_PAGES, KDP_TRIMS, SPINE_TEXT_PAGES, gutterFor, spineInches, type PaperId, type PrintOptions, type TrimId } from "./printOptions";
export * from "./printOptions";

export const INCH = 72;
/** Marges du haut et du bas (pouces), interligne (en corps), alinéa (en corps). */
const TOP = 0.7;
const BOTTOM = 0.75;
const LEADING = 1.42;
const INDENT = 1.5;


// ---------------------------------------------------------------------------------------------------------
// Le livre à composer

export type BookSection =
  /** Page du livre (dédicace, prologue, remerciements…), sous son nom (`title`). */
  | { kind: "page"; page: PageKind; title: string; blocks: Block[] }
  /** Chapitre : « Chapitre 3 » (`label`, vide si non numéroté), son titre, et sa ligne de sommaire. */
  | { kind: "chapter"; label: string; title: string; toc: string; blocks: Block[] };

export interface BookDoc {
  title: string;
  author: string;
  lang: string;
  year: number;
  sections: BookSection[];
}

/** Textes des pages ajoutées, dans la langue de l'interface. */
export interface BookStrings {
  copyright: string; // « Copyright © {year} {name} »
  rights: string;
  reproduction: string;
  fiction: string;
  isbn: string; // « ISBN {isbn} »
  contents: string;
  thanksTitle: string;
  thanksText: string; // « {title} »
  stayInTouch: string;
  website: string;
  newsletter: string;
  alsoBy: string; // « Du même auteur »
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export type FontStyle = "regular" | "italic" | "bold" | "boldItalic";

export interface Metrics {
  /** Largeur d'un texte (points), sans espacement des lettres. */
  width: (text: string, font: FontStyle, size: number) => number;
  /** Hauteur des capitales, en fraction du corps (pour la lettrine). */
  capHeight: number;
}

/** Un texte posé sur une page : `y` est sa ligne de base, depuis le haut de la page (points). */
export interface PrintText {
  x: number;
  y: number;
  text: string;
  font: FontStyle;
  size: number;
  /** Espacement des lettres (points). */
  spacing?: number;
  /** Gris (titre courant, folio). */
  muted?: boolean;
}

export type PageRole = "front" | "story" | "back" | "blank";

export interface PrintPage {
  recto: boolean;
  role: PageRole;
  /** Première page d'un chapitre ou d'une page de fin : pas de titre courant. */
  opening?: boolean;
  folio?: number;
  texts: PrintText[];
}

export interface BookEntry {
  title: string;
  /** Indice de la page (0 = première page du fichier). */
  page: number;
}

export interface BookLayout {
  /** Taille de la page (points). */
  width: number;
  height: number;
  /** Grand fond posé (pouces). */
  gutter: number;
  pages: PrintPage[];
  /** Sommaire et signets du PDF. */
  entries: BookEntry[];
}

// ---------------------------------------------------------------------------------------------------------
// Césure

const SHY = "\u00ad";
const stripShy = (s: string) => s.split(SHY).join("");

/**
 * Coupures possibles (traits d'union conditionnels) dans les mots d'un paragraphe. Jamais dans un mot à
 * majuscule (un nom), ni à moins de trois lettres d'un bord, ni dans le dernier mot du paragraphe, ni
 * dans un mot de moins de six lettres. `hy` rend le mot avec ses coupures (paquet `hyphen`).
 */
export function hyphenateRuns(runs: Run[], hy: (word: string) => string): Run[] {
  let lastRun = -1;
  let lastAt = -1;
  runs.forEach((r, i) => {
    for (const m of r.text.matchAll(/[\p{L}\p{M}]+/gu)) {
      lastRun = i;
      lastAt = m.index ?? 0;
    }
  });
  return runs.map((r, i) => ({
    ...r,
    text: r.text.replace(/[\p{L}\p{M}]+/gu, (word, at: number) => {
      if (word.length < 6 || /^\p{Lu}/u.test(word) || (i === lastRun && at === lastAt)) return word;
      const marked = hy(word);
      let out = "";
      let letters = 0;
      for (const ch of marked) {
        if (ch === SHY) {
          if (letters >= 3 && word.length - letters >= 3) out += ch;
          continue;
        }
        out += ch;
        letters++;
      }
      return letters === word.length ? out : word;
    }),
  }));
}

/** Les pages du livre dont la prose se coupe (récit et pages de fin écrites par l'auteur). */
const PROSE_PAGES: ReadonlySet<PageKind> = new Set(["prologue", "epilogue", "remerciements", "auteur"]);

export function hyphenateBook(book: BookDoc, hy: (word: string) => string): BookDoc {
  const blocks = (list: Block[]) => list.map((b): Block => (b.kind === "paragraph" && !isSceneBreak(runsText(b.runs)) ? { ...b, runs: hyphenateRuns(b.runs, hy) } : b));
  return {
    ...book,
    sections: book.sections.map((s) => (s.kind === "chapter" || PROSE_PAGES.has(s.page) ? { ...s, blocks: blocks(s.blocks) } : s)),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Lignes

interface Piece {
  text: string;
  font: FontStyle;
}
interface Word {
  pieces: Piece[];
}
interface Line {
  words: Word[];
  /** Dernière ligne du paragraphe (jamais justifiée). */
  last: boolean;
  /** Largeur et retrait de cette ligne. */
  width: number;
  offset: number;
}

const fontOf = (run: { bold?: boolean; italic?: boolean }, italicBase = false): FontStyle => {
  const italic = italicBase ? !run.italic : !!run.italic;
  return run.bold ? (italic ? "boldItalic" : "bold") : italic ? "italic" : "regular";
};

/** Mots d'un paragraphe ; un retour à la ligne voulu par l'auteur sépare des sous-paragraphes. */
function wordsOf(runs: Run[], italicBase: boolean): Word[][] {
  const out: Word[][] = [[]];
  let glue = false;
  for (const run of runs) {
    // L'espace fine insécable n'est pas dans la police : une espace insécable ordinaire la remplace.
    const source = run.text.replace(/\u202f/g, "\u00a0");
    source.split("\n").forEach((part, i) => {
      if (i > 0) {
        out.push([]);
        glue = false;
      }
      for (const token of part.split(/( +)/)) {
        if (token === "") continue;
        if (/^ +$/.test(token)) {
          glue = false;
          continue;
        }
        const words = out[out.length - 1];
        const piece = { text: token, font: fontOf(run, italicBase) };
        if (glue && words.length > 0) words[words.length - 1].pieces.push(piece);
        else words.push({ pieces: [piece] });
        glue = true;
      }
    });
  }
  return out;
}

export function makeMeasure(metrics: Metrics) {
  const cache = new Map<string, number>();
  const width = (s: string, font: FontStyle, size: number, spacing = 0) => {
    const clean = stripShy(s);
    if (clean === "") return 0;
    const key = `${font}|${size}|${clean}`;
    let w = cache.get(key);
    if (w === undefined) {
      w = metrics.width(clean, font, size);
      cache.set(key, w);
    }
    return w + spacing * Math.max(0, [...clean].length - 1);
  };
  return width;
}
type Measure = ReturnType<typeof makeMeasure>;

const wordWidth = (w: Word, size: number, measure: Measure) => w.pieces.reduce((sum, p) => sum + measure(p.text, p.font, size), 0);

/** Coupe un mot à sa `k`-ième coupure possible : la tête reçoit le trait d'union. */
function splitWord(word: Word, k: number): [Word, Word] | null {
  let seen = 0;
  for (let pi = 0; pi < word.pieces.length; pi++) {
    const piece = word.pieces[pi];
    let at = -1;
    for (let c = 0; c < piece.text.length; c++) {
      if (piece.text[c] === SHY) {
        if (seen === k) {
          at = c;
          break;
        }
        seen++;
      }
    }
    if (at >= 0) {
      const head = [...word.pieces.slice(0, pi), { text: `${piece.text.slice(0, at)}-`, font: piece.font }];
      const tail = [{ text: piece.text.slice(at + 1), font: piece.font }, ...word.pieces.slice(pi + 1)].filter((p) => p.text !== "");
      return [{ pieces: head }, { pieces: tail }];
    }
  }
  return null;
}
const breakCount = (w: Word) => w.pieces.reduce((n, p) => n + (p.text.split(SHY).length - 1), 0);

/** Retour à la ligne glouton, avec césure quand le mot suivant ne tient pas. */
function breakLines(words: Word[], size: number, measure: Measure, widthAt: (i: number) => { width: number; offset: number }): Line[] {
  const space = measure(" ", "regular", size);
  const lines: Line[] = [];
  let cur: Word[] = [];
  let used = 0;
  const flush = (last: boolean) => {
    lines.push({ words: cur, last, ...widthAt(lines.length) });
    cur = [];
    used = 0;
  };
  const queue = [...words];
  while (queue.length > 0) {
    const word = queue.shift()!;
    const { width } = widthAt(lines.length);
    const gap = cur.length > 0 ? space : 0;
    const w = wordWidth(word, size, measure);
    if (used + gap + w <= width + 0.01) {
      cur.push(word);
      used += gap + w;
      continue;
    }
    // Le mot ne tient pas : on cherche la plus longue tête qui tient, trait d'union compris.
    let placed = false;
    for (let k = breakCount(word) - 1; k >= 0; k--) {
      const parts = splitWord(word, k);
      if (!parts) continue;
      if (used + gap + wordWidth(parts[0], size, measure) <= width + 0.01) {
        cur.push(parts[0]);
        flush(false);
        queue.unshift(parts[1]);
        placed = true;
        break;
      }
    }
    if (placed) continue;
    if (cur.length > 0) {
      flush(false);
      queue.unshift(word);
    } else {
      // Mot plus long que la ligne : il déborde plutôt que d'être coupé n'importe où.
      cur.push(word);
      flush(false);
    }
  }
  if (cur.length > 0 || lines.length === 0) flush(true);
  else lines[lines.length - 1].last = true;
  return lines;
}

type Align = "justify" | "left" | "center";

/** Les textes d'une ligne, à partir de `x` (bord gauche du bloc), sur la ligne de base `y`. */
function placeLine(line: Line, x: number, y: number, size: number, measure: Measure, align: Align): PrintText[] {
  const space = measure(" ", "regular", size);
  const widths = line.words.map((w) => wordWidth(w, size, measure));
  const natural = widths.reduce((a, b) => a + b, 0) + space * Math.max(0, line.words.length - 1);
  let gap = space;
  let start = x + line.offset;
  if (align === "justify" && !line.last && line.words.length > 1) gap = space + (line.width - natural) / (line.words.length - 1);
  else if (align === "center") start += Math.max(0, (line.width - natural) / 2);
  const out: PrintText[] = [];
  let at = start;
  line.words.forEach((word, i) => {
    let px = at;
    for (const piece of word.pieces) {
      const t = stripShy(piece.text);
      if (t) out.push({ x: px, y, text: t, font: piece.font, size });
      px += measure(piece.text, piece.font, size);
    }
    at += widths[i] + gap;
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Composition

interface Geometry {
  width: number;
  height: number;
  top: number;
  textHeight: number;
  outside: number;
  inside: number;
  measure: number;
  size: number;
  leading: number;
}

function geometry(trim: TrimId, gutter: number): Geometry {
  const t = KDP_TRIMS[trim];
  const width = t.width * INCH;
  const height = t.height * INCH;
  const outside = t.outside * INCH;
  const inside = gutter * INCH;
  return {
    width,
    height,
    top: TOP * INCH,
    textHeight: height - (TOP + BOTTOM) * INCH,
    outside,
    inside,
    measure: width - outside - inside,
    size: t.size,
    leading: t.size * LEADING,
  };
}

const upper = (s: string, lang: string) => s.toLocaleUpperCase(lang);

/** Une composition, pour un grand fond donné ; `folios` : numéros de page du sommaire (second passage). */
function compose(book: BookDoc, options: PrintOptions, strings: BookStrings, metrics: Metrics, gutter: number, folios?: number[]): BookLayout {
  const g = geometry(options.trim, gutter);
  const measure = makeMeasure(metrics);
  const { size, leading } = g;
  const pages: PrintPage[] = [];
  const entries: BookEntry[] = [];
  let page: PrintPage = { recto: true, role: "front", texts: [] };
  let y = 0;

  const left = (p: PrintPage) => (p.recto ? g.inside : g.outside);
  const newPage = (role: PageRole, opening = false) => {
    page = { recto: pages.length % 2 === 0, role, ...(opening ? { opening } : {}), texts: [] };
    pages.push(page);
    y = 0;
  };
  /** Nouvelle belle page (page de droite), précédée d'une page blanche si besoin. */
  const recto = (role: PageRole, opening = false) => {
    if (pages.length % 2 === 1) newPage("blank");
    newPage(role, opening);
  };
  const baseline = (lineTop: number, lead: number, sz: number) => g.top + lineTop + (lead - sz) / 2 + sz * 0.8;
  const roomLines = (lead = leading) => Math.floor((g.textHeight - y) / lead + 1e-6);

  /** Lignes centrées d'un texte simple (titres), mises à la suite à partir de `y`. Une ligne = un texte. */
  const centered = (s: string, font: FontStyle, sz: number, lead: number, spacing = 0) => {
    const words = s.split(/\s+/).filter(Boolean).map((t) => ({ pieces: [{ text: t, font }] }));
    if (words.length === 0) return;
    // L'espacement des lettres compte aussi entre les mots (le PDF l'applique à chaque caractère).
    const m: Measure = (t, f, z) => measure(t, f, z, spacing) + (t === " " ? spacing : 0);
    const lines = breakLines(words, sz, m, () => ({ width: g.measure, offset: 0 }));
    for (const line of lines) {
      if (y + lead > g.textHeight + 0.01) newPage(page.role);
      const content = line.words.map((w) => w.pieces.map((p) => stripShy(p.text)).join("")).join(" ");
      const w = measure(content, font, sz, spacing);
      page.texts.push({ x: left(page) + Math.max(0, (g.measure - w) / 2), y: baseline(y, lead, sz), text: content, font, size: sz, ...(spacing ? { spacing } : {}) });
      y += lead;
    }
  };

  /** Paragraphe : lignes, puis pages (au moins deux lignes de chaque côté d'une coupure de page). */
  const paragraph = (runs: Run[], o: { align: Align; indent?: number; inset?: number; sz?: number; lead?: number; italic?: boolean; dropCap?: boolean; role: PageRole }) => {
    const sz = o.sz ?? size;
    const lead = o.lead ?? leading;
    const inset = o.inset ?? 0;
    for (const [part, words] of wordsOf(runs, !!o.italic).entries()) {
      if (words.length === 0) {
        y += lead;
        continue;
      }
      // Lettrine : la première lettre sur deux lignes, le reste du texte la contourne.
      let cap: { letter: string; size: number; width: number; font: FontStyle } | null = null;
      if (o.dropCap && part === 0) {
        const first = words[0].pieces[0];
        const ch = [...stripShy(first.text)][0] ?? "";
        if (/\p{L}/u.test(ch) && stripShy(words.map((w) => w.pieces.map((p) => p.text).join("")).join(" ")).length > 40) {
          const capSize = (lead + metrics.capHeight * sz) / metrics.capHeight;
          const letter = ch.toLocaleUpperCase();
          const capFont: FontStyle = first.font === "bold" || first.font === "boldItalic" ? "bold" : "regular";
          cap = { letter, size: capSize, width: measure(letter, capFont, capSize) + sz * 0.15, font: capFont };
          first.text = first.text.slice(first.text.indexOf(ch) + ch.length);
          if (first.text === "") words[0].pieces.shift();
          if (words[0].pieces.length === 0) words.shift();
        }
      }
      const indent = o.indent ?? 0;
      const lines = breakLines(words, sz, measure, (i) => {
        const shift = (cap && i < 2 ? cap.width : 0) + (i === 0 ? indent : 0);
        return { width: g.measure - 2 * inset - shift, offset: inset + shift };
      });
      let i = 0;
      while (i < lines.length) {
        const room = roomLines(lead);
        const rest = lines.length - i;
        let take = rest <= room ? rest : room;
        if (take < rest) {
          if (rest - take < 2) take = rest - 2;
          if (take < 2 && rest > 1) take = 0;
        }
        if (take <= 0) {
          if (y === 0) take = Math.max(1, Math.min(rest, room));
          else {
            newPage(o.role);
            continue;
          }
        }
        for (let k = 0; k < take; k++) {
          const line = lines[i + k];
          const by = baseline(y, lead, sz);
          if (cap && i + k === 0) page.texts.push({ x: left(page) + inset, y: baseline(y + lead, lead, sz), text: cap.letter, font: cap.font, size: cap.size });
          page.texts.push(...placeLine(line, left(page), by, sz, measure, o.align));
          y += lead;
        }
        i += take;
        if (i < lines.length) newPage(o.role);
      }
    }
  };

  /** Séparateur de scènes : trois astérisques, jamais seuls en bas de page. */
  const sceneBreak = (role: PageRole) => {
    if (roomLines() < 3) newPage(role);
    if (y > 0) y += leading / 2;
    centered("***", "regular", size, leading, size * 0.9);
    y += leading / 2;
  };

  /** Prose d'un chapitre ou d'une page de fin. */
  const prose = (blocks: Block[], o: { opening: boolean; role: PageRole; flush?: boolean }) => {
    let fresh = true;
    let first = o.opening;
    for (const block of blocks) {
      if (block.kind === "image") continue;
      if (block.kind === "heading") {
        if (roomLines() < 4) newPage(o.role);
        if (y > 0) y += leading;
        centered(runsText(block.runs), "italic", size, leading);
        y += leading / 2;
        fresh = true;
        continue;
      }
      const plain = runsText(block.runs).trim();
      if (plain === SCENE_BREAK || isSceneBreak(plain)) {
        sceneBreak(o.role);
        fresh = true;
        continue;
      }
      const mark = block.list ? (block.list === "number" ? `${block.index ?? 1}. ` : "• ") : "";
      const runs = mark ? [{ text: mark }, ...block.runs] : block.runs;
      const quote = !!block.quote || !!block.list;
      paragraph(runs, {
        align: "justify",
        role: o.role,
        indent: fresh || quote || o.flush ? 0 : size * INDENT,
        inset: quote ? size * INDENT : 0,
        dropCap: first && options.dropCap && !quote,
      });
      if (o.flush) y += size * 0.7;
      fresh = false;
      first = false;
    }
  };

  /** En-tête d'un chapitre ou d'une page de fin. */
  const chapterHead = (label: string, title: string) => {
    y = 1.35 * INCH;
    if (label && title) {
      centered(upper(label, book.lang), "regular", size * 0.95, size * 0.95 * 1.3, size * 0.95 * 0.24);
      y += 0.16 * INCH;
      centered(title, "regular", size * 1.6, size * 1.6 * 1.2);
    } else if (label || title) {
      centered(label || title, "regular", size * 1.35, size * 1.35 * 1.2, size * 1.35 * 0.06);
    }
    y += 0.42 * INCH;
  };

  const sections = book.sections;
  const pageOf = (kind: PageKind) => sections.find((s) => s.kind === "page" && s.page === kind) as Extract<BookSection, { kind: "page" }> | undefined;

  // Page de titre (page 1 du fichier, à droite) : celle de l'auteur s'il l'a écrite.
  newPage("front");
  {
    const own = pageOf("titre")?.blocks.filter((b): b is Extract<Block, { kind: "paragraph" }> => b.kind === "paragraph") ?? [];
    const title = own.length > 0 ? runsText(own[0].runs) : book.title;
    const author = own.length > 1 ? runsText(own[own.length - 1].runs) : book.author;
    y = 1.6 * INCH;
    centered(title, "regular", size * 2.3, size * 2.3 * 1.15);
    for (const sub of own.slice(1, -1)) {
      y += 0.18 * INCH;
      centered(runsText(sub.runs), "italic", size * 1.15, size * 1.15 * 1.3);
    }
    if (author) {
      y += 1.3 * INCH;
      centered(upper(author, book.lang), "regular", size * 0.95, size * 0.95 * 1.3, size * 0.95 * 0.2);
    }
  }

  // Au dos : la page de copyright, celle de l'auteur ou la page standard, en bas de page.
  newPage("front");
  {
    const sz = size * 0.78;
    const lead = sz * 1.5;
    const own = pageOf("copyright")?.blocks.filter((b): b is Extract<Block, { kind: "paragraph" }> => b.kind === "paragraph").map((b) => b.runs) ?? [];
    // Sans nom d'auteur, la ligne s'arrête à l'année.
    const name = book.author;
    const paras: Run[][] =
      own.length > 0
        ? [...own]
        : [
            [{ text: fill(strings.copyright, { year: book.year, name }).trim() }],
            [{ text: strings.rights }],
            [{ text: strings.reproduction }],
            ...(options.fiction ? [[{ text: strings.fiction }]] : []),
          ];
    if (options.isbn && !paras.some((p) => /isbn/i.test(runsText(p)))) paras.push([{ text: fill(strings.isbn, { isbn: options.isbn }) }]);
    // Hauteur du bloc mesurée à blanc, pour le poser en bas de la page.
    const count = paras.reduce((n, runs) => n + wordsOf(runs, false).reduce((m, words) => m + breakLines(words, sz, measure, () => ({ width: g.measure, offset: 0 })).length, 0), 0);
    const height = count * lead + (paras.length - 1) * sz * 0.75;
    y = Math.max(0, g.textHeight - height);
    paras.forEach((runs, i) => {
      if (i > 0) y += sz * 0.75;
      paragraph(runs, { align: "left", sz, lead, role: "front" });
    });
  }

  // Dédicace et épigraphe, chacune en belle page.
  for (const kind of ["dedicace", "epigraphe"] as const) {
    const own = pageOf(kind);
    if (!own || own.blocks.length === 0) continue;
    recto("front");
    y = 1.7 * INCH;
    const paras = own.blocks.filter((b): b is Extract<Block, { kind: "paragraph" }> => b.kind === "paragraph");
    paras.forEach((b, i) => {
      if (i > 0) y += size * 0.6;
      // L’auteur d’une citation (la dernière ligne, après un tiret) en romain.
      const attribution = kind === "epigraphe" && i === paras.length - 1 && paras.length > 1 && /^[—–-]/.test(runsText(b.runs).trim());
      paragraph(b.runs, { align: "center", italic: !attribution, sz: attribution ? size * 0.9 : size, role: "front" });
    });
  }

  // Sommaire : récit et pages de fin, chacun avec sa page.
  const story = sections.filter((s) => s.kind === "chapter" || s.page === "prologue" || s.page === "epilogue");
  const backOwn = sections.filter((s) => s.kind === "page" && (s.page === "remerciements" || s.page === "auteur"));
  const hasNote = options.thanks || !!options.website || !!options.newsletter;
  const alsoBy = options.alsoBy.split("\n").map((l) => l.trim()).filter(Boolean);
  const titleOf = (s: BookSection) => (s.kind === "chapter" ? s.toc : s.title);
  const tocTitles = [...story.map(titleOf), ...(hasNote ? [strings.thanksTitle] : []), ...backOwn.map(titleOf), ...(alsoBy.length > 0 ? [strings.alsoBy] : [])];
  if (options.toc && tocTitles.length > 0) {
    recto("front");
    y = 0.6 * INCH;
    centered(upper(strings.contents, book.lang), "regular", size * 1.05, size * 1.05 * 1.3, size * 1.05 * 0.22);
    y += 0.45 * INCH;
    tocTitles.forEach((title, i) => {
      const n = folios?.[i];
      const label = n ? String(n) : "";
      const numberWidth = measure(label || "000", "regular", size) + size;
      const words = title.split(/\s+/).filter(Boolean).map((t) => ({ pieces: [{ text: t, font: "regular" as FontStyle }] }));
      const lines = breakLines(words, size, measure, () => ({ width: g.measure - numberWidth, offset: 0 }));
      if (roomLines() < lines.length) newPage("front");
      lines.forEach((line, k) => {
        const by = baseline(y, leading, size);
        page.texts.push(...placeLine(line, left(page), by, size, measure, "left"));
        if (k === lines.length - 1 && label) page.texts.push({ x: left(page) + g.measure - measure(label, "regular", size), y: by, text: label, font: "regular", size });
        y += leading;
      });
      y += size * 0.35;
    });
  }

  // Le récit : chaque partie en belle page ; la première est la page 1.
  let firstStory = -1;
  for (const s of story) {
    recto("story", true);
    if (firstStory < 0) firstStory = pages.length - 1;
    entries.push({ title: titleOf(s), page: pages.length - 1 });
    if (s.kind === "chapter") chapterHead(s.label, s.title);
    else chapterHead("", s.title);
    prose(s.blocks, { opening: true, role: "story" });
  }

  // Les pages de fin : la première en belle page, les suivantes à la suite.
  let firstBack = true;
  const backPage = (title: string) => {
    if (firstBack) recto("back", true);
    else newPage("back", true);
    firstBack = false;
    entries.push({ title, page: pages.length - 1 });
    chapterHead("", title);
  };
  if (hasNote) {
    backPage(strings.thanksTitle);
    if (options.thanks) {
      for (const para of fill(strings.thanksText, { title: book.title }).split(/\n+/)) {
        paragraph([{ text: para }], { align: "justify", role: "back" });
        y += size * 0.7;
      }
    }
    const reach = [options.website && [strings.website, options.website], options.newsletter && [strings.newsletter, options.newsletter]].filter(Boolean) as string[][];
    if (reach.length > 0) {
      y += size * 1.4;
      centered(upper(strings.stayInTouch, book.lang), "regular", size * 0.85, leading, size * 0.85 * 0.18);
      for (const [label, value] of reach) {
        y += size * 0.35;
        centered(`${label} ${value}`, "regular", size, leading);
      }
    }
  }
  for (const s of backOwn) {
    backPage(titleOf(s));
    prose(s.blocks, { opening: false, role: "back", flush: true });
  }
  if (alsoBy.length > 0) {
    backPage(strings.alsoBy);
    for (const line of alsoBy) {
      centered(line, "italic", size, leading);
      y += size * 0.45;
    }
  }

  // Nombre de pages pair : le livre finit sur une page de gauche.
  if (pages.length % 2 === 1) newPage("blank");

  // Titres courants (auteur à gauche, titre à droite) et folios aux coins extérieurs.
  const headSize = size * 0.7;
  const folioSize = size * 0.82;
  pages.forEach((p, i) => {
    if (p.role === "blank") {
      p.texts = [];
      return;
    }
    if (firstStory >= 0 && i >= firstStory && (p.role === "story" || p.role === "back")) {
      p.folio = i - firstStory + 1;
      const label = String(p.folio);
      const w = measure(label, "regular", folioSize);
      const by = g.height - BOTTOM * INCH + 0.2 * INCH + folioSize * 0.8;
      p.texts.push({ x: p.recto ? g.width - g.outside - w : g.outside, y: by, text: label, font: "regular", size: folioSize, muted: true });
    }
    if (p.role === "story" && !p.opening) {
      const head = upper((p.recto ? book.title : book.author || book.title).trim(), book.lang);
      const spacing = headSize * 0.16;
      const w = measure(head, "regular", headSize, spacing);
      if (head) p.texts.push({ x: left(p) + Math.max(0, (g.measure - w) / 2), y: g.top - 0.18 * INCH, text: head, font: "regular", size: headSize, spacing, muted: true });
    }
  });

  return { width: g.width, height: g.height, gutter, pages, entries };
}

/**
 * Le livre composé. Le grand fond dépend du nombre de pages : on recompose tant qu'il change (il ne fait
 * que grandir, donc cela s'arrête), puis une dernière fois avec les numéros de page du sommaire.
 */
export function layoutPaperback(book: BookDoc, options: PrintOptions, strings: BookStrings, metrics: Metrics, pagesGuess = 200): BookLayout {
  let gutter = gutterFor(Math.max(KDP_MIN_PAGES, pagesGuess));
  let layout = compose(book, options, strings, metrics, gutter);
  for (let pass = 0; pass < 8; pass++) {
    const needed = gutterFor(layout.pages.length);
    if (needed <= gutter) break;
    gutter = needed;
    layout = compose(book, options, strings, metrics, gutter);
  }
  if (options.toc) {
    const folios = layout.entries.map((e) => layout.pages[e.page]?.folio ?? 0);
    layout = compose(book, options, strings, metrics, gutter, folios);
  }
  return layout;
}

// ---------------------------------------------------------------------------------------------------------
// Gabarit de couverture

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoverLayout {
  width: number;
  height: number;
  bleed: Box[];
  trim: Box;
  back: Box;
  spine: Box;
  front: Box;
  /** Zones où garder le texte. */
  safe: Box[];
  barcode: Box;
  spineInches: number;
  spineText: boolean;
}

/** Mesures du gabarit (points, origine en haut à gauche) : dos, fond perdu, zones sûres, code-barres. */
export function coverLayout(trim: TrimId, paper: PaperId, pages: number): CoverLayout {
  const t = KDP_TRIMS[trim];
  const bleed = 0.125;
  const safe = 0.125;
  const spine = spineInches(pages, paper);
  const W = bleed + t.width + spine + t.width + bleed;
  const H = bleed + t.height + bleed;
  const box = (x: number, y: number, w: number, h: number): Box => ({ x: x * INCH, y: y * INCH, width: w * INCH, height: h * INCH });
  const backX = bleed;
  const spineX = bleed + t.width;
  const frontX = spineX + spine;
  return {
    width: W * INCH,
    height: H * INCH,
    bleed: [box(0, 0, W, bleed), box(0, H - bleed, W, bleed), box(0, 0, bleed, H), box(W - bleed, 0, bleed, H)],
    trim: box(bleed, bleed, W - 2 * bleed, H - 2 * bleed),
    back: box(backX, bleed, t.width, t.height),
    spine: box(spineX, bleed, spine, t.height),
    front: box(frontX, bleed, t.width, t.height),
    safe: [
      box(backX + safe, bleed + safe, t.width - 2 * safe, t.height - 2 * safe),
      box(frontX + safe, bleed + safe, t.width - 2 * safe, t.height - 2 * safe),
      ...(spine > 0.125 ? [box(spineX + 0.0625, bleed + safe, spine - 0.125, t.height - 2 * safe)] : []),
    ],
    barcode: box(backX + t.width - 0.25 - 2, bleed + t.height - 0.25 - 1.2, 2, 1.2),
    spineInches: spine,
    spineText: pages >= SPINE_TEXT_PAGES,
  };
}
