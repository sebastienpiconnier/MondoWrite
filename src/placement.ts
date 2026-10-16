// Où poser une nouvelle carte (ou un nouveau cadre) sur le canevas pour qu'elle ne chevauche ni une
// autre carte ni un cadre. Fonctions pures : le store leur donne les rectangles des cartes et des cadres.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Taille supposée d'une carte qui n'a pas encore été mesurée. */
export const CARD_SIZE = { width: 240, height: 150 };
/** Espace laissé entre deux cartes. */
const GAP = 24;

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width + GAP && b.x < a.x + a.width + GAP && a.y < b.y + b.height + GAP && b.y < a.y + a.height + GAP;

const inside = (spot: { x: number; y: number }, size: { width: number; height: number }, area: Box) =>
  spot.x >= area.x && spot.y >= area.y && spot.x + size.width <= area.x + area.width && spot.y + size.height <= area.y + area.height;

const isFree = (spot: { x: number; y: number }, boxes: Box[], size: { width: number; height: number }, within?: Box) =>
  (!within || inside(spot, size, within)) && !boxes.some((box) => overlaps({ ...spot, ...size }, box));

/**
 * L'emplacement libre le plus proche de celui demandé (double-clic, bouton « Nouvelle carte ») :
 * l'endroit voulu s'il est libre, sinon on s'en écarte en anneaux de plus en plus larges.
 */
export function freeSpot(wanted: { x: number; y: number }, boxes: Box[], size = CARD_SIZE, within?: Box): { x: number; y: number } {
  return search(wanted, boxes, size, within) ?? wanted;
}

function search(wanted: { x: number; y: number }, boxes: Box[], size: { width: number; height: number }, within?: Box): { x: number; y: number } | null {
  if (isFree(wanted, boxes, size, within)) return wanted;
  const stepX = (size.width + GAP) / 2;
  const stepY = (size.height + GAP) / 2;
  for (let ring = 1; ring <= 60; ring++) {
    const candidates: { x: number; y: number; distance: number }[] = [];
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        candidates.push({ x: wanted.x + i * stepX, y: wanted.y + j * stepY, distance: (i * stepX) ** 2 + (j * stepY) ** 2 });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const found = candidates.find((spot) => isFree(spot, boxes, size, within));
    if (found) return { x: Math.round(found.x), y: Math.round(found.y) };
  }
  return null;
}

/** Ce qui occupe déjà le canevas : les cartes et les cadres. */
export interface Occupied {
  cards: Box[];
  frames: Box[];
}

/** Marge intérieure d'un cadre où l'on pose une carte (plus haute en tête, pour son titre). */
const INSET = { side: 16, top: 56, bottom: 16 };
const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
const holds = (frame: Box, point: { x: number; y: number }) =>
  point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= frame.y && point.y <= frame.y + frame.height;

/**
 * Place d'une nouvelle carte près de `wanted`. Demandée dans un cadre (double-clic, clic droit, dépôt
 * dedans), elle y reste, tout entière à l'intérieur, sans chevaucher ses cartes ni les cadres qu'il
 * contient. Ailleurs, ou si le cadre est plein, elle va dans un espace vide : jamais sur un cadre.
 */
export function placeCard(wanted: { x: number; y: number }, occupied: Occupied, size = CARD_SIZE): { x: number; y: number } {
  const host = occupied.frames.filter((f) => holds(f, wanted)).sort((a, b) => a.width * a.height - b.width * b.height)[0];
  if (host) {
    const area = { x: host.x + INSET.side, y: host.y + INSET.top, width: host.width - INSET.side * 2, height: host.height - INSET.top - INSET.bottom };
    const nested = occupied.frames.filter((f) => f !== host && contains(host, f));
    const start = { x: Math.max(area.x, Math.min(wanted.x, area.x + area.width - size.width)), y: Math.max(area.y, Math.min(wanted.y, area.y + area.height - size.height)) };
    const spot = search(start, [...occupied.cards, ...nested], size, area);
    if (spot) return spot;
  }
  return freeSpot(wanted, [...occupied.cards, ...occupied.frames], size);
}

/** Place d'un nouveau cadre près de `wanted` (son coin haut gauche) : hors des cartes et des autres cadres. */
export const placeFrame = (wanted: { x: number; y: number }, occupied: Occupied, size: { width: number; height: number }) =>
  freeSpot(wanted, [...occupied.cards, ...occupied.frames], size);

const COLUMNS = 5;
const STEP_X = 280;
const STEP_Y = 200;

/**
 * Première case libre d'une grille lue comme un texte (carte créée depuis la Bible ou le scénario,
 * sans endroit désigné) : les nouvelles cartes se rangent côte à côte au lieu de s'empiler.
 */
export function firstFreeCell(boxes: Box[] | Occupied, size = CARD_SIZE): { x: number; y: number } {
  // Les cadres comptent aussi : une carte créée ailleurs ne se pose jamais sur l'un d'eux.
  if (!Array.isArray(boxes)) boxes = [...boxes.cards, ...boxes.frames];
  for (let row = 0; row < 500; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const spot = { x: 80 + column * STEP_X, y: 80 + row * STEP_Y };
      if (isFree(spot, boxes, size)) return spot;
    }
  }
  return { x: 80, y: 80 };
}
