// Import d'un PDF (accueil, « Importer un fichier ») : le texte d'un PDF n'a ni paragraphes ni styles, seulement
// des bouts de texte posés à une position. Ce module retrouve les lignes, puis, pour un scénario, les éléments
// par leur retrait et leur casse (en-tête, action, personnage, didascalie, dialogue, transition) ; pour un
// roman, les paragraphes (retrait de première ligne, ligne courte, interligne) et les titres (corps plus grand).
// Fonctions pures, testées : la lecture du fichier par pdf.js est dans pdfDocument.ts (readPdfText).
// Un PDF en images (scanné) n'a pas de texte : rien n'est importé.

import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import type { ImportedPara } from "./manuscript";

/** Un bout de texte du PDF : position de sa ligne de base depuis le haut de la page, en points. */
export interface PdfItem {
  x: number;
  y: number;
  width: number;
  /** Corps du texte, en points. */
  size: number;
  text: string;
}

export interface PdfPageText {
  width: number;
  height: number;
  items: PdfItem[];
}

/** Morceau d'une ligne : un bloc de texte continu (un grand blanc sépare deux morceaux). */
export interface PdfSegment {
  x: number;
  right: number;
  text: string;
}

export interface PdfLine {
  y: number;
  size: number;
  segments: PdfSegment[];
  /** Le texte entier de la ligne. */
  text: string;
  x: number;
  right: number;
}

const median = (values: number[], fallback: number) => {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Largeur moyenne d'un caractère (Courier 12 : 7,2 points), d'après les bouts de texte assez longs. */
export function charWidth(pages: PdfPageText[]): number {
  const widths = pages.flatMap((p) => p.items.filter((i) => i.text.trim().length >= 3 && i.width > 0).map((i) => i.width / i.text.length));
  return median(widths, 7.2);
}

/**
 * Les lignes d'une page, de haut en bas : bouts regroupés par ligne de base, de gauche à droite. Un blanc de
 * plus de trois caractères coupe la ligne en morceaux (numéro de scène dans la marge, dialogue simultané).
 */
export function pdfLines(page: PdfPageText, char = 7.2): PdfLine[] {
  const items = page.items.filter((i) => i.text !== "" && i.text.trim() !== "").sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PdfItem[][] = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= Math.max(1.5, row[0].size * 0.35)) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    // Morceaux : bouts de texte proches. Le texte est assemblé ensuite, quand on connaît tous les blancs.
    const groups: PdfItem[][] = [];
    for (const item of row) {
      const group = groups[groups.length - 1];
      const last = group?.[group.length - 1];
      if (last && item.x - (last.x + last.width) <= char * 3) group.push(item);
      else groups.push([item]);
    }
    const segments: PdfSegment[] = groups.map((group) => ({
      x: group[0].x,
      right: Math.max(...group.map((i) => i.x + i.width)),
      text: unspace(joinItems(group, char).replace(/\s+/g, " ").trim()),
    }));
    const kept = segments.filter((s) => s.text !== "");
    return {
      y: median(row.map((i) => i.y), row[0].y),
      size: median(row.map((i) => i.size), row[0].size),
      segments: kept,
      text: kept.map((s) => s.text).join(" "),
      x: kept[0]?.x ?? 0,
      right: kept[kept.length - 1]?.right ?? 0,
    };
  }).filter((l) => l.segments.length > 0);
}

/**
 * Texte espacé lettre à lettre que pdf.js rend avec une espace entre chaque lettre (« C H A P I T R E 2 ») :
 * les lettres sont recollées, et un nombre reste séparé du mot (« CHAPITRE 2 »).
 */
export function unspace(text: string): string {
  const tokens = text.split(" ");
  if (tokens.length < 4 || !tokens.every((t) => [...t].length === 1)) return text;
  return tokens.join("").replace(/(\p{L})(\d)/gu, "$1 $2");
}

/**
 * Le texte d'un morceau. Un blanc de plus d'un tiers de caractère entre deux bouts fait une espace ; mais un
 * texte espacé lettre à lettre (titre courant « L E  P H A R E ») n'a d'espaces qu'aux vrais blancs, plus larges.
 */
function joinItems(items: PdfItem[], char: number): string {
  const gaps = items.slice(1).map((item, i) => item.x - (items[i].x + items[i].width));
  const letters = items.filter((i) => i.text.trim().length === 1).length;
  const spaced = items.length >= 4 && letters >= items.length * 0.7;
  const wordGap = spaced ? median(gaps, 0) * 1.6 + 0.5 : char * 0.3;
  let text = items[0].text;
  items.slice(1).forEach((item, i) => {
    const space = gaps[i] > wordGap && !text.endsWith(" ") && !item.text.startsWith(" ");
    text += (space ? " " : "") + item.text;
  });
  return text;
}

// ---------------------------------------------------------------------------------------------------------
// Scénario

const HEADING = /^(?:\d+[A-Z]{0,2}\.?\s+)?(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E|INT|EXT|EST)[.\s]/i;
const SCENE_NUMBER = /^\d+[A-Z]{0,2}\.?$/;
/** (MORE), (À SUIVRE), (CONTINUED), CONTINUED:, (SUITE) seuls sur leur ligne : ajoutés par le logiciel. */
const PAGE_MARK = /^\(?\s*(MORE|PLUS|[ÀA] SUIVRE|CONTINUED|CONTINU[ÉE]|SUITE|CONT['’]?D)\s*\)?\s*:?$/i;
/** Suite d'une réplique ajoutée au nom : (CONT'D), (SUITE), (CONT.). */
const CONTD = /\s*\((CONT['’.]?D?|CONTINUED|SUITE)\.?\)\s*$/i;
const TRANSITION = /(TO|À|IN|OUT|SUR|AU NOIR)\s*:$|^(FADE|FONDU|CUT|COUPE)\b.*[:.]$/i;

const isUpper = (s: string) => /\p{L}/u.test(s) && s === s.toLocaleUpperCase() && s !== s.toLocaleLowerCase();
const isPageNumber = (text: string) => /^(page\s+)?\d+\.?$/i.test(text.trim());

/** Assez d'en-têtes de scène (INT., EXT.) pour lire le PDF comme un scénario. */
export function looksLikeScreenplayPdf(pages: PdfPageText[]): boolean {
  const char = charWidth(pages);
  let headings = 0;
  for (const page of pages) for (const line of pdfLines(page, char)) if (HEADING.test(line.text) && isUpper(line.text.replace(HEADING, ""))) headings++;
  return headings >= 2;
}

type Kind = "sceneHeading" | "action" | "character" | "parenthetical" | "dialogue" | "transition";

interface Classified {
  kind: Kind;
  text: string;
  y: number;
  page: number;
  sceneNumber?: string;
  /** Second nom d'un dialogue simultané. */
  dual?: boolean;
}

/** Dialogue simultané en cours de lecture : deux colonnes, séparées en `split` (abscisse). */
interface DualColumns {
  split: number;
  lastY: number;
  /** Interligne dans les colonnes (du nom à la première ligne) : un blanc plus grand les termine. */
  step: number | null;
  sides: [Classified[], Classified[]];
  paren: [boolean, boolean];
}

/** Retrouve les éléments d'un scénario d'après le retrait de chaque ligne (en caractères depuis la marge). */
export function screenplayFromPdf(pages: PdfPageText[]): Screenplay {
  const char = charWidth(pages);
  const all = pages.map((p) => pdfLines(p, char));

  // Page de titre : une première page sans en-tête de scène, quand les suivantes en ont.
  const hasHeading = (lines: PdfLine[]) => lines.some((l) => HEADING.test(l.text));
  const titlePage = all.length > 1 && !hasHeading(all[0]) && all.slice(1).some(hasHeading) ? readTitlePage(all[0], pages[0]) : null;
  const body = titlePage ? all.slice(1) : all;
  const bodyPages = titlePage ? pages.slice(1) : pages;

  // La marge de l'action : celle des en-têtes de scène (les numéros de scène sont des morceaux à part, à gauche).
  const headingX = body.flatMap((lines) => lines.flatMap((l) => l.segments.filter((s) => HEADING.test(s.text)).map((s) => s.x)));
  const base = median(headingX, median(body.flat().map((l) => l.x), 108));
  const indent = (x: number) => (x - base) / char;

  const lineGap = median(
    body.flatMap((lines) => lines.slice(1).map((l, i) => l.y - lines[i].y).filter((d) => d > 0)),
    12,
  );

  const out: Classified[] = [];
  // Dialogue simultané : les deux répliques, celle de gauche puis celle de droite (second nom marqué `dual`).
  let dual: DualColumns | null = null;
  const flushDual = () => {
    if (dual) out.push(...dual.sides[0], ...dual.sides[1]);
    dual = null;
  };
  const isCue = (seg: PdfSegment) => isUpper(seg.text) && seg.text.length <= 40 && !HEADING.test(seg.text) && !seg.text.startsWith("(");

  body.forEach((lines, pageIndex) => {
    const page = bodyPages[pageIndex];
    let openParen = false;
    flushDual();
    lines.forEach((line) => {
      // En-tête et pied de page : numéro de page, (MORE), CONTINUED.
      const edge = line.y < page.height * 0.09 || line.y > page.height * 0.92;
      let segments = line.segments.filter((s) => !PAGE_MARK.test(s.text) && !(edge && isPageNumber(s.text)));
      if (edge && segments.every((s) => isPageNumber(s.text) || /^\d+[A-Z]?\s*$/.test(s.text))) return;
      if (segments.length === 0) return;
      // Numéros de scène dans les marges : gardés comme numéro de l'en-tête, pas comme texte.
      let sceneNumber: string | undefined;
      segments = segments.filter((s) => {
        const inMargin = indent(s.x) < -1 || indent(s.x) > 58;
        if (inMargin && SCENE_NUMBER.test(s.text)) {
          sceneNumber ??= s.text.replace(/\.$/, "");
          return false;
        }
        return true;
      });
      // Deux noms côte à côte (dialogue simultané) : la suite se lit en deux colonnes tant que les lignes se suivent.
      const current = dual as DualColumns | null;
      if (current && (line.y - current.lastY > Math.min(lineGap, current.step ?? lineGap) * 1.5)) flushDual();
      if (!dual && segments.length === 2 && isCue(segments[0]) && isCue(segments[1])) {
        const [l, r] = segments.map((seg) => indent(seg.x));
        if (l >= 4 && l < 26 && r >= 28 && r - l >= 20) {
          const cue = (seg: PdfSegment, isDual: boolean): Classified => ({ kind: "character", text: seg.text, y: line.y, page: pageIndex, ...(isDual ? { dual: true } : {}) });
          dual = { split: (segments[0].x + segments[1].x) / 2, lastY: line.y, step: null, sides: [[cue(segments[0], false)], [cue(segments[1], true)]], paren: [false, false] };
          return;
        }
      }
      if (dual) {
        const columns: DualColumns = dual;
        columns.step ??= line.y - columns.lastY;
        columns.lastY = line.y;
        for (const segment of segments) {
          const side = segment.x < columns.split ? 0 : 1;
          const kind: Kind = columns.paren[side] || segment.text.startsWith("(") ? "parenthetical" : "dialogue";
          if (kind === "parenthetical") columns.paren[side] = !segment.text.includes(")");
          columns.sides[side].push({ kind, text: segment.text, y: line.y, page: pageIndex });
        }
        return;
      }
      for (const segment of segments) {
        let text = segment.text;
        const r = indent(segment.x);
        const upper = isUpper(text);
        let kind: Kind;
        if (r < 5 && HEADING.test(text)) {
          kind = "sceneHeading";
          const lead = /^(\d+[A-Z]{0,2})\.?\s+/.exec(text);
          if (lead) {
            sceneNumber ??= lead[1];
            text = text.slice(lead[0].length);
          }
          // Numéro répété en fin de ligne (« INT. PHARE - NUIT 12 ») : retiré.
          if (sceneNumber) text = text.replace(new RegExp(`\\s+${sceneNumber}\\.?$`), "");
        } else if (openParen || (text.startsWith("(") && r >= 8 && r < 24)) {
          kind = "parenthetical";
        } else if (upper && r >= 30) {
          kind = "transition";
        } else if (upper && r >= 14 && r < 30 && text.length <= 50) {
          kind = "character";
        } else if (r >= 6 && r < 18) {
          kind = "dialogue";
        } else if (upper && r >= 20 && TRANSITION.test(text)) {
          kind = "transition";
        } else {
          kind = "action";
        }
        if (kind === "parenthetical") openParen = !text.includes(")");
        out.push({ kind, text, y: line.y, page: pageIndex, sceneNumber: kind === "sceneHeading" ? sceneNumber : undefined });
      }
    });
  });
  flushDual();

  // Les lignes deviennent des éléments : une ligne qui suit de près une ligne de même sorte la continue.
  const elements: ScreenplayElement[] = [];
  let lastSpeaker = "";
  let previous: Classified | null = null;
  for (const line of out) {
    const last = elements[elements.length - 1];
    const newPage = previous !== null && line.page !== previous.page;
    const close = previous !== null && !newPage && line.y - previous.y <= lineGap * 1.5;
    // Haut de page : « NOM (SUITE) » qui reprend la réplique coupée par la page précédente.
    if (newPage && line.kind === "character" && last && (last.type === "dialogue" || last.type === "parenthetical")) {
      const name = line.text.replace(CONTD, "").trim();
      if (CONTD.test(line.text) && name === lastSpeaker) {
        previous = { ...line, kind: last.type as Kind };
        continue;
      }
    }
    const continues =
      last &&
      ((close && last.type === line.kind && line.kind !== "character" && line.kind !== "sceneHeading") ||
        // Réplique ou action coupée par la page, sans ligne vide : elle continue.
        (newPage && last.type === line.kind && (line.kind === "dialogue" || line.kind === "action") && !/[.!?…»”"]$/.test(last.text)) ||
        // En-tête sur deux lignes.
        (close && last.type === "sceneHeading" && line.kind === "action" && isUpper(line.text)) ||
        // Didascalie sur plusieurs lignes.
        (close && last.type === "parenthetical" && !last.text.includes(")")));
    if (continues) {
      // Mot composé coupé en fin de ligne (« decent- » puis « looking ») : recollé sans espace, trait d'union gardé.
      const joint = /\p{L}-$/u.test(last.text) && /^\p{L}/u.test(line.text) ? "" : " ";
      last.text = `${last.text}${joint}${line.text}`.replace(/\s+/g, " ");
    } else {
      // (SUITE) / (CONT'D) après un nom : ajouté par le logiciel qui a fait le PDF, MondoWrite le remet lui-même (réglage).
      const el: ScreenplayElement = { type: line.kind, text: line.kind === "character" ? line.text.replace(CONTD, "").trim() : line.text };
      if (line.kind === "sceneHeading" && line.sceneNumber) el.sceneNumber = line.sceneNumber;
      if (line.dual) el.dual = true;
      // Dialogue ou didascalie sans personnage au-dessus : de l'action (fichier mal reconnu).
      if ((el.type === "dialogue" || el.type === "parenthetical") && !(last && (last.type === "character" || last.type === "dialogue" || last.type === "parenthetical"))) el.type = "action";
      if (el.type === "character") lastSpeaker = el.text;
      elements.push(el);
    }
    previous = line;
  }
  // Nom coupé par la mise en page du PDF (« NIC KY » pour « NICKY ») : la graphie la plus employée l'emporte,
  // à espaces près.
  const cue = (text: string) => /^([^(]*?)(\s*\(.*)?$/.exec(text)!;
  const spellings = new Map<string, Map<string, number>>();
  for (const el of elements) {
    if (el.type !== "character") continue;
    const name = cue(el.text)[1].trim();
    const key = name.replace(/\s+/g, "");
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    spellings.set(key, counts);
  }
  for (const el of elements) {
    if (el.type !== "character") continue;
    const [, raw, ext = ""] = cue(el.text);
    const counts = spellings.get(raw.trim().replace(/\s+/g, ""));
    if (!counts || counts.size < 2) continue;
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    el.text = `${best}${ext}`;
  }
  // Un personnage sans réplique derrière lui n'en est pas un : de l'action.
  elements.forEach((el, i) => {
    if (el.type === "character" && !(elements[i + 1] && (elements[i + 1].type === "dialogue" || elements[i + 1].type === "parenthetical"))) el.type = "action";
  });
  return { titlePage: titlePage ?? {}, elements };
}

/** Page de titre : le titre en haut, « Écrit par » puis l'auteur, les coordonnées en bas. Clés Fountain. */
function readTitlePage(lines: PdfLine[], page: PdfPageText): Record<string, string> {
  const fields: Record<string, string> = {};
  const credit = lines.findIndex((l) => /^(written by|écrit par|ecrit par|by|par|scénario( de)?|screenplay by|story by)\b/i.test(l.text));
  const top = lines.filter((l) => l.y < page.height * 0.6);
  const bottom = lines.filter((l) => l.y >= page.height * 0.6);
  const titleLines = (credit >= 0 ? lines.slice(0, credit) : top.slice(0, 1)).filter((l) => l.y < page.height * 0.6);
  if (titleLines.length > 0) fields.Title = titleLines.map((l) => l.text).join("\n");
  if (credit >= 0) {
    fields.Credit = lines[credit].text;
    const author = lines.slice(credit + 1).filter((l) => l.y < page.height * 0.6);
    if (author.length > 0) fields.Author = author.map((l) => l.text).join("\n");
  }
  const left = bottom.filter((l) => l.x < page.width / 2);
  const right = bottom.filter((l) => l.x >= page.width / 2);
  if (left.length > 0) fields.Contact = left.map((l) => l.text).join("\n");
  if (right.length > 0) fields["Draft date"] = right.map((l) => l.text).join("\n");
  return fields;
}

// ---------------------------------------------------------------------------------------------------------
// Roman

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ENDS_SENTENCE = /[.!?…»”"':;)\]]$/;

/** Les paragraphes d'un roman en PDF, prêts pour `chapterize` (titres et sauts de page compris). */
export function novelFromPdf(source: PdfPageText[]): ImportedPara[] {
  // Lettrines : une lettre seule, bien plus grande que le texte, posée à côté des premières lignes. Retirée des
  // bouts de texte, puis remise devant la première ligne qu'elle commence.
  const sizes = median(source.flatMap((p) => p.items.map((i) => i.size)), 12);
  const drops = source.map((p) => p.items.filter((i) => /^\p{L}$/u.test(i.text.trim()) && i.size >= sizes * 1.8));
  const pages = source.map((p, n) => ({ ...p, items: p.items.filter((i) => !drops[n].includes(i)) }));
  const char = charWidth(pages);
  const all = pages.map((p, n) =>
    pdfLines(p, char).map((line, k, lines) => {
      const beside = drops[n].find((d) => d.x < line.x && line.y <= d.y + 1 && line.y >= d.y - d.size * 1.1);
      if (!beside) return line;
      // La première ligne à côté de la lettrine la reçoit ; les suivantes, en retrait pour lui laisser la place, ne sont pas des alinéas.
      const first = !lines.slice(0, k).some((l) => l.y >= beside.y - beside.size * 1.1 && l.x > beside.x);
      return { ...line, text: first ? beside.text.trim() + line.text : line.text, x: beside.x };
    }),
  );
  // Pages de début (titre, mentions légales, dédicace) : avant la première page bien remplie, une ligne par paragraphe.
  const firstFull = all.findIndex((lines) => lines.length >= 12);

  // Titres courants et folios : en haut ou en bas de page, le même texte (chiffres mis à part) sur plusieurs pages.
  // Clé sans chiffres ni espaces : « L E  P H A R E » (texte espacé lettre à lettre) et « Le Phare 12 » se rejoignent.
  const edgeKey = (l: PdfLine) => l.text.replace(/[\d\s]+/g, "").toLocaleLowerCase();
  const isEdge = (l: PdfLine, p: PdfPageText) => l.y < p.height * 0.07 || l.y > p.height * 0.93;
  const counts = new Map<string, number>();
  all.forEach((lines, i) => {
    const seen = new Set<string>();
    for (const l of lines) if (isEdge(l, pages[i])) seen.add(edgeKey(l));
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  // Sur au moins un quart des pages (un livre alterne auteur et titre, page paire et impaire) : un titre courant.
  // Jamais un titre de chapitre (« Chapitre 3 » en haut de page revient aussi, chiffres mis à part).
  const repeated = (key: string) => !/^(chapitre|chapter|partie|part|livre|book|prologue|[ée]pilogue)/.test(key) && (counts.get(key) ?? 0) >= Math.max(2, Math.ceil(pages.length * 0.25));

  const bodySize = median(all.flat().map((l) => l.size), 12);
  // Paragraphes à alinéa (le cas d'un roman) : seul l'alinéa ouvre un paragraphe, pas une ligne plus courte
  // (un texte aligné à gauche a des fins de ligne inégales). Sinon : interligne plus grand ou ligne courte.
  const leftOf = (lines: PdfLine[]) => median(lines.filter((l) => l.size < bodySize * 1.2).map((l) => l.x), lines[0]?.x ?? 0);
  const indentedLines = all.reduce((n, lines) => {
    const left = leftOf(lines);
    return n + lines.filter((l) => l.size < bodySize * 1.2 && l.x > left + char * 1.2 && l.x < left + char * 8).length;
  }, 0);
  const bodyLines = all.reduce((n, lines) => n + lines.length, 0);
  const indentMode = indentedLines >= Math.max(2, bodyLines * 0.04);
  const paras: ImportedPara[] = [];
  let current: { text: string; heading: boolean; pageBreak: boolean } | null = null;
  const flush = () => {
    if (current && current.text.trim()) {
      const text = current.text.replace(/\s+/g, " ").trim();
      paras.push({ html: escapeHtml(text), text, ...(current.heading ? { heading: true } : {}), ...(current.pageBreak ? { pageBreak: true } : {}) });
    }
    current = null;
  };

  let breakNext = false;
  all.forEach((rawLines, pageIndex) => {
    const page = pages[pageIndex];
    // En haut ou en bas de page : folio, titre courant répété, ou texte plus petit que le corps (titre courant d'un livre).
    const lines = rawLines.filter((l) => !(isEdge(l, page) && (repeated(edgeKey(l)) || isPageNumber(l.text) || l.size < bodySize * 0.85)));
    if (lines.length === 0) {
      breakNext = true;
      return;
    }
    const left = leftOf(lines);
    const rights = lines.filter((l) => l.size < bodySize * 1.2).map((l) => l.right);
    const fullRight = rights.length > 0 ? [...rights].sort((a, b) => a - b)[Math.floor(rights.length * 0.8)] : page.width;
    const gaps = lines.slice(1).map((l, i) => l.y - lines[i].y).filter((d) => d > 0);
    const lineGap = median(gaps, bodySize * 1.2);

    // Page de garde (première page presque vide : titre, « par Untel », coordonnées) : une ligne, un paragraphe.
    const cover = pages.length > 1 && firstFull > 0 && pageIndex < firstFull;
    lines.forEach((line, i) => {
      const heading = line.size >= bodySize * 1.25;
      const prev = i > 0 ? lines[i - 1] : null;
      const indented = line.x > left + char * 1.2;
      const startsPage = i === 0;
      let fresh: boolean;
      if (!current) fresh = true;
      else if (heading !== current.heading) fresh = true;
      // Haut de page : avec des alinéas, une ligne sans alinéa continue le paragraphe de la page d'avant.
      else if (startsPage) fresh = breakNext || indented || (!indentMode && ENDS_SENTENCE.test(current.text.trim()));
      else if (indentMode) fresh = indented || (prev !== null && line.y - prev.y > lineGap * 1.6);
      else fresh = indented || (prev !== null && (line.y - prev.y > lineGap * 1.4 || prev.right < fullRight - char * 4));
      if (heading && current?.heading && prev && line.y - prev.y <= lineGap * 1.6) fresh = false;
      if (cover) fresh = true;
      // Page de garde au format Shunn : le nombre de mots (« environ 3 000 mots ») n'est pas du texte du livre.
      if (cover && /^(environ|about|approx\.?|approximately|circa|ca\.)\s+[\d\s.,  ]+\s*(mots|words)$/iu.test(line.text)) return;
      if (fresh) {
        flush();
        current = { text: line.text, heading, pageBreak: startsPage && breakNext };
      } else if (current) {
        // Mot coupé en fin de ligne (« ren- / contre ») : recollé.
        const cut = /\p{L}-$/u.test(current.text) && /^\p{Ll}/u.test(line.text);
        current.text = cut ? current.text.slice(0, -1) + line.text : `${current.text} ${line.text}`;
      }
    });
    // Une page à moitié vide finit un chapitre : la suivante ouvre peut-être le suivant.
    const lastY = lines[lines.length - 1].y;
    breakNext = lastY < page.height * 0.6;
  });
  flush();
  return paras;
}
