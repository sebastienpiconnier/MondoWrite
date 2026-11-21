// Point d'une courbe de React Flow (`getBezierPath`, même calcul des points de contrôle) à une place donnée,
// pour poser une étiquette ailleurs qu'au milieu du fil (fonctions pures).

export type Side = "top" | "right" | "bottom" | "left";

const controlOffset = (distance: number, curvature: number) => (distance >= 0 ? 0.5 * distance : curvature * 25 * Math.sqrt(-distance));

function control(side: Side, x1: number, y1: number, x2: number, y2: number, c: number): [number, number] {
  switch (side) {
    case "left":
      return [x1 - controlOffset(x1 - x2, c), y1];
    case "right":
      return [x1 + controlOffset(x2 - x1, c), y1];
    case "top":
      return [x1, y1 - controlOffset(y1 - y2, c)];
    case "bottom":
      return [x1, y1 + controlOffset(y2 - y1, c)];
  }
}

/** Point de la courbe entre `a` (côté `as`) et `b` (côté `bs`), à la place `t` (0 = `a`, 1 = `b`). */
export function bezierPoint(a: { x: number; y: number }, as: Side, b: { x: number; y: number }, bs: Side, t: number, curvature = 0.25): { x: number; y: number } {
  const [c1x, c1y] = control(as, a.x, a.y, b.x, b.y, curvature);
  const [c2x, c2y] = control(bs, b.x, b.y, a.x, a.y, curvature);
  const u = 1 - t;
  const k0 = u * u * u, k1 = 3 * u * u * t, k2 = 3 * u * t * t, k3 = t * t * t;
  return { x: k0 * a.x + k1 * c1x + k2 * c2x + k3 * b.x, y: k0 * a.y + k1 * c1y + k2 * c2y + k3 * b.y };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Places essayées pour une étiquette qu'une carte recouvre à sa place voulue : la plus proche d'abord. */
const TRIES = Array.from({ length: 17 }, (_, k) => 0.1 + k * 0.05);

/**
 * Place d'une étiquette le long de la courbe où elle ne tombe sur aucune carte (`obstacles`), la plus proche de la
 * place voulue. Une flèche qui passe derrière une autre carte posait sinon sa pilule dessous, et la carte prenait
 * le clic. Sans place libre, la place voulue.
 */
export function freeLabelAt(
  a: { x: number; y: number },
  as: Side,
  b: { x: number; y: number },
  bs: Side,
  preferred: number,
  size: { w: number; h: number },
  obstacles: readonly Box[],
  margin = 6,
  /** Obstacles qu'on évite seulement s'il y a la place (pilules voisines) : à défaut, une place hors des seules cartes. */
  soft: readonly Box[] = [],
): number {
  const clearOf = (boxes: readonly Box[]) => (t: number) => {
    const p = bezierPoint(a, as, b, bs, t);
    const x = p.x - size.w / 2 - margin, y = p.y - size.h / 2 - margin, w = size.w + 2 * margin, h = size.h + 2 * margin;
    return !boxes.some((o) => x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h);
  };
  const tries = [preferred, ...[...TRIES].sort((u, v) => Math.abs(u - preferred) - Math.abs(v - preferred))];
  const all = clearOf([...obstacles, ...soft]);
  const cards = clearOf(obstacles);
  return tries.find(all) ?? tries.find(cards) ?? preferred;
}

/** La courbe passe-t-elle sur une des cartes (`obstacles`) ? Points pris tous les 5 % du chemin, bouts exclus. */
export function crossesBoxes(a: { x: number; y: number }, as: Side, b: { x: number; y: number }, bs: Side, obstacles: readonly Box[]): boolean {
  for (let k = 1; k < 20; k++) {
    const p = bezierPoint(a, as, b, bs, k / 20);
    if (obstacles.some((o) => p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h)) return true;
  }
  return false;
}
