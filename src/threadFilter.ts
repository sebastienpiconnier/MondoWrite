// Lire le récit fil par fil (#117) : ne garder, dans le Manuscrit ou le Scénario, que les scènes d'une carte
// (intrigue, thème, lieu, objet, personnage…). Une scène est gardée si un fil la relie à la carte (ou si le
// personnage la raconte) ; avec « aussi celles qui la citent », si son texte la nomme. Entre deux scènes gardées,
// la vue dit l'écart. Affichage seulement : rien n'est écrit. Fonctions pures.

import type { CardData, CardType, Link } from "./types";
import { citedCards, type Manuscript } from "./manuscript";
import { mentionedIds } from "./mentions";

/** Ce que la vue retient : la carte suivie, et si les scènes qui la nomment seulement comptent aussi. */
export interface ThreadFilter {
  id: string;
  cited: boolean;
}

/** Cartes qu'on peut suivre dans le récit : tout ce qui se relie à des scènes, sauf les scènes elles-mêmes. */
export const THREAD_TYPES: CardType[] = ["intrigue", "theme", "personnage", "lieu", "objet", "groupe", "secret", "evenement", "regle"];

export const canFollow = (type: CardType) => THREAD_TYPES.includes(type);

export type ThreadPresence = "linked" | "cited";

/**
 * Pour chaque scène de `order`, comment la carte y paraît : « linked » (fil, ou narrateur de la scène), « cited »
 * (mention @, ou nom d'un personnage, d'un lieu ou d'un objet dans les notes de la scène ou dans son texte, comme
 * « Cités dans le texte »), rien sinon.
 */
export function threadPresence(
  cardId: string,
  cards: CardData[],
  links: Pick<Link, "source" | "target">[],
  texts: Manuscript,
  order: string[],
): Map<string, ThreadPresence> {
  const out = new Map<string, ThreadPresence>();
  const card = cards.find((c) => c.id === cardId);
  if (!card) return out;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const wired = new Set<string>();
  for (const l of links) {
    if (l.source === cardId) wired.add(l.target);
    else if (l.target === cardId) wired.add(l.source);
  }
  for (const id of order) {
    const scene = byId.get(id);
    if (wired.has(id) || (card.type === "personnage" && scene?.fiche?.pov === cardId)) {
      out.set(id, "linked");
      continue;
    }
    const named =
      mentionedIds(scene?.html ?? "").includes(cardId) ||
      mentionedIds(texts[id] ?? "").includes(cardId) ||
      citedCards(scene?.html, cards).some((c) => c.id === cardId) ||
      citedCards(texts[id], cards).some((c) => c.id === cardId);
    if (named) out.set(id, "cited");
  }
  return out;
}

/** Scènes gardées par le filtre, dans l'ordre du récit. */
export function keptByThread(presence: Map<string, ThreadPresence>, order: string[], cited: boolean): string[] {
  return order.filter((id) => {
    const p = presence.get(id);
    return p === "linked" || (cited && p === "cited");
  });
}

/** Écart avant une scène gardée : scènes sautées depuis la précédente gardée (ou le début), et leur longueur. */
export interface ThreadGap {
  scenes: number;
  size: number;
}

/**
 * Écart avant chaque scène gardée qui suit des scènes sautées. `size` donne la longueur d'une scène, dans l'unité
 * de la vue (pages, ou mots à convertir) ; une scène inconnue compte pour 0.
 */
export function threadGaps(order: string[], kept: ReadonlySet<string>, size: (id: string) => number): Map<string, ThreadGap> {
  const out = new Map<string, ThreadGap>();
  let scenes = 0;
  let total = 0;
  for (const id of order) {
    if (kept.has(id)) {
      if (scenes > 0) out.set(id, { scenes, size: total });
      scenes = 0;
      total = 0;
    } else {
      scenes += 1;
      total += size(id) || 0;
    }
  }
  return out;
}
