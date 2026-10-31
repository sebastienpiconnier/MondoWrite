// Estimation des pages par comptage de lignes, sans moteur de mise en page.
// C'est une estimation (à afficher avec « ≈ ») : le PDF donnera la pagination réelle.

import type { ScreenplayElement } from "./model";
import { columnsFor, type Layout } from "./layout";

export interface Pagination {
  /** Nombre de pages (0 si rien ne s'imprime). */
  pages: number;
  /** Page sur laquelle commence chaque élément, à partir de 1. */
  startPage: number[];
  /** Lignes occupées par chaque élément, ligne vide de séparation comprise. */
  lines: number[];
  linesPerPage: number;
}

/** Un texte coupé aux mots sur une largeur donnée (un mot trop long est coupé). Sert aussi au PDF. */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    let current = "";
    // Les espaces insécables (« viens ? », « Non ! ») ne coupent pas : sinon « ? » commencerait une ligne.
    for (const word of line.split(/[^\S\u00a0\u202f\u2007]+/)) {
      if (word === "") continue;
      if (current !== "" && current.length + 1 + word.length <= width) {
        current += ` ${word}`;
        continue;
      }
      if (current !== "") out.push(current);
      let rest = word;
      while (rest.length > width) {
        out.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      current = rest;
    }
    out.push(current);
  }
  return out;
}

export const wrappedLines = (text: string, width: number): number => wrap(text, width).length;

const IN_DIALOGUE = new Set(["character", "parenthetical", "dialogue"]);

export function paginate(elements: ScreenplayElement[], layout: Layout): Pagination {
  const perPage = layout.linesPerPage;
  const startPage: number[] = [];
  const lines: number[] = [];
  let page = 1;
  let used = 0; // lignes déjà prises sur la page courante
  let printed = false;
  let previous: ScreenplayElement | null = null; // dernier élément imprimé

  for (const el of elements) {
    if (el.type === "pageBreak") {
      if (used > 0) {
        page++;
        used = 0;
      }
      startPage.push(page);
      lines.push(0);
      previous = null;
      continue;
    }

    const width = columnsFor(el.type, layout);
    const height = width > 0 && el.text !== "" ? wrappedLines(el.text, width) : 0;
    if (height === 0) {
      startPage.push(page);
      lines.push(0);
      continue;
    }

    // Une ligne vide entre deux éléments, sauf dans un bloc personnage, didascalie, dialogue.
    const tight = previous !== null && IN_DIALOGUE.has(previous.type) && (el.type === "parenthetical" || el.type === "dialogue");
    let gap = used === 0 || tight ? 0 : 1;

    // Un en-tête de scène ne termine jamais une page (il lui faut une ligne vide et une ligne de texte) ;
    // un personnage n'est jamais séparé de sa première ligne de réplique.
    const keepWith = el.type === "sceneHeading" ? height + 2 : el.type === "character" ? height + 1 : 1;
    if (used + gap + keepWith > perPage) {
      page++;
      used = 0;
      gap = 0;
    }

    startPage.push(page);
    lines.push(gap + height);
    used += gap + height;
    // Un long paragraphe se poursuit sur les pages suivantes.
    while (used > perPage) {
      page++;
      used -= perPage;
    }
    printed = true;
    previous = el;
  }

  return { pages: printed ? page : 0, startPage, lines, linesPerPage: perPage };
}

/** Longueur en pages d'une suite d'éléments (une scène), en fraction de page. */
export function pagesBetween(pagination: Pagination, start: number, end: number): number {
  let total = 0;
  for (let i = start; i < end; i++) total += pagination.lines[i] ?? 0;
  return total / pagination.linesPerPage;
}
