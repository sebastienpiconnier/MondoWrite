// Scènes omises (#46) : une fois les pages et les numéros de scène verrouillés, retirer une scène garde sa
// place. Son en-tête devient « OMIS » (« OMITTED »), avec son numéro, et porte la note
// [[cosmos:omitted:<id>]] (carte partie à la corbeille avec le texte) ; les autres logiciels lisent un en-tête
// ordinaire. Fonctions pures.

import type { Screenplay, ScreenplayElement } from "./model";
import { parse } from "./parse";

export const omittedNote = (cardId: string) => `[[cosmos:omitted:${cardId}]]`;

/** L'élément est l'en-tête d'une scène omise. */
export const isOmitted = (el: ScreenplayElement | undefined): boolean => el?.type === "sceneHeading" && el.omitted !== undefined;

/** Fin d'une scène : jusqu'au prochain en-tête ou à la prochaine section. */
function sceneEnd(elements: ScreenplayElement[], start: number): number {
  let end = start + 1;
  while (end < elements.length && !["sceneHeading", "section"].includes(elements[end].type)) end++;
  return end;
}

/**
 * Remplace la scène dont l'en-tête est à `start` par un en-tête omis : même numéro, texte `label`, note de la
 * carte `cardId`. Rend le même objet si l'élément n'est pas un en-tête ou s'il est déjà omis.
 */
export function omitScene(screenplay: Screenplay, start: number, cardId: string, label: string): Screenplay {
  const heading = screenplay.elements[start];
  if (heading?.type !== "sceneHeading" || isOmitted(heading)) return screenplay;
  const omitted: ScreenplayElement = {
    type: "sceneHeading",
    text: label,
    forced: true,
    omitted: cardId,
    ...(heading.sceneNumber ? { sceneNumber: heading.sceneNumber } : {}),
  };
  const elements = [...screenplay.elements.slice(0, start), omitted, ...screenplay.elements.slice(sceneEnd(screenplay.elements, start))];
  return { ...screenplay, elements };
}

/** Index de l'en-tête omis qui garde la place de la carte, sinon -1. */
export const omittedIndex = (screenplay: Screenplay, cardId: string): number =>
  screenplay.elements.findIndex((el) => isOmitted(el) && el.omitted === cardId);

/**
 * La scène revient de la corbeille : son texte (Fountain) reprend la place de son en-tête omis. Rend le même
 * objet s'il n'y a pas d'en-tête omis pour cette carte, ou rien à remettre.
 */
export function unomitScene(screenplay: Screenplay, cardId: string, scene: string): Screenplay {
  const at = omittedIndex(screenplay, cardId);
  if (at === -1) return screenplay;
  const elements = parse(scene).elements;
  if (elements.length === 0) return screenplay;
  return { ...screenplay, elements: [...screenplay.elements.slice(0, at), ...elements, ...screenplay.elements.slice(at + 1)] };
}
