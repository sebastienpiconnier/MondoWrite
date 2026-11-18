// Fil "flottant" : il part du bord de la carte le plus proche de l'autre carte,
// au lieu d'un point fixe. Les cartes peuvent bouger, le fil suit naturellement.

import { BaseEdge, getBezierPath, Position, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";

type Rect = { x: number; y: number; w: number; h: number };

const rectOf = (n: InternalNode): Rect => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  w: n.measured.width ?? 0,
  h: n.measured.height ?? 0,
});

/** Point où la droite entre les deux centres sort du rectangle `a`. */
function borderPoint(a: Rect, b: Rect) {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return { x: ax, y: ay, pos: Position.Top };
  const sx = a.w / 2 / Math.abs(dx || 1e-6);
  const sy = a.h / 2 / Math.abs(dy || 1e-6);
  if (sx < sy) return { x: ax + dx * sx, y: ay + dy * sx, pos: dx > 0 ? Position.Right : Position.Left };
  return { x: ax + dx * sy, y: ay + dy * sy, pos: dy > 0 ? Position.Bottom : Position.Top };
}

export function FloatingEdge(props: EdgeProps) {
  const { id, source, target, markerEnd, style, interactionWidth, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius } = props;
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t) return null;

  const a = rectOf(s), b = rectOf(t);
  const p1 = borderPoint(a, b);
  const p2 = borderPoint(b, a);
  // Plusieurs flèches entre les deux mêmes cartes (choix aller et retour d'un roman interactif) : chacune est
  // décalée de côté, sinon elles et leurs étiquettes se recouvrent.
  const offset = Number((props.data as { offset?: number } | undefined)?.offset ?? 0);
  if (offset) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * offset, oy = (dx / len) * offset;
    p1.x += ox; p1.y += oy; p2.x += ox; p2.y += oy;
  }
  const [path, labelX, labelY] = getBezierPath({
    sourceX: p1.x,
    sourceY: p1.y,
    sourcePosition: p1.pos,
    targetX: p2.x,
    targetY: p2.y,
    targetPosition: p2.pos,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
      labelShowBg={labelShowBg}
      labelBgStyle={labelBgStyle}
      labelBgPadding={labelBgPadding}
      labelBgBorderRadius={labelBgBorderRadius}
    />
  );
}
