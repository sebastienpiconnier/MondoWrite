// Longueur d'une scène en huitièmes de page (#44), l'unité des plans de travail et du dépouillement :
// « 3/8 », « 1 », « 1 2/8 ». Fonctions pures. Les lignes viennent de la même estimation que les pages
// affichées ailleurs (paginate.ts) : une scène coupée entre deux pages compte ses deux morceaux.

import type { ScreenplayElement } from "./model";
import { pagesBetween, type Pagination } from "./paginate";
import { listScenes } from "./scenes";

/** Huitièmes de page pour une longueur en pages, arrondie au huitième supérieur ; au moins 1 dès qu'il y a du texte. */
export function eighthsOf(pages: number): number {
  if (!(pages > 0)) return 0;
  // La marge absorbe les erreurs d'arrondi des flottants (7 lignes sur 56 font exactement 1/8).
  return Math.max(1, Math.ceil(pages * 8 - 1e-9));
}

/** « 3/8 », « 1 », « 1 2/8 » ; rien pour 0. La même notation dans toutes les langues. */
export function formatEighths(eighths: number): string {
  if (!(eighths > 0)) return "";
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (rest === 0) return String(whole);
  return whole === 0 ? `${rest}/8` : `${whole} ${rest}/8`;
}

/** Huitièmes d'une suite d'éléments (une scène, de l'en-tête à la scène suivante). */
export const eighthsBetween = (pagination: Pagination, start: number, end: number): number => eighthsOf(pagesBetween(pagination, start, end));

/** Huitièmes de chaque scène reliée à sa carte, par identifiant de carte. */
export function eighthsByCard(elements: ScreenplayElement[], pagination: Pagination): Map<string, number> {
  const out = new Map<string, number>();
  for (const scene of listScenes(elements)) {
    if (scene.cardId) out.set(scene.cardId, eighthsBetween(pagination, scene.index, scene.end));
  }
  return out;
}
