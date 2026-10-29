// Hiérarchie des cadres du canevas : un cadre posé dans un autre est d'un niveau plus bas, et son titre plus
// petit. Rien n'est écrit dans le projet : le niveau se lit dans la position des cadres, à chaque affichage.

import type { Frame } from "./types";

type Box = Pick<Frame, "id" | "x" | "y" | "width" | "height">;

/** Niveaux de titre : 0 (cadre de premier niveau), 1 (dans un cadre), 2 (dans deux cadres ou plus). */
export type FrameLevel = 0 | 1 | 2;

const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

/** Nombre de cadres qui contiennent celui-ci tout entier. Deux cadres de même boîte : seul le premier contient l'autre. */
export function frameDepth(id: string, frames: readonly Box[]): number {
  const index = frames.findIndex((f) => f.id === id);
  if (index < 0) return 0;
  const me = frames[index];
  let depth = 0;
  frames.forEach((f, i) => {
    if (i === index || !inside(me, f)) return;
    const same = f.width === me.width && f.height === me.height;
    if (!same || i < index) depth += 1;
  });
  return depth;
}

export const frameLevel = (depth: number): FrameLevel => (depth <= 0 ? 0 : depth === 1 ? 1 : 2);

/** Plafond de l'agrandissement des titres selon le niveau : de loin, on lit d'abord les grands cadres. */
const BOOST_MAX: Record<FrameLevel, number> = { 0: 4, 1: 2.5, 2: 1.5 };

/**
 * Agrandissement du titre quand on recule : le titre garde à l'écran à peu près sa taille de 70 % de zoom,
 * jusqu'au plafond de son niveau. Par crans de 0,25 (arrondi vers le bas : rien avant 56 % de zoom, quand les
 * cartes se lisent encore), pour ne pas redessiner les cadres à chaque image du zoom.
 */
export function titleBoost(zoom: number, level: FrameLevel): number {
  if (!(zoom > 0)) return 1;
  const raw = Math.min(BOOST_MAX[level], Math.max(1, 0.7 / zoom));
  return Math.floor(raw * 4) / 4;
}

/** Taille de base du titre en px (la même que canvas.css : --frame-title). */
export function titleSize(level: FrameLevel, beat: boolean): number {
  if (beat && level === 0) return 30;
  return level === 0 ? 26 : level === 1 ? 20 : 16;
}

/**
 * Agrandissement borné par la largeur du cadre : le mot le plus long du titre doit tenir sur une ligne
 * (un cadre étroit coupait « Événements » en deux). Une lettre fait environ 0,62 de la taille du texte,
 * l'étiquette ajoute environ une taille de marge et 24 px autour. Jamais moins de 1.
 */
export function fitBoost(title: string, width: number, base: number, boost: number): number {
  const longest = Math.max(1, ...title.split(/\s+/).map((w) => [...w].length));
  const fit = (width - 24) / (base * (longest * 0.62 + 1));
  return Math.max(1, Math.min(boost, Math.floor(fit * 4) / 4));
}
