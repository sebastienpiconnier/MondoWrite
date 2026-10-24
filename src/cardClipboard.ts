// Copier-coller de cartes sur le canevas (Cmd/Ctrl + C puis V, « Copier » et « Dupliquer » du menu ⋯).
// La copie garde tout ce qui fait la carte : type, titre, notes, fiche, images, largeur, texte de la scène,
// et les fils entre les cartes copiées. Le presse-papiers du système reçoit aussi un texte lisible (titre puis
// texte) pour un collage dans une autre app. Fonctions pures : le store fournit les identifiants neufs.

import type { CardData, Link } from "./types";
import type { ScreenplayElement } from "./screenplay/model";
import { plainText } from "./search";

export interface CopiedCard {
  data: CardData;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Roman : texte de la scène (manuscrit). */
  text?: string;
  /** Scénario : synopsis et corps de la scène. */
  synopsis?: string;
  body?: ScreenplayElement[];
}

export interface CardCopy {
  cards: CopiedCard[];
  links: { source: string; target: string; label?: string }[];
  /** Texte mis dans le presse-papiers du système : le collage le reconnaît. */
  text: string;
}

/** Texte lisible des cartes copiées : titre, puis notes ou texte de la scène, une carte par bloc. */
export function copyText(cards: CopiedCard[]): string {
  return cards
    .map((c) => {
      const body = plainText(c.text || c.data.html || "") || c.data.fiche?.synopsis || c.synopsis || "";
      return [c.data.title.trim(), body.trim()].filter(Boolean).join("\n\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Fils dont les deux bouts sont copiés. */
export function linksWithin(links: Link[], ids: Set<string>): CardCopy["links"] {
  return links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ source: l.source, target: l.target, ...(l.label ? { label: l.label } : {}) }));
}

/** Le texte collé est-il celui de la dernière copie de cartes ? (fins de ligne et espaces ignorés) */
export const isCardCopy = (copy: CardCopy | null, pasted: string): copy is CardCopy =>
  !!copy && copy.cards.length > 0 && norm(pasted) === norm(copy.text);
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Rectangle qui contient toutes les cartes copiées. */
export function copyBounds(cards: CopiedCard[], fallback = { width: 240, height: 150 }) {
  const xs = cards.map((c) => c.x);
  const ys = cards.map((c) => c.y);
  const right = cards.map((c) => c.x + (c.width ?? fallback.width));
  const bottom = cards.map((c) => c.y + (c.height ?? fallback.height));
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...right) - x, height: Math.max(...bottom) - y };
}

/**
 * Cartes et fils à créer pour un collage : identifiants neufs (`newId`), positions décalées du coin du groupe
 * (`origin`) en gardant leur disposition. Les fils reprennent leurs étiquettes entre les nouvelles cartes.
 */
export function pasteCopy(copy: CardCopy, origin: { x: number; y: number }, newId: () => string) {
  const bounds = copyBounds(copy.cards);
  const ids = new Map(copy.cards.map((c) => [c.data.id, newId()]));
  const cards = copy.cards.map((c) => ({
    ...c,
    data: { ...c.data, id: ids.get(c.data.id)! },
    x: origin.x + (c.x - bounds.x),
    y: origin.y + (c.y - bounds.y),
  }));
  const links = copy.links.map((l) => ({ ...l, source: ids.get(l.source)!, target: ids.get(l.target)! }));
  return { cards, links, ids };
}
