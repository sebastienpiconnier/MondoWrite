// Fil "flottant" : il part du bord de la carte le plus proche de l'autre carte,
// au lieu d'un point fixe. Les cartes peuvent bouger, le fil suit naturellement.

import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useInternalNode, useStore, type EdgeProps, type InternalNode, type ReactFlowState } from "@xyflow/react";
import { bezierPoint, freeLabelAt, type Box, type Side } from "../edgePoint";

/** Clic sur l'étiquette en pilule d'une flèche (roman interactif) : `Toile` la choisit. Détail : l'identifiant du fil. */
export const EDGE_PILL_EVENT = "edge-pill";

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

type EdgeData = { offset?: number; labelAt?: number; pill?: boolean; pillClass?: string; pillTitle?: string } | undefined;

/** Bouts d'une flèche flottante : bords des deux cartes, décalés de côté quand plusieurs flèches les relient. */
function ends(s: InternalNode, t: InternalNode, offset: number) {
  const a = rectOf(s), b = rectOf(t);
  const p1 = borderPoint(a, b);
  const p2 = borderPoint(b, a);
  if (offset) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * offset, oy = (dx / len) * offset;
    p1.x += ox; p1.y += oy; p2.x += ox; p2.y += oy;
  }
  return { p1, p2 };
}

/** Taille d'une pilule, en unités du canevas (estimée : 180 px au plus, comme en CSS). */
const pillSize = (label: string) => ({ w: Math.min(180, 26 + label.length * 6.6), h: 26 });

/**
 * Place de la pilule le long de la flèche : la place voulue, ou la plus proche où aucune autre carte ne la couvre.
 * Calculée dans le sélecteur (un nombre) : la flèche n'est redessinée que si la place change.
 */
function usePillAt(source: string, target: string, data: EdgeData, label: string): number {
  const preferred = data?.labelAt ?? 0.5;
  const offset = Number(data?.offset ?? 0);
  return useStore((st: ReactFlowState) => {
    if (!data?.pill) return preferred;
    const s = st.nodeLookup.get(source), t = st.nodeLookup.get(target);
    if (!s || !t) return preferred;
    const obstacles: Box[] = [];
    for (const n of st.nodeLookup.values()) {
      if (n.id === source || n.id === target || n.hidden || n.type === "frame") continue;
      obstacles.push(rectOf(n));
    }
    if (!obstacles.length) return preferred;
    const { p1, p2 } = ends(s, t, offset);
    return freeLabelAt(p1, p1.pos as Side, p2, p2.pos as Side, preferred, pillSize(label), obstacles);
  });
}

export function FloatingEdge(props: EdgeProps) {
  const { id, source, target, markerEnd, style, selected, interactionWidth, label, labelStyle, labelShowBg, labelBgStyle, labelBgPadding, labelBgBorderRadius } = props;
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  // Plusieurs flèches entre les deux mêmes cartes (choix aller et retour d'un roman interactif) : chacune est
  // décalée de côté, sinon elles et leurs étiquettes se recouvrent.
  const data = props.data as EdgeData;
  const pillAt = usePillAt(source, target, data, String(label ?? ""));
  if (!s || !t) return null;

  const { p1, p2 } = ends(s, t, Number(data?.offset ?? 0));
  const [path, labelX, labelY] = getBezierPath({
    sourceX: p1.x,
    sourceY: p1.y,
    sourcePosition: p1.pos,
    targetX: p2.x,
    targetY: p2.y,
    targetPosition: p2.pos,
  });

  // Étiquette en pilule (choix d'un roman interactif) : du HTML au-dessus du fil, coupée si elle est longue (le texte
  // entier en infobulle), posée à la place voulue le long de la courbe pour que les choix voisins ne se recouvrent pas.
  if (data?.pill && label) {
    const at = pillAt;
    const point = at === 0.5 ? { x: labelX, y: labelY } : bezierPoint(p1, p1.pos as Side, p2, p2.pos as Side, at);
    return (
      <>
        <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`edge-pill nodrag nopan ${data.pillClass ?? ""} ${selected ? "is-selected" : ""}`.trim()}
            style={{ transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)` }}
            title={data.pillTitle ?? String(label)}
            aria-label={data.pillTitle ?? String(label)}
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent(EDGE_PILL_EVENT, { detail: id }));
            }}
          >
            {label}
          </button>
        </EdgeLabelRenderer>
      </>
    );
  }

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
