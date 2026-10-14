// Import d'un manuscrit existant (.docx, .md, .txt) : il devient un projet roman. Les chapitres viennent des
// titres, des sauts de page et des lignes « Chapitre 3 » (ou d'une suite de numéros seuls) ; les séparateurs
// (***, #, * * *) coupent les scènes. Chaque scène reçoit sa carte et son texte (manuscrit/), chaque chapitre
// sa place dans le plan ; un prologue et un épilogue deviennent des pages du livre.
// Règles de découpage adaptées de NEO de Hugh Howey (main.js, importFile, licence MIT).
// Fonctions pures : le fichier d'origine n'est jamais modifié.

import type { CardData, CardLayout, Project } from "../types";
import type { Chapter } from "../plan";

/** Un paragraphe lu dans le fichier. */
export interface ImportedPara {
  /** HTML du paragraphe (gras, italique), sans la balise <p>. */
  html: string;
  /** Texte simple, pour reconnaître titres et séparateurs. */
  text: string;
  pageBreak?: boolean;
  /** Style de titre (Word « heading N »). */
  heading?: boolean;
  /** Style « Title » (titre du livre, ou d'un onglet de Google Docs). */
  title?: boolean;
}

export interface ImportedChapter {
  title: string;
  /** Prologue ou épilogue : une page du livre plutôt qu'un chapitre. */
  role: "prologue" | "epilogue" | null;
  /** Scènes du chapitre : leurs paragraphes en HTML. */
  scenes: string[][];
}

export interface ImportedBook {
  title: string | null;
  author: string | null;
  chapters: ImportedChapter[];
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Gras et italique écrits en Markdown (**gras**, *italique*, _italique_) → HTML. */
export function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\p{L}\p{N}])\*(\S(?:[^*]*\S)?)\*(?![*\p{L}\p{N}])/gu, "$1<em>$2</em>")
    .replace(/(^|[^_\p{L}\p{N}])_(\S(?:[^_]*\S)?)_(?![_\p{L}\p{N}])/gu, "$1<em>$2</em>");
}

/**
 * Paragraphes d'un fichier texte (.md, .txt). Ils sont séparés par des lignes vides, sauf dans un fichier
 * qui n'en a presque pas (un paragraphe par ligne, comme l'export « texte brut » de Word ou de Scrivener).
 */
export function textParagraphs(raw: string, extension: string): ImportedPara[] {
  const source = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  const blanks = lines.filter((l) => !l.trim()).length;
  const filled = lines.length - blanks;
  const perLine = extension === "txt" && filled > 3 && blanks <= Math.max(1, filled / 20);
  const blocks = perLine ? lines : source.split(/\n\s*\n/);
  return blocks
    .map((block) => (perLine ? block : block.replace(/\s*\n\s*/g, " ")).trim())
    .filter(Boolean)
    .map((text) => {
      const heading = /^#{1,6}\s+\S/.test(text);
      const clean = heading ? text.replace(/^#{1,6}\s*/, "") : text;
      // Le texte simple perd les marques de gras et d'italique, sauf un séparateur (* * *), qui en est fait.
      const plain = isSceneBreak(clean) ? clean : clean.replace(/\*\*|__|(?<![\p{L}\p{N}])[*_]|[*_](?![\p{L}\p{N}])/gu, "");
      return { html: inlineMarkdown(clean), text: plain, heading };
    });
}

// Titres qui ne sont que la numérotation (MondoWrite numérote ses chapitres lui-même).
const CHAPTER_WORDS = new RegExp(
  "^(" +
    [
      "chapter", "prologue", "epilogue", "part",
      "chapitre", "épilogue", "partie",
      "capítulo", "capitulo", "prólogo", "prologo", "epílogo", "epilogo", "parte", "capitolo",
      "kapitel", "prolog", "epilog", "teil",
    ].join("|") +
    ")(?![\\p{L}\\d])",
  "iu",
);
const PROLOGUE = /^(prologue|prólogo|prologo|prolog)(?![\p{L}\d])/iu;
const EPILOGUE = /^(epilogue|épilogue|epílogo|epilogo|epilog)(?![\p{L}\d])/iu;
const SPELLED =
  /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt)\.?$/i;
const isNumeral = (t: string) => /^\d{1,3}\.?$/.test(t) || /^[IVXLC]{1,7}\.?$/.test(t) || SPELLED.test(t);
const readsAsSentence = (t: string) => /[.!?…][”’"'»)]*$/.test(t) && t.trim().split(/\s+/).length > 2;
/** Séparateur de scènes : ***, # , * * *, ⁂, ~~~, ---… */
export const isSceneBreak = (t: string) => /^\s*([*#•~⁂—–-]\s*){1,7}$/.test(t);
const words = (paras: string[]) => paras.reduce((n, p) => n + (p.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length), 0);

/** Les chapitres d'un manuscrit, ses scènes, son titre et son auteur s'ils sont en tête. */
export function chapterize(paras: ImportedPara[], fileName = ""): ImportedBook {
  const numeralMode = paras.filter((p) => p.text && isNumeral(p.text)).length >= 2;
  const isNumbered = (t: string) => (CHAPTER_WORDS.test(t) && t.length < 60 && !readsAsSentence(t)) || (numeralMode && isNumeral(t));
  const isHeading = (p: ImportedPara) => !!p.heading || !!p.title || (!!p.text && isNumbered(p.text));
  // Un titre qui n'est que la numérotation (« Chapitre 3 », « 7 ») ne donne pas de titre au chapitre ;
  // « Chapitre 3 : La tempête » garde « La tempête ».
  const withTitle = new RegExp(`^${CHAPTER_WORDS.source.slice(1)}\\s*[\\p{N}IVXLCivxlc]*\\s*[.:—–-]\\s*(.+)$`, "iu");
  const titleOf = (t: string) => {
    const m = t.match(withTitle);
    if (m) return m[m.length - 1].trim();
    return isNumbered(t) ? "" : t.trim();
  };

  let styledTitle: string | null = null;
  const run = (usePageBreaks: boolean) => {
    const chapters: { title: string; role: ImportedChapter["role"]; paras: (string | null)[] }[] = [];
    let cur: (string | null)[] = [];
    let title = "";
    let role: ImportedChapter["role"] = null;
    let seenProse = false;
    let lastWasHeading = false;
    styledTitle = null;
    const close = () => {
      if (cur.some((p) => p !== null)) chapters.push({ title, role, paras: cur });
      cur = [];
      title = "";
      role = null;
    };
    for (const p of paras) {
      const brk = usePageBreaks && !!p.pageBreak;
      if (!p.text && !brk && !p.heading && !p.title) continue;
      // Un titre stylé « Title » avant toute prose : c'est le titre du livre.
      if (p.title && !seenProse && styledTitle === null && p.text) {
        styledTitle = p.text;
        continue;
      }
      const h = isHeading(p);
      if (brk || h) {
        // Deux titres de suite sans prose entre eux : le second précise le premier.
        if (h && lastWasHeading && cur.length === 0 && !brk) {
          const t = titleOf(p.text);
          if (t) title = title ? `${title}, ${t}` : t;
          continue;
        }
        close();
      }
      if (h) {
        role = PROLOGUE.test(p.text) ? "prologue" : EPILOGUE.test(p.text) ? "epilogue" : null;
        title = titleOf(p.text);
        lastWasHeading = true;
        continue;
      }
      lastWasHeading = false;
      if (isSceneBreak(p.text)) {
        cur.push(null);
        continue;
      }
      if (p.text) {
        cur.push(p.html);
        seenProse = true;
      }
    }
    close();
    return chapters;
  };

  // Un traitement de texte qui met un saut de page partout éparpillerait le livre : on se fie alors aux titres.
  let chapters = run(true);
  const total = chapters.reduce((n, c) => n + words(c.paras.filter((p): p is string => p !== null)), 0);
  if (chapters.length > 6 && total / chapters.length < 250) chapters = run(false);

  // En tête du premier chapitre : un titre court (souvent le nom du fichier) et « par Untel ».
  let bookTitle: string | null = styledTitle;
  let author: string | null = null;
  const first = chapters[0];
  const plain = (html: string | null) => (html ?? "").replace(/<[^>]+>/g, "").trim();
  const byline = (s: string) => s.match(/^(?:by|par|de|por|von|di)\s+(\p{Lu}[^.!?,;…]{1,58})$/u)?.[1]?.trim() ?? null;
  if (first) {
    const t0 = plain(first.paras[0]);
    const t1 = plain(first.paras[1]);
    const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const titleish = !!t0 && t0.length < 90 && !/[.!?]$/.test(t0) && (!!byline(t1) || (norm(t0).length > 3 && norm(fileName).includes(norm(t0))));
    if (titleish) {
      bookTitle = bookTitle ?? t0;
      first.paras.shift();
      if (byline(t1)) {
        author = byline(t1);
        first.paras.shift();
      }
    } else if (byline(t0)) {
      author = byline(t0);
      first.paras.shift();
    }
  }

  return {
    title: bookTitle,
    author,
    chapters: chapters
      .map((c) => {
        const scenes: string[][] = [[]];
        for (const p of c.paras) {
          if (p === null) {
            if (scenes[scenes.length - 1].length > 0) scenes.push([]);
          } else scenes[scenes.length - 1].push(p);
        }
        return { title: c.title, role: c.role, scenes: scenes.filter((s) => s.length > 0) };
      })
      .filter((c) => c.scenes.length > 0),
  };
}

/** Titre d'une carte Scène : le début de sa première phrase, en quelques mots. */
export function sceneTitle(html: string, max = 6): string {
  const text = html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const sentence = text.split(/(?<=[.!?…])\s/)[0].replace(/^[\s«»“”"'—–-]+|[\s«»“”"'—–:;,.-]+$/g, "");
  const list = sentence.split(/\s+/).filter(Boolean);
  return list.length > max ? `${list.slice(0, max).join(" ")}…` : list.join(" ");
}

export interface ManuscriptImportOptions {
  fileName: string;
  newId: () => string;
}

const STEP_X = 280;
const STEP_Y = 240;
const PER_ROW = 8;

/**
 * Le projet roman : une carte Scène par scène (son texte dans le manuscrit), les chapitres dans le plan
 * (gabarit libre, numéros calculés), prologue et épilogue en pages du livre. Sur le canevas, une rangée
 * par chapitre.
 */
export function bookToProject(book: ImportedBook, options: ManuscriptImportOptions): Project {
  const title = book.title?.trim() || options.fileName.replace(/\.[^.]+$/, "").trim();
  const cards: CardData[] = [];
  const layout: CardLayout[] = [];
  const manuscript: Record<string, string> = {};
  const order: string[] = [];
  const chapters: Chapter[] = [];
  let row = 0;
  for (const chapter of book.chapters) {
    const ids: string[] = [];
    chapter.scenes.forEach((paras, i) => {
      const id = options.newId();
      const html = paras.map((p) => `<p>${p}</p>`).join("");
      const page = chapter.role && chapter.scenes.length === 1 ? chapter.role : undefined;
      cards.push({ id, type: "scene", title: sceneTitle(html) || chapter.title, html: "", ...(page ? { page } : {}) });
      manuscript[id] = html;
      layout.push({ id, x: 80 + (i % PER_ROW) * STEP_X, y: 80 + (row + Math.floor(i / PER_ROW)) * STEP_Y });
      ids.push(id);
    });
    row += Math.ceil(chapter.scenes.length / PER_ROW);
    // Un prologue ou un épilogue d'une seule scène est une page du livre : ni plan, ni chapitre.
    if (chapter.role && chapter.scenes.length === 1) continue;
    order.push(...ids);
    chapters.push({ id: options.newId(), title: chapter.title, scenes: ids });
  }
  return {
    meta: {
      version: 1,
      title,
      kind: "roman",
      layout,
      links: [],
      plan: { template: "libre", beats: order.length > 0 ? { libre: order } : {}, ...(chapters.length > 0 ? { chapters } : {}) },
    },
    cards,
    screenplay: null,
    manuscript,
  };
}
