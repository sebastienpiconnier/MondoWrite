// Chronologie par intrigue : pour chaque intrigue (carte Intrigue), thème, personnage et lieu, les scènes où il
// apparaît, dans l'ordre du Plan. Fonction pure, sans donnée propre : une case est remplie quand la carte
// est reliée à la scène par un fil, ou citée dans la scène (mention @, notes de la carte, texte du manuscrit).

import type { CardData, CardType, Link } from "./types";
import { detectCards, type Manuscript } from "./manuscript";
import { mentionedIds } from "./mentions";
import type { ScreenplayElement } from "./screenplay/model";
import { characterName, headingParts, listScenes } from "./screenplay/scenes";

/** « linked » : un fil relie la carte à la scène. « cited » : la scène la cite, sans fil. */
export type Presence = "linked" | "cited" | "none";

export interface TimelineRow {
  card: CardData;
  /** Une case par scène, dans l'ordre reçu. */
  cells: Presence[];
  /** Nombre de scènes où la carte apparaît. */
  count: number;
}

export interface TimelineGroup {
  type: CardType;
  rows: TimelineRow[];
}

/** Types de cartes qui font une ligne : les intrigues (thèmes) d'abord. */
export const TIMELINE_TYPES: CardType[] = ["intrigue", "theme", "personnage", "lieu"];

export function timeline(
  cards: CardData[],
  links: Pick<Link, "source" | "target">[],
  manuscript: Manuscript,
  order: string[],
  lang: string,
): TimelineGroup[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const linked = new Set(links.flatMap((l) => [`${l.source}|${l.target}`, `${l.target}|${l.source}`]));
  // Ce que chaque scène cite : mentions @ de sa carte, noms trouvés dans ses notes et dans son texte.
  const cited = order.map((id) => {
    const scene = byId.get(id);
    const found = new Set(mentionedIds(scene?.html ?? ""));
    for (const card of detectCards(scene?.html, cards)) found.add(card.id);
    for (const card of detectCards(manuscript[id], cards)) found.add(card.id);
    return found;
  });
  return TIMELINE_TYPES.map((type) => ({
    type,
    rows: cards
      .filter((card) => card.type === type && card.title.trim())
      .map((card) => {
        const cells = order.map((scene, i): Presence => (linked.has(`${scene}|${card.id}`) ? "linked" : cited[i].has(card.id) ? "cited" : "none"));
        return { card, cells, count: cells.filter((c) => c !== "none").length };
      })
      // Les lignes les plus présentes en haut ; à égalité, par titre.
      .sort((a, b) => b.count - a.count || a.card.title.localeCompare(b.card.title, lang)),
  })).filter((group) => group.rows.length > 0);
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Scénario : ce que chaque scène « cite », à lire comme le texte d'une scène de roman (par carte Scène) :
 * le décor de son en-tête, les personnages qui y parlent et l'action. Les répliques n'en font pas partie
 * (un nom dit par quelqu'un ne met pas ce personnage dans la scène).
 */
export function screenplaySceneTexts(elements: ScreenplayElement[]): Manuscript {
  const out: Manuscript = {};
  for (const scene of listScenes(elements)) {
    if (!scene.cardId) continue;
    const parts = [headingParts(scene.text).location];
    for (const el of elements.slice(scene.index + 1, scene.end)) {
      if (el.type === "character") parts.push(characterName(el.text));
      else if (el.type === "action") parts.push(el.text);
    }
    out[scene.cardId] = parts.filter(Boolean).map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  }
  return out;
}
