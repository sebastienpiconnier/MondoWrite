// Dictionnaire de synonymes, hors ligne (#16). Fonctions pures : le mot sous le curseur, ses formes de base
// possibles, la recherche et la casse du remplaçant. Les données (src/assets/thesaurus/<langue>.json, fabriquées
// par scripts/thesaurus/build.mjs) sont chargées à la demande, une fois par session.

/** Un tableau par sens, du plus courant au plus rare. */
export type ThesaurusData = Record<string, string[][]>;

/** Langues pour lesquelles un dictionnaire est livré. */
export const THESAURUS_LANGS = ["en"] as const;
export type ThesaurusLang = (typeof THESAURUS_LANGS)[number];

export const hasThesaurus = (lang: string): lang is ThesaurusLang => (THESAURUS_LANGS as readonly string[]).includes(lang.split("-")[0]);

const LETTER = /[\p{L}\p{M}'’-]/u;

/** Bornes du mot qui contient `offset` dans `text` (le curseur peut être collé à ses bords), ou null. */
export function wordBounds(text: string, offset: number): { from: number; to: number } | null {
  let from = Math.min(Math.max(offset, 0), text.length);
  let to = from;
  while (from > 0 && LETTER.test(text[from - 1])) from--;
  while (to < text.length && LETTER.test(text[to])) to++;
  // Tirets et apostrophes de bord ne font pas partie du mot.
  while (from < to && /['’-]/.test(text[from])) from++;
  while (to > from && /['’-]/.test(text[to - 1])) to--;
  return from < to ? { from, to } : null;
}

/** Formes à chercher dans le dictionnaire, de la plus probable à la moins probable (anglais : pluriels, -ed, -ing…). */
export function candidates(word: string, lang: string): string[] {
  const w = word.toLowerCase().replace(/’/g, "'");
  const out = [w];
  if (lang.split("-")[0] === "en") {
    const add = (x: string) => x.length > 2 && out.push(x);
    if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
    if (w.endsWith("es")) add(w.slice(0, -2));
    if (w.endsWith("s")) add(w.slice(0, -1));
    if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
    if (w.endsWith("ed")) {
      add(w.slice(0, -2));
      add(w.slice(0, -1));
      if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));
    }
    if (w.endsWith("ing")) {
      add(w.slice(0, -3));
      add(w.slice(0, -3) + "e");
      if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));
    }
    if (w.endsWith("ly")) add(w.slice(0, -2));
    if (w.endsWith("er")) add(w.slice(0, -2));
    if (w.endsWith("est")) add(w.slice(0, -3));
  }
  return [...new Set(out)];
}

export interface Lookup {
  /** Forme trouvée dans le dictionnaire. */
  lemma: string;
  senses: string[][];
}

export function lookup(data: ThesaurusData, word: string, lang: string): Lookup | null {
  for (const c of candidates(word, lang)) {
    const senses = Object.prototype.hasOwnProperty.call(data, c) ? data[c] : undefined;
    if (senses?.length) return { lemma: c, senses };
  }
  return null;
}

/** Le remplaçant reprend la casse du mot : « Walk » → « Stroll », « WALK » → « STROLL », « walk » → « stroll ». */
export function matchCase(original: string, replacement: string): string {
  const letters = [...original].filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (letters.length > 1 && letters.every((c) => c === c.toUpperCase())) return replacement.toUpperCase();
  const first = original[0];
  if (first && first.toLowerCase() !== first.toUpperCase() && first === first.toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

const loaded = new Map<string, Promise<ThesaurusData>>();

/** Charge le dictionnaire d'une langue (une fois par session). Rejette si la langue n'en a pas. */
export function loadThesaurus(lang: string): Promise<ThesaurusData> {
  const key = lang.split("-")[0];
  if (!hasThesaurus(key)) return Promise.reject(new Error("no-thesaurus"));
  let p = loaded.get(key);
  if (!p) {
    p = import("./assets/thesaurus/en.json").then((m) => m.default as ThesaurusData);
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}
