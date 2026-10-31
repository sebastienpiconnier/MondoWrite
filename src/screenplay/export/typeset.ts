// Composition du scénario en pages : chaque ligne reçoit sa page, sa ligne et sa colonne.
// Fonction pure, sans dépendance au PDF : c'est ici que se décide la pagination réelle.
// Mêmes largeurs et mêmes règles que l'estimation (paginate.ts), plus la coupe des répliques.

import type { Screenplay, ScreenplayElement } from "../model";
import type { Layout } from "../layout";
import { wrap } from "../paginate";
import { characterName } from "../scenes";
import { scenesWith } from "../../review/filter";
import { foldName } from "../../review/names";

export interface TypesetLine {
  /** Ligne dans la page, à partir de 0. */
  row: number;
  /** Colonne en caractères depuis la marge gauche (négative : dans la marge). */
  column: number;
  text: string;
  bold?: boolean;
  /** En-tête de scène souligné (option du projet). */
  underline?: boolean;
  /** Synopsis, section ou note imprimés à la demande : en gris, pour se distinguer du texte. */
  gray?: boolean;
  /** Réplique du personnage choisi (texte d'un comédien) : surlignée. */
  highlight?: boolean;
}

export interface TypesetPage {
  /** Numéro de page, à partir de 1 (la page de titre n'est pas numérotée). */
  number: number;
  lines: TypesetLine[];
}

export interface TypesetStrings {
  /** En bas de page, quand une réplique continue : « (À SUIVRE) », “(MORE)”. */
  more: string;
  /** Après le nom du personnage, en haut de la page suivante : « (SUITE) », “(CONT'D)”. */
  contd: string;
}

/** Ce qui ne s'imprime pas : notes [[…]] (sauf `keepNotes`, jamais les notes de lien cosmos:) et texte mis de côté. */
export function printable(text: string, keepNotes = false): string {
  return text
    .replace(/\[\[([\s\S]*?)\]\]/g, (all, inner: string) => (keepNotes && !/^\s*cosmos:/.test(inner) ? all : ""))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, "").replace(/(\S) {2,}/g, "$1 "))
    .join("\n")
    .trim();
}

const SPEECH = new Set(["parenthetical", "dialogue"]);

export interface TypesetOptions {
  /** Numéroter toutes les scènes (1, 2, 3…). Un numéro écrit dans le fichier (#12A#) passe toujours devant. */
  numberScenes?: boolean;
  /** Souligner les en-têtes de scène. */
  underlineHeadings?: boolean;
  /** Imprimer aussi les synopsis (« = … »), les sections (« # … ») et les notes [[…]]. */
  synopsis?: boolean;
  sections?: boolean;
  notes?: boolean;
  /**
   * Texte d'un personnage : seulement les scènes où il parle ou est nommé, ses répliques surlignées, et les
   * scènes numérotées comme dans le scénario entier (le comédien parle de « la 12 » avec l'équipe).
   */
  character?: string;
  /** (À SUIVRE) et (SUITE) quand une réplique passe d'une page à l'autre (vrai par défaut). */
  breaks?: boolean;
  /** (SUITE) après le nom quand le même personnage reprend la parole après une action, dans la même scène. */
  resumes?: boolean;
}

/** Le nom porte déjà une suite (« (SUITE) », « (CONT'D) », « (CONT.) ») : on n'en ajoute pas. */
export const hasContd = (cue: string, contd: string) =>
  cue.toLocaleUpperCase().includes(contd.toLocaleUpperCase()) || /\((CONT['’.]?D?|SUITE)\.?\)/i.test(cue);

/**
 * Personnages qui reprennent la parole après une action dans la même scène (rangs des éléments `character`).
 * Une autre réplique, un en-tête ou une section entre les deux remet à zéro. Fonction pure, partagée par le
 * PDF et la feuille à l'écran.
 */
export function resumedCues(elements: ScreenplayElement[]): Set<number> {
  const out = new Set<number>();
  let last: string | null = null;
  // Dialogue double : chacun des deux noms se compare au dernier qui a parlé avant la paire, puis on repart
  // de zéro (après deux voix à la fois, personne ne « reprend »).
  let before: string | null = null;
  elements.forEach((el, index) => {
    if (el.type === "sceneHeading" || el.type === "section" || el.type === "pageBreak") last = null;
    else if (el.type === "character") {
      const name = foldName(characterName(el.text));
      const opens = !el.dual && elements.slice(index + 1).find((e) => e.type === "character" || !SPEECH.has(e.type))?.dual === true;
      if (opens) before = last;
      const previous = el.dual ? before : last;
      if (name && name === previous) out.add(index);
      last = opens || el.dual ? null : name;
    }
  });
  return out;
}

export function typeset(
  elements: ScreenplayElement[],
  layout: Layout,
  locale: string,
  strings: TypesetStrings,
  options: TypesetOptions = {},
): TypesetPage[] {
  const perPage = layout.linesPerPage;
  const width = layout.columns.action;
  const pages: TypesetPage[] = [];
  let index = 0; // page courante
  let used = 0; // lignes prises sur la page courante
  let scene = 0; // rang de la scène en cours
  const upper = (s: string) => s.toLocaleUpperCase(locale);
  const who = options.character?.trim() ? foldName(options.character) : null;
  const kept = who ? new Set(scenesWith(elements, options.character!)) : null;
  let inKept = !kept;
  const isHim = (cue: string) => who !== null && foldName(characterName(cue)) === who;

  const page = () => (pages[index] ??= { number: index + 1, lines: [] });
  const newPage = () => {
    index++;
    used = 0;
  };
  const put = (text: string, column: number, bold = false, underline = false, extra: Partial<TypesetLine> = {}) => {
    const line: TypesetLine = { row: used, column, text, ...extra };
    if (bold) line.bold = true;
    if (underline) line.underline = true;
    page().lines.push(line);
    used++;
  };
  /** Ligne vide de séparation, sauf en haut de page. Rend faux s'il a fallu changer de page. */
  const open = (keepWith: number) => {
    const gap = used === 0 ? 0 : 1;
    if (used + gap + keepWith > perPage) newPage();
    else used += gap;
  };
  /** Des lignes qui peuvent se poursuivre sur la page suivante. */
  const flow = (lines: string[], column: (line: string) => number, bold = false, extra: Partial<TypesetLine> = {}) => {
    open(1);
    for (const line of lines) {
      if (used === perPage) newPage();
      put(line, column(line), bold, false, extra);
    }
  };
  const notes = !!options.notes;
  const breaks = options.breaks !== false;
  const resumed = options.resumes ? resumedCues(elements) : new Set<number>();

  let i = 0;
  for (i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === "pageBreak") {
      if (used > 0) newPage();
      continue;
    }
    if (el.type === "sceneHeading") {
      scene++;
      if (kept) inKept = kept.has(i);
    }
    // Texte d'un personnage : les scènes sans lui (et ce qui précède la première scène) ne s'impriment pas.
    if (!inKept) continue;
    const text = printable(el.text, notes);
    if (text === "") continue;

    switch (el.type) {
      case "sceneHeading": {
        const lines = wrap(upper(text), width);
        // Jamais en bas de page : il lui faut une ligne vide et une ligne de texte.
        open(lines.length + 2);
        const number = el.sceneNumber ?? (options.numberScenes || kept ? String(scene) : "");
        if (number) {
          page().lines.push({ row: used, column: -(number.length + 2), text: number, bold: true });
          page().lines.push({ row: used, column: width + 2, text: number, bold: true });
        }
        for (const line of lines) put(line, 0, true, !!options.underlineHeadings);
        break;
      }
      case "action":
        flow(wrap(text, width), () => 0);
        break;
      case "synopsis":
        if (options.synopsis) flow(wrap(text, width), () => 0, false, { gray: true });
        break;
      case "section":
        if (options.sections) {
          const lines = wrap(upper(text), width);
          open(lines.length + 2);
          for (const line of lines) put(line, 0, true, false, { gray: true });
        }
        break;
      case "note":
        if (notes && !/^\s*cosmos:/.test(el.text)) flow(wrap(`[[${printable(el.text, true)}]]`, width), () => 0, false, { gray: true });
        break;
      case "transition":
        flow(wrap(upper(text), width), (line) => width - line.length);
        break;
      case "centered":
        flow(wrap(text, width), (line) => Math.floor((width - line.length) / 2));
        break;
      case "character": {
        // La réplique entière : le nom, puis les didascalies et le dialogue qui suivent.
        const cueIndex = i;
        const first = collect(el, layout.columns.character, layout.columns, layout.indent);
        // Dialogue simultané (« ^ » sur le second nom) : les deux répliques côte à côte.
        if (elements[i + 1]?.type === "character" && elements[i + 1].dual) {
          const half = Math.floor((width - 2) / 2);
          const narrow = { parenthetical: half - 6, dialogue: half - 2 };
          const at = (offset: number) => ({ parenthetical: offset + 3, dialogue: offset });
          i -= first.taken;
          const left = collect(el, half - 4, narrow, at(0));
          const second = elements[++i];
          const secondIndex = i;
          const right = collect(second, half - 4, narrow, at(half + 2));
          // Le même personnage reprend après une action : (SUITE) après son nom, d'un côté comme de l'autre.
          const resume = (r: typeof left, cueEl: ScreenplayElement, at: number) => {
            if (resumed.has(at) && !hasContd(cueEl.text, strings.contd)) r.cue = wrap(upper(`${printable(cueEl.text, notes)} ${strings.contd}`), half - 4);
          };
          resume(left, el, cueIndex);
          resume(right, second, secondIndex);
          if (dual(left, right, half)) break;
          // Trop long pour tenir côte à côte sur une page : l'une sous l'autre.
          speech(left.cue, left.body, left.lit);
          speech(right.cue, right.body, right.lit);
          break;
        }
        // Le même personnage reprend après une action : (SUITE) après son nom.
        if (resumed.has(cueIndex) && !hasContd(el.text, strings.contd)) {
          first.cue = wrap(upper(`${printable(el.text, notes)} ${strings.contd}`), layout.columns.character);
        }
        speech(first.cue, first.body, first.lit);
        break;
      }
      case "parenthetical":
      case "dialogue":
        // Sans personnage au-dessus (fichier venu d'ailleurs) : on garde le retrait.
        flow(wrap(text, layout.columns[el.type]), () => layout.indent[el.type as "parenthetical" | "dialogue"]);
        break;
      default:
        break; // notes, sections, synopsis, texte mis de côté : hors impression
    }
  }

  /**
   * Le nom et la réplique qui le suit (didascalies, dialogue), découpés aux largeurs données ; avance `i`
   * jusqu'au dernier élément lu. `taken` : nombre d'éléments de réplique lus, pour revenir en arrière.
   */
  function collect(
    cueEl: ScreenplayElement,
    cueWidth: number,
    columns: { parenthetical: number; dialogue: number },
    indent: { parenthetical: number; dialogue: number },
  ) {
    const cueText = printable(cueEl.text, notes);
    const cue = wrap(upper(cueText), cueWidth);
    const body: { text: string; column: number }[] = [];
    let taken = 0;
    while (i + 1 < elements.length && SPEECH.has(elements[i + 1].type)) {
      const next = elements[++i];
      taken++;
      const kind = next.type as "parenthetical" | "dialogue";
      for (const line of wrap(printable(next.text, notes), columns[kind])) {
        if (line !== "" || kind === "dialogue") body.push({ text: line, column: indent[kind] });
      }
    }
    return { cue, body, taken, lit: isHim(cueEl.text) };
  }

  /** Deux répliques côte à côte ; rend faux (sans rien poser) si elles ne tiennent pas sur une page. */
  function dual(left: ReturnType<typeof collect>, right: ReturnType<typeof collect>, half: number): boolean {
    const height = (r: typeof left) => r.cue.length + r.body.length;
    const rows = Math.max(height(left), height(right));
    if (rows > perPage) return false;
    const gap = used === 0 ? 0 : 1;
    if (used + gap + rows > perPage) newPage();
    else used += gap;
    const top = used;
    const place = (r: typeof left, cueColumn: number) => {
      const extra: Partial<TypesetLine> = r.lit ? { highlight: true } : {};
      [...r.cue.map((text) => ({ text, column: cueColumn })), ...r.body].forEach((line, k) => {
        page().lines.push({ row: top + k, column: line.column, text: line.text, ...extra });
      });
    };
    place(left, Math.max(0, Math.floor(half / 2) - 4));
    place(right, half + 2 + Math.max(0, Math.floor(half / 2) - 4));
    used = top + rows;
    return true;
  }

  /** Pose une réplique ; si elle dépasse la page, la coupe avec (À SUIVRE) et reprend le nom (SUITE). */
  function speech(cue: string[], body: { text: string; column: number }[], lit = false) {
    let name = cue;
    let rest = body;
    const mark: Partial<TypesetLine> = lit ? { highlight: true } : {};
    for (;;) {
      const gap = used === 0 ? 0 : 1;
      const room = perPage - used - gap;
      if (name.length + rest.length <= room) {
        used += gap;
        for (const line of name) put(line, layout.indent.character, false, false, mark);
        for (const line of rest) put(line.text, line.column, false, false, mark);
        return;
      }
      // Pas la place pour le nom, une ligne et (À SUIVRE) : toute la réplique passe à la page suivante.
      if (room < name.length + 2 && used > 0) {
        newPage();
        continue;
      }
      used += gap;
      for (const line of name) put(line, layout.indent.character, false, false, mark);
      const fits = Math.max(1, perPage - used - 1);
      for (const line of rest.slice(0, fits)) put(line.text, line.column, false, false, mark);
      if (breaks) put(strings.more, layout.indent.character);
      rest = rest.slice(fits);
      // Le nom revient en haut de la page suivante, avec (SUITE) s'il ne l'a pas déjà.
      const base = cue.join(" ");
      name = breaks && !hasContd(base, strings.contd) ? wrap(`${base} ${strings.contd}`, layout.columns.character) : cue;
      newPage();
    }
  }

  return pages;
}

/** Page de titre : titre, mention et auteur centrés ; contact et date en bas à gauche. */
export function typesetTitlePage(titlePage: Screenplay["titlePage"], layout: Layout): TypesetLine[] {
  const field = (...names: string[]) => {
    const key = Object.keys(titlePage).find((k) => names.includes(k.trim().toLowerCase()));
    return key ? printable(titlePage[key]) : "";
  };
  const width = layout.columns.action;
  const lines: TypesetLine[] = [];
  const centered = (text: string, row: number, bold = false) => {
    for (const line of wrap(text, width)) {
      const entry: TypesetLine = { row: row++, column: Math.floor((width - line.length) / 2), text: line };
      if (bold) entry.bold = true;
      lines.push(entry);
    }
    return row;
  };

  let row = Math.floor(layout.linesPerPage / 3);
  const title = field("title");
  if (title) row = centered(title, row, true) + 1;
  for (const text of [field("credit"), field("author", "authors"), field("source")]) {
    if (text) row = centered(text, row) + 1;
  }

  const bottom = [field("contact"), field("draft date"), field("copyright")].filter(Boolean).flatMap((text) => wrap(text, width));
  bottom.forEach((text, i) => lines.push({ row: layout.linesPerPage - bottom.length + i, column: 0, text }));
  return lines;
}
