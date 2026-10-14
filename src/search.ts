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

/** Texte lisible d'un corps de carte (HTML produit par l'éditeur, déjà nettoyé). */
export function plainText(html: string): string {
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

const EXCERPT = 90;

function excerptAround(text: string, at: number, length: number): string {
  if (text.length <= EXCERPT) return text;
  const start = Math.max(0, Math.min(at - 30, text.length - EXCERPT));
  const end = Math.min(text.length, Math.max(start + EXCERPT, at + length));
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
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
