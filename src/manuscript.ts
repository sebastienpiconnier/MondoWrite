// Manuscrit d'un roman : un texte par scène, dans l'ordre du Plan. Fonctions pures.
// Sur disque : manuscrit/<id de la carte Scène>.md, du Markdown sans en-tête (le titre reste celui de la carte).

import type { CardData } from "./types";
import { plainText } from "./search";

/** Texte de chaque scène, en HTML (format de travail de l'éditeur), par identifiant de carte. */
export type Manuscript = Record<string, string>;

export const isBlank = (html: string | undefined) => !html || plainText(html) === "";

/** Nombre de mots d'un texte (HTML de l'éditeur). Les apostrophes et traits d'union ne coupent pas un mot. */
export function countWords(html: string | undefined): number {
  if (!html) return 0;
  return plainText(html).match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export const totalWords = (manuscript: Manuscript, ids: string[]) => ids.reduce((sum, id) => sum + countWords(manuscript[id]), 0);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Articles qu'on ne prend jamais pour un prénom (titre « The Mother », « Les Thénardier »…). */
const ARTICLES = new Set(["the", "les", "une", "des", "aux", "der", "die", "das", "los", "las", "una", "uno", "gli"]);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Un trait d'union lie deux mots en un seul : « la mère » n'est pas citée dans « la mère-grand ».
const hasWord = (text: string, word: string) => new RegExp(`(?<![\\p{L}\\p{N}]-?)${escape(word)}(?!-?[\\p{L}\\p{N}])`, "u").test(text);

/**
 * Personnages et lieux cités dans le texte d'une scène : par leur titre entier, ou, pour un personnage,
 * par son prénom (premier mot du titre, s'il fait au moins trois lettres). Sans casse ni accents.
 */
export function detectCards(html: string | undefined, cards: CardData[]): CardData[] {
  const text = fold(html ? plainText(html) : "");
  if (!text) return [];
  return cards.filter((card) => (card.type === "personnage" || card.type === "lieu") && namesOf(card).some((name) => hasWord(text, name)));
}

/** Les façons dont le texte peut nommer une carte : titre entier, prénom, surnoms (personnage). Repliées. */
export function namesOf(card: CardData): string[] {
  const title = fold(card.title).trim();
  if (!title) return [];
  const names = [title];
  if (card.type === "personnage") {
    const first = title.split(/\s+/)[0];
    // Le prénom seul (« Inès » pour « Inès Morvan »), jamais un article : « The Wolf » serait cité à chaque « the ».
    if (first.length >= 3 && first !== title && !ARTICLES.has(first)) names.push(first);
    for (const nick of (card.fiche?.surnoms ?? "").split(/[,;]/)) if (nick.trim().length >= 2) names.push(fold(nick).trim());
  }
  return [...new Set(names)];
}

/**
 * Présence d'une carte dans le manuscrit (idée reprise de la Bible du fork de NEO) : nombre de fois où le
 * texte la nomme, et première scène où elle apparaît, dans l'ordre du récit.
 */
export function mentionsIn(card: CardData, manuscript: Manuscript, order: string[]): { count: number; first: string | null } {
  const names = namesOf(card);
  if (names.length === 0) return { count: 0, first: null };
  // Le nom le plus long d'abord : « Inès Morvan » ne compte pas aussi pour « Inès ».
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  let count = 0;
  let first: string | null = null;
  for (const id of order) {
    const n = fold(plainText(manuscript[id] ?? "")).match(re)?.length ?? 0;
    if (n > 0 && first === null) first = id;
    count += n;
  }
  return { count, first };
}

/** Textes dont la carte Scène n'existe plus : ils restent dans le projet, jamais effacés par l'app. */
export function orphanTexts(manuscript: Manuscript, sceneIds: string[]): string[] {
  const scenes = new Set(sceneIds);
  return Object.keys(manuscript).filter((id) => !scenes.has(id) && !isBlank(manuscript[id]));
}
