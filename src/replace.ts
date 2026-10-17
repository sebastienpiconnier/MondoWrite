// Rechercher et remplacer dans les textes du projet (manuscrit, scénario, corps des cartes), et renommer un
// personnage partout. Fonctions pures : on ne touche qu'au texte, jamais aux balises, ni aux mentions
// (`@Titre`, qui suivent déjà le titre de leur carte).

import type { Screenplay, ScreenplayElement } from "./screenplay/model";
import { isEditableType } from "./screenplay/editor/nodes";
import { headingOf, sceneEnd } from "./screenplay/sceneText";
import type { CardNode } from "./projectState";

export interface ReplaceOptions {
  /** Respecter la casse (sinon « loup » trouve aussi « Loup » et « LOUP »). */
  matchCase?: boolean;
  /** Mot entier : « Loup » ne trouve pas « Louve ». */
  wholeWord?: boolean;
  /**
   * Un nom propre (« Renommer partout ») : seulement tel qu'il est écrit ou tout en capitales (personnage d'un
   * scénario). « Will » ne trouve jamais « will », « Rose » jamais « rose ».
   */
  nameCase?: boolean;
}

/** Casse d'un remplacement : respectée (true), suivie (false), ou celle d'un nom propre (le nom cherché). */
export type CaseMode = boolean | { name: string };

export const caseMode = (opts: ReplaceOptions & { find: string }): CaseMode => (opts.nameCase ? { name: opts.find } : !!opts.matchCase);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Expression de recherche, ou null si rien n'est cherché. */
export function finder(find: string, opts: ReplaceOptions = {}): RegExp | null {
  if (!find) return null;
  // Un nom à article (« The Wolf », « Le Loup ») s'écrit aussi « said the Wolf », « dit le Loup ».
  const article = /\s/.test(find) && /\p{Lu}/u.test(find.slice(1)) ? find[0].toLowerCase() + find.slice(1) : find;
  const forms = opts.nameCase ? [...new Set([find, find.toUpperCase(), article])] : [find];
  const body = forms.length > 1 ? `(?:${forms.map(escape).join("|")})` : escape(find);
  // Un trait d'union lie deux mots (« Mère-grand »), comme pour les cartes citées dans le texte.
  const source = opts.wholeWord ? `(?<![\\p{L}\\p{N}]-?)${body}(?!-?[\\p{L}\\p{N}])` : body;
  return new RegExp(source, `gu${opts.matchCase || opts.nameCase ? "" : "i"}`);
}

/**
 * Le remplaçant garde la forme de ce qu'il remplace quand on ne respecte pas la casse : tout en capitales
 * (personnage d'un scénario, « LE LOUP ») ou une capitale initiale (début de phrase).
 */
export function keepCase(found: string, replacement: string, matchCase: CaseMode = false): string {
  if (matchCase === true || !replacement) return replacement;
  const letters = found.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return replacement.toUpperCase();
  const first = found.match(/\p{L}/u)?.[0];
  // Un nom propre s'écrit comme l'auteur l'a tapé (« de Villiers » reste ainsi en tête de phrase).
  if (typeof matchCase === "object") {
    // « the Wolf » (pour « The Wolf ») devient « the Ogre » : l'article garde sa minuscule dans la phrase.
    const typed = matchCase.name.match(/\p{L}/u)?.[0];
    const lowered = first && typed && first !== typed && first === first.toLowerCase();
    return lowered ? replacement[0].toLowerCase() + replacement.slice(1) : replacement;
  }
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Garde-t-on la k-ième occurrence d'un texte ? (Toutes, faute de choix.) */
export type Accept = (k: number) => boolean;

/** Remplace dans un texte simple. `seen` : occurrences trouvées, gardées ou non. */
export function replaceInText(
  text: string,
  re: RegExp,
  replacement: string,
  matchCase: CaseMode = false,
  accept?: Accept,
): { text: string; count: number; seen: number } {
  let count = 0;
  let seen = 0;
  const next = text.replace(re, (found) => {
    if (accept && !accept(seen++)) return found;
    if (!accept) seen++;
    count++;
    return keepCase(found, replacement, matchCase);
  });
  return count > 0 ? { text: next, count, seen } : { text, count: 0, seen };
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");

/**
 * Remplace dans le HTML d'un éditeur : seulement dans le texte, hors des mentions. Un mot coupé par une
 * mise en forme (« <strong>In</strong>ès ») n'est pas trouvé. Même chaîne si rien ne change.
 */
export function replaceInHtml(html: string, re: RegExp, replacement: string, matchCase: CaseMode = false, accept?: Accept): { html: string; count: number } {
  if (!html) return { html, count: 0 };
  let count = 0;
  let seen = 0;
  let inMention = false;
  const parts = html.split(/(<[^>]*>)/);
  const out = parts.map((part) => {
    if (part.startsWith("<")) {
      if (/^<span\b[^>]*\bdata-mention=/i.test(part)) inMention = true;
      else if (inMention && /^<\/span>/i.test(part)) inMention = false;
      return part;
    }
    if (inMention || !part) return part;
    const base = seen;
    const done = replaceInText(decode(part), re, replacement, matchCase, accept && ((k) => accept(base + k)));
    seen += done.seen;
    if (done.count === 0) return part;
    count += done.count;
    return encode(done.text);
  });
  return count > 0 ? { html: out.join(""), count } : { html, count: 0 };
}

/** Occurrences dans un HTML d'éditeur (mêmes règles que le remplacement). */
export const countInHtml = (html: string, re: RegExp) => replaceInHtml(html, re, "x").count;

/**
 * Remplace dans les éléments d'un scénario, de `from` à `to` (exclu) : tous les éléments éditables, en-têtes
 * compris (le titre de la carte suit l'en-tête). Les éléments conservés (notes, sections…) ne changent pas.
 * Même tableau si rien ne change.
 */
export function replaceInElements(
  elements: ScreenplayElement[],
  re: RegExp,
  replacement: string,
  matchCase: CaseMode = false,
  from = 0,
  to = elements.length,
  accept?: (i: number, k: number) => boolean,
): { elements: ScreenplayElement[]; count: number } {
  let count = 0;
  const next = elements.map((el, i) => {
    if (i < from || i >= to || !isEditableType(el.type)) return el;
    const done = replaceInText(el.text, re, replacement, matchCase, accept && ((k) => accept(i, k)));
    if (done.count === 0) return el;
    count += done.count;
    return { ...el, text: done.text };
  });
  return count > 0 ? { elements: next, count } : { elements, count: 0 };
}

// ---------- Dans le projet ----------

export interface ReplaceInit {
  find: string;
  /** Scène en cours (vue Manuscrit ou Scénario) : « Cette scène » est alors proposé. */
  sceneId: string | null;
  /** Carte à renommer partout (menu de la carte) : son titre change avec le texte. */
  renameId: string | null;
}

export interface ReplaceRequest extends ReplaceOptions {
  find: string;
  replacement: string;
  /** Une scène (son texte) ou tout le projet. */
  sceneId?: string | null;
  /** Aussi le corps des cartes (notes, fiches de la Bible). Tout le projet seulement. */
  cards?: boolean;
  renameId?: string | null;
  /** Occurrences laissées telles quelles (clés de `findOccurrences`), décochées par l'auteur. */
  skip?: string[];
}

/** Ce que « Annuler » remet : textes d'avant, par scène et par carte. */
export interface ReplaceSnapshot {
  manuscript: Record<string, string>;
  screenplay?: Screenplay | null;
  html: Record<string, string>;
  title?: { id: string; title: string };
}

interface ReplaceState {
  kind: "roman" | "scenario";
  manuscript: Record<string, string>;
  screenplay: Screenplay | null;
  nodes: CardNode[];
}

/** Le projet après remplacement (mêmes objets là où rien ne change), et le nombre de remplacements. */
export function applyReplace(state: ReplaceState, req: ReplaceRequest): ReplaceState & { count: number } {
  const re = finder(req.find, req);
  if (!re) return { ...state, count: 0 };
  const matchCase = caseMode(req);
  const skip = req.skip?.length ? new Set(req.skip) : null;
  const accept = (loc: string): Accept | undefined => (skip ? (k) => !skip.has(`${loc}#${k}`) : undefined);
  let count = 0;
  // Manuscrit d'un roman : la scène choisie, ou toutes.
  let manuscript = state.manuscript;
  if (state.kind !== "scenario") {
    for (const id of req.sceneId ? [req.sceneId] : Object.keys(state.manuscript)) {
      const html = state.manuscript[id];
      if (!html) continue;
      const done = replaceInHtml(html, re, req.replacement, matchCase, accept(`m:${id}`));
      if (done.count === 0) continue;
      if (manuscript === state.manuscript) manuscript = { ...state.manuscript };
      manuscript[id] = done.html;
      count += done.count;
    }
  }
  // Scénario : la scène choisie (de son en-tête à la suivante), ou tout le texte.
  let screenplay = state.screenplay;
  if (state.kind === "scenario" && screenplay) {
    let from = 0;
    let to = screenplay.elements.length;
    if (req.sceneId) {
      from = headingOf(screenplay.elements, req.sceneId);
      to = from < 0 ? from : sceneEnd(screenplay.elements, from);
    }
    const done = replaceInElements(screenplay.elements, re, req.replacement, matchCase, from, to, skip ? (i, k) => !skip.has(`s:${i}#${k}`) : undefined);
    if (done.count > 0) {
      screenplay = { ...screenplay, elements: done.elements };
      count += done.count;
    }
  }
  // Corps des cartes : seulement pour tout le projet.
  let nodes = state.nodes;
  if (req.cards && !req.sceneId) {
    nodes = state.nodes.map((n) => {
      const done = replaceInHtml(n.data.html, re, req.replacement, matchCase, accept(`c:${n.id}`));
      if (done.count === 0) return n;
      count += done.count;
      return { ...n, data: { ...n.data, html: done.html } };
    });
    if (nodes.every((n, i) => n === state.nodes[i])) nodes = state.nodes;
  }
  return { ...state, manuscript, screenplay, nodes, count };
}

// ---------- Revue des occurrences ----------

export interface Occurrence {
  /** Clé stable tant que le texte ne change pas : lieu (`m:<scène>`, `s:<élément>`, `c:<carte>`) et rang. */
  key: string;
  /** Scène ou carte où se trouve l'occurrence (titre de la carte, ou en-tête de la scène du scénario). */
  label: string;
  before: string;
  match: string;
  after: string;
  /**
   * En tête de phrase ou de paragraphe : un mot ordinaire y prend aussi une capitale (« Will you come? »,
   * « Rose, la nuit tombait »). C'est là qu'un renommage peut se tromper.
   */
  sentenceStart: boolean;
}

const CONTEXT = 40;
const BLOCK_TAG = /^<(?:p|li|h[1-6]|blockquote|div|br|td|th)\b/i;

function contextOf(text: string, index: number, found: string, blockStart: boolean) {
  // Coupé à un espace : jamais un bout de mot au bord du contexte.
  let before = text.slice(Math.max(0, index - CONTEXT), index);
  if (index > CONTEXT) before = before.replace(/^\S*\s/u, "");
  let after = text.slice(index + found.length, index + found.length + CONTEXT);
  if (index + found.length + CONTEXT < text.length) after = after.replace(/\s\S*$/u, "");
  const head = text.slice(0, index).replace(/[\s«“"'‘(\u2014\u2013-]+$/u, "");
  const sentenceStart = head === "" ? blockStart : /[.!?…:]["»”’)]*$/u.test(head);
  return { before: (index > CONTEXT ? "…" : "") + before, after: after + (index + found.length + CONTEXT < text.length ? "…" : ""), sentenceStart };
}

function isCapitals(s: string) {
  const letters = s.replace(/[^\p{L}]/gu, "");
  return letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

function htmlOccurrences(html: string, re: RegExp, loc: string, label: string, out: Occurrence[]) {
  let inMention = false;
  let blockStart = true;
  let k = 0;
  for (const part of html.split(/(<[^>]*>)/)) {
    if (part.startsWith("<")) {
      if (/^<span\b[^>]*\bdata-mention=/i.test(part)) inMention = true;
      else if (inMention && /^<\/span>/i.test(part)) inMention = false;
      if (BLOCK_TAG.test(part) || /^<\/(?:p|li|h[1-6]|blockquote|div)>/i.test(part)) blockStart = true;
      continue;
    }
    if (!part) continue;
    if (inMention) {
      blockStart = false;
      continue;
    }
    const text = decode(part);
    for (const m of text.matchAll(re)) {
      const ctx = contextOf(text, m.index!, m[0], blockStart);
      out.push({ key: `${loc}#${k++}`, label, match: m[0], ...ctx });
    }
    if (text.trim()) blockStart = false;
  }
}

/** Toutes les occurrences, dans l'ordre du texte, avec ce qui les entoure : de quoi décider une à une. */
export function findOccurrences(state: ReplaceState, req: ReplaceRequest): Occurrence[] {
  const re = finder(req.find, req);
  if (!re) return [];
  const out: Occurrence[] = [];
  const title = (id: string) => state.nodes.find((n) => n.id === id)?.data.title ?? "";
  if (state.kind !== "scenario") {
    for (const id of req.sceneId ? [req.sceneId] : Object.keys(state.manuscript)) {
      if (state.manuscript[id]) htmlOccurrences(state.manuscript[id], re, `m:${id}`, title(id), out);
    }
  }
  if (state.kind === "scenario" && state.screenplay) {
    const els = state.screenplay.elements;
    let from = 0;
    let to = els.length;
    if (req.sceneId) {
      from = headingOf(els, req.sceneId);
      to = from < 0 ? from : sceneEnd(els, from);
    }
    let heading = "";
    els.forEach((el, i) => {
      if (el.type === "sceneHeading") heading = el.text;
      if (i < from || i >= to || !isEditableType(el.type)) return;
      let k = 0;
      for (const m of el.text.matchAll(re)) {
        const ctx = contextOf(el.text, m.index!, m[0], true);
        // Un nom en capitales (réplique, première apparition) n'est jamais un mot ordinaire.
        const sentenceStart = ctx.sentenceStart && el.type !== "character" && el.type !== "sceneHeading" && !isCapitals(m[0]);
        out.push({ key: `s:${i}#${k++}`, label: heading, match: m[0], ...ctx, sentenceStart });
      }
    });
  }
  if (req.cards && !req.sceneId) {
    for (const n of state.nodes) if (n.data.html) htmlOccurrences(n.data.html, re, `c:${n.id}`, n.data.title, out);
  }
  return out;
}

/**
 * Le nom est-il aussi un mot ordinaire de ce texte ? « Will », « Rose », « Hope », « Pierre » : vrai dès que
 * le mot paraît en minuscules quelque part dans le projet. Alors une occurrence en tête de phrase peut être
 * le mot, pas le nom.
 */
export function isAlsoAWord(state: ReplaceState, name: string): boolean {
  const lower = name.toLowerCase();
  if (!name || lower === name) return false;
  return applyReplace(state, { find: lower, replacement: lower, matchCase: true, wholeWord: true, cards: true }).count > 0;
}
