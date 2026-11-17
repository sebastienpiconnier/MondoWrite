// Recherche dans les cartes du projet : titre et texte, sans tenir compte de la casse ni des accents.
// Fonction pure : la vue affiche les résultats et montre la carte choisie sur le canevas.

import type { CardData, CardType } from "./types";

export interface SearchResult {
  id: string;
  type: CardType;
  title: string;
  /** Extrait du texte autour de ce qui a été trouvé (ou début du texte si c'est le titre qui correspond). */
  excerpt: string;
  /** Trouvé dans le texte de la scène (manuscrit ou scénario), pas sur la carte : on ouvre ce texte. */
  inText?: boolean;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Le même HTML est lu plusieurs fois par frappe (mots, progression, statistiques, relecture) : les derniers
// résultats sont gardés. Un long texte coûte plusieurs millisecondes à épurer.
const plainCache = new Map<string, string>();
const PLAIN_CACHE_MAX = 64;
const PLAIN_CACHE_MIN_LENGTH = 400;

/** Texte lisible d'un corps de carte (HTML produit par l'éditeur, déjà nettoyé). */
export function plainText(html: string): string {
  if (html.length < PLAIN_CACHE_MIN_LENGTH) return computePlainText(html);
  const known = plainCache.get(html);
  if (known !== undefined) return known;
  const text = computePlainText(html);
  if (plainCache.size >= PLAIN_CACHE_MAX) plainCache.delete(plainCache.keys().next().value as string);
  plainCache.set(html, text);
  return text;
}

function computePlainText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Texte replié caractère par caractère, sans changer sa longueur : une position du texte replié est celle du texte
 * d'origine (le `fold` ordinaire allonge le texte en NFD). Les espaces, insécables comprises, deviennent des espaces.
 */
export function foldSameLength(s: string): string {
  let out = "";
  for (const c of s.split("")) {
    if (/\s/.test(c)) {
      out += " ";
      continue;
    }
    const f = fold(c);
    out += f.length === 1 ? f : c;
  }
  return out;
}

/**
 * Où la recherche par les mots a trouvé `query` dans `text` (#85) : la saisie entière, sinon le
 * premier de ses mots que le texte contient. Sans casse ni accents, comme `searchCards` ; position et longueur dans
 * le texte d'origine, pour que la vue d'écriture sélectionne ce qui a été trouvé. `wholeOnly` : la saisie entière seulement.
 */
export function findInText(text: string, query: string, wholeOnly = false): { at: number; length: number } | null {
  const whole = foldSameLength(query.trim()).replace(/ +/g, " ");
  if (!whole) return null;
  const hay = foldSameLength(text);
  const words = whole.split(" ").filter(Boolean);
  for (const needle of words.length > 1 && !wholeOnly ? [whole, ...words] : [whole]) {
    const at = hay.indexOf(needle);
    if (at >= 0) return { at, length: needle.length };
  }
  return null;
}

const EXCERPT = 90;

function excerptAround(text: string, at: number, length: number): string {
  if (text.length <= EXCERPT) return text;
  const start = Math.max(0, Math.min(at - 30, text.length - EXCERPT));
  const end = Math.min(text.length, Math.max(start + EXCERPT, at + length));
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** Saisie repliée comme le texte (`foldSameLength`), espaces réduites : ce que cherchent les vues d'écriture. */
const foldQuery = (query: string) => foldSameLength(query.trim()).replace(/ +/g, " ");

/** Débuts de chaque occurrence de la saisie entière dans `text`, sans casse ni accents, sans chevauchement. */
export function matchesIn(text: string, query: string): number[] {
  const needle = foldQuery(query);
  if (!needle) return [];
  const hay = foldSameLength(text);
  const out: number[] = [];
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) out.push(at);
  return out;
}

/** Une scène où chercher dans les vues d'écriture : où aller, son titre, ses paragraphes (ou éléments) dans l'ordre. */
export interface TextUnit {
  target: string;
  title: string;
  texts: string[];
  /** Le titre d'un chapitre (on y va par sa première scène, sans sélection : il est dans la marge de la page). */
  kind?: "chapter";
  /** Où se trouve la scène (« Chapitre 2 · Le bois »), montré à côté de son titre. */
  context?: string;
}

/** Un passage trouvé : la scène, l'extrait autour du mot et son rang dans la scène (pour y aller, `nthMatch`). */
export interface Passage {
  target: string;
  title: string;
  excerpt: string;
  nth: number;
  kind?: "chapter";
  context?: string;
}

/**
 * Recherche des vues Manuscrit et Scénario (#85) : chaque occurrence de la saisie entière, dans l'ordre du livre,
 * un résultat par passage (au plus `limit`). Les paragraphes sont ceux que l'éditeur affiche, comptés de la même
 * façon que `nthMatch` les retrouve.
 */
export function findPassages(units: TextUnit[], query: string, limit = 50): Passage[] {
  const length = foldQuery(query).length;
  if (!length) return [];
  const out: Passage[] = [];
  for (const unit of units) {
    let nth = 0;
    for (const text of unit.texts) {
      for (const at of matchesIn(text, query)) {
        out.push({
          target: unit.target,
          title: unit.title,
          excerpt: excerptAround(text, at, length),
          nth: nth++,
          ...(unit.kind ? { kind: unit.kind } : {}),
          ...(unit.context ? { context: unit.context } : {}),
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

/** La `nth` occurrence de la saisie dans ces textes : rang du texte, position et longueur ; null si elle n'y est plus. */
export function nthMatch(texts: string[], query: string, nth: number): { index: number; at: number; length: number } | null {
  const length = foldQuery(query).length;
  if (!length || nth < 0) return null;
  let seen = 0;
  for (let index = 0; index < texts.length; index++) {
    for (const at of matchesIn(texts[index], query)) {
      if (seen++ === nth) return { index, at, length };
    }
  }
  return null;
}


/**
 * Cartes qui contiennent tous les mots cherchés. Celles dont le titre correspond passent devant,
 * puis par ordre alphabétique.
 */
export function searchCards(cards: CardData[], query: string, locale: string, limit = 20, texts: Record<string, string> = {}): SearchResult[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const found: (SearchResult & { rank: number })[] = [];
  for (const card of cards) {
    const own = plainText(card.html);
    // Texte d'une scène (déjà en texte simple) : cherché comme le corps de la carte.
    const extra = texts[card.id] ?? "";
    const title = fold(card.title);
    const ownFolded = fold(own);
    const inOwn = words.every((word) => title.includes(word) || ownFolded.includes(word));
    const text = inOwn || !extra ? own : extra;
    const body = fold(text);
    if (!words.every((word) => title.includes(word) || body.includes(word))) continue;
    const inTitle = words.every((word) => title.includes(word));
    // NFD peut allonger le texte replié : on cherche la position dans le texte d'origine, à défaut au début.
    const at = Math.max(0, fold(text).indexOf(words.find((word) => body.includes(word)) ?? ""));
    found.push({
      id: card.id,
      type: card.type,
      title: card.title,
      excerpt: excerptAround(text, Math.min(at, text.length), words[0].length),
      rank: inTitle ? (title.startsWith(words[0]) ? 0 : 1) : 2,
      ...(text === extra && extra && !inTitle ? { inText: true } : {}),
    });
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title, locale))
    .slice(0, limit)
    .map(({ rank: _rank, ...result }) => result);
}
