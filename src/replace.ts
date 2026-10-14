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
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Expression de recherche, ou null si rien n'est cherché. */
export function finder(find: string, opts: ReplaceOptions = {}): RegExp | null {
  if (!find) return null;
  const body = escape(find);
  // Un trait d'union lie deux mots (« Mère-grand »), comme pour les cartes citées dans le texte.
  const source = opts.wholeWord ? `(?<![\\p{L}\\p{N}]-?)${body}(?!-?[\\p{L}\\p{N}])` : body;
  return new RegExp(source, `gu${opts.matchCase ? "" : "i"}`);
}

/**
 * Le remplaçant garde la forme de ce qu'il remplace quand on ne respecte pas la casse : tout en capitales
 * (personnage d'un scénario, « LE LOUP ») ou une capitale initiale (début de phrase).
 */
export function keepCase(found: string, replacement: string, matchCase = false): string {
  if (matchCase || !replacement) return replacement;
  const letters = found.replace(/[^\p{L}]/gu, "");
  if (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return replacement.toUpperCase();
  const first = found.match(/\p{L}/u)?.[0];
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Remplace dans un texte simple. */
export function replaceInText(text: string, re: RegExp, replacement: string, matchCase = false): { text: string; count: number } {
  let count = 0;
  const next = text.replace(re, (found) => {
    count++;
    return keepCase(found, replacement, matchCase);
  });
  return count > 0 ? { text: next, count } : { text, count: 0 };
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const encode = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");

/**
 * Remplace dans le HTML d'un éditeur : seulement dans le texte, hors des mentions. Un mot coupé par une
 * mise en forme (« <strong>In</strong>ès ») n'est pas trouvé. Même chaîne si rien ne change.
 */
export function replaceInHtml(html: string, re: RegExp, replacement: string, matchCase = false): { html: string; count: number } {
  if (!html) return { html, count: 0 };
  let count = 0;
  let inMention = false;
  const parts = html.split(/(<[^>]*>)/);
  const out = parts.map((part) => {
    if (part.startsWith("<")) {
      if (/^<span\b[^>]*\bdata-mention=/i.test(part)) inMention = true;
      else if (inMention && /^<\/span>/i.test(part)) inMention = false;
      return part;
    }
    if (inMention || !part) return part;
    const done = replaceInText(decode(part), re, replacement, matchCase);
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
  matchCase = false,
  from = 0,
  to = elements.length,
): { elements: ScreenplayElement[]; count: number } {
  let count = 0;
  const next = elements.map((el, i) => {
    if (i < from || i >= to || !isEditableType(el.type)) return el;
    const done = replaceInText(el.text, re, replacement, matchCase);
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
  const matchCase = !!req.matchCase;
  let count = 0;
  // Manuscrit d'un roman : la scène choisie, ou toutes.
  let manuscript = state.manuscript;
  if (state.kind !== "scenario") {
    for (const id of req.sceneId ? [req.sceneId] : Object.keys(state.manuscript)) {
      const html = state.manuscript[id];
      if (!html) continue;
      const done = replaceInHtml(html, re, req.replacement, matchCase);
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
    const done = replaceInElements(screenplay.elements, re, req.replacement, matchCase, from, to);
    if (done.count > 0) {
      screenplay = { ...screenplay, elements: done.elements };
      count += done.count;
    }
  }
  // Corps des cartes : seulement pour tout le projet.
  let nodes = state.nodes;
  if (req.cards && !req.sceneId) {
    nodes = state.nodes.map((n) => {
      const done = replaceInHtml(n.data.html, re, req.replacement, matchCase);
      if (done.count === 0) return n;
      count += done.count;
      return { ...n, data: { ...n.data, html: done.html } };
    });
    if (nodes.every((n, i) => n === state.nodes[i])) nodes = state.nodes;
  }
  return { ...state, manuscript, screenplay, nodes, count };
}
