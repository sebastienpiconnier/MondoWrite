// Carte Scène : son corps, c'est son texte (manuscrit d'un roman, scène du scénario). Les notes qu'elle
// portait avant (le corps de la carte, `html`) passent dans son synopsis, en une ligne : rien n'est perdu,
// et le texte d'une scène ne se confond jamais avec ses notes. Fonctions pures.

import { plainText } from "./search";
import type { CardData } from "./types";
import type { CardNode } from "./projectState";
import type { Screenplay } from "./screenplay/model";
import { sceneSynopsis, setSceneSynopsis } from "./screenplay/scenes";
import { headingOf } from "./screenplay/sceneText";

/** Notes d'une carte, en une ligne de texte (mentions, listes et cases deviennent du texte simple). */
export const notesLine = (html: string | undefined): string => plainText(html ?? "");

/** Synopsis existant, puis les notes : jamais l'un à la place de l'autre. */
export function mergeSynopsis(synopsis: string | undefined, notes: string): string {
  const a = (synopsis ?? "").trim();
  const b = notes.trim();
  if (!b || a === b || a.endsWith(b)) return a;
  return a ? `${a} ${b}` : b;
}

/**
 * Roman : une carte Scène dont le corps a des notes les voit passer dans `fiche.synopsis`, corps vidé.
 * Même objet si elle n'a rien à déplacer (ou si ce n'est pas une Scène).
 */
export function foldNovelNotes(card: CardData): CardData {
  if (card.type !== "scene") return card;
  const notes = notesLine(card.html);
  if (!notes) return card.html ? { ...card, html: "" } : card;
  return { ...card, html: "", fiche: { ...(card.fiche ?? {}), synopsis: mergeSynopsis(card.fiche?.synopsis, notes) } };
}

/** Même chose pour toutes les cartes d'un roman. Même liste si rien ne change. */
export function foldNovelNodes(nodes: CardNode[]): CardNode[] {
  let changed = false;
  const next = nodes.map((n) => {
    const data = foldNovelNotes(n.data);
    if (data === n.data) return n;
    changed = true;
    return { ...n, data };
  });
  return changed ? next : nodes;
}

/**
 * Scénario : les notes d'une carte Scène déjà reliée à son en-tête passent dans le synopsis Fountain de la
 * scène (« = … » sous l'en-tête), corps de la carte vidé. Une carte sans en-tête (pas encore de titre) garde
 * ses notes jusque-là. Mêmes objets si rien ne change.
 */
export function foldScreenplayNotes(nodes: CardNode[], screenplay: Screenplay | null): { nodes: CardNode[]; screenplay: Screenplay | null } {
  if (!screenplay) return { nodes, screenplay };
  let elements = screenplay.elements;
  let changed = false;
  const next = nodes.map((n) => {
    if (n.data.type !== "scene" || !n.data.html) return n;
    const at = headingOf(elements, n.id);
    if (at < 0) return n;
    const notes = notesLine(n.data.html);
    if (notes) elements = setSceneSynopsis(elements, at, mergeSynopsis(sceneSynopsis(elements, at), notes));
    changed = true;
    return { ...n, data: { ...n.data, html: "" } };
  });
  if (!changed) return { nodes, screenplay };
  return { nodes: next, screenplay: elements === screenplay.elements ? screenplay : { ...screenplay, elements } };
}
