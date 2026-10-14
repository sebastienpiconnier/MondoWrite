// Le texte d'une seule scène, pour l'écrire depuis sa carte (carte agrandie) : tout ce qui suit son en-tête
// et son synopsis, jusqu'à la scène ou la section suivante. Fonctions pures.

import { isEditableType } from "./editor/nodes";
import type { ScreenplayElement } from "./model";
import { synopsisEnd } from "./scenes";

/** Index de l'en-tête relié à cette carte, ou -1. */
export const headingOf = (elements: ScreenplayElement[], cardId: string): number =>
  elements.findIndex((el) => el.type === "sceneHeading" && el.cardId === cardId);

/** Fin de la scène : la scène ou la section suivante (une case de gabarit n'appartient pas à la scène). */
export function sceneEnd(elements: ScreenplayElement[], headingIndex: number): number {
  for (let i = headingIndex + 1; i < elements.length; i++) {
    if (elements[i].type === "sceneHeading" || elements[i].type === "section") return i;
  }
  return elements.length;
}

/** Le corps d'une scène : ses éléments après l'en-tête et le synopsis. */
export function sceneBody(elements: ScreenplayElement[], headingIndex: number): ScreenplayElement[] {
  if (elements[headingIndex]?.type !== "sceneHeading") return [];
  return elements.slice(synopsisEnd(elements, headingIndex), sceneEnd(elements, headingIndex));
}

const same = (a: ScreenplayElement[], b: ScreenplayElement[]) => a.length === b.length && a.every((el, i) => JSON.stringify(el) === JSON.stringify(b[i]));

/** Remplace le corps d'une scène. Un élément vide en fin de corps n'est pas écrit. Même tableau si rien ne change. */
export function setSceneBody(elements: ScreenplayElement[], headingIndex: number, body: ScreenplayElement[]): ScreenplayElement[] {
  if (elements[headingIndex]?.type !== "sceneHeading") return elements;
  const clean = [...body];
  while (clean.length > 0 && isEditableType(clean[clean.length - 1].type) && !clean[clean.length - 1].text.trim()) clean.pop();
  const start = synopsisEnd(elements, headingIndex);
  const end = sceneEnd(elements, headingIndex);
  if (same(elements.slice(start, end), clean)) return elements;
  return [...elements.slice(0, start), ...clean, ...elements.slice(end)];
}

/** Texte lisible d'une scène, pour son aperçu sur le canevas : répliques précédées du personnage. */
export function sceneText(body: ScreenplayElement[], lang = "en"): string {
  // Deux-points précédé d'une espace insécable en français.
  const colon = lang.startsWith("fr") ? "\u00a0:" : ":";
  const parts: string[] = [];
  for (const el of body) {
    if (!isEditableType(el.type) || !el.text.trim()) continue;
    const text = el.text.replace(/\s+/g, " ").trim();
    if (el.type === "character") parts.push(`${text.toUpperCase()}${colon}`);
    else parts.push(text);
  }
  return parts.join(" ");
}
