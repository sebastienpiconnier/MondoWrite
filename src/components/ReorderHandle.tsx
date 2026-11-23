import { useRef, type ButtonHTMLAttributes } from "react";
import { MoreMenu } from "./MoreMenu";

interface Props {
  label: string;
  index: number;
  count: number;
  dragEnabled?: boolean;
  canStep?: { up: boolean; down: boolean };
  onStep?: (direction: "up" | "down") => void;
  moveLabels: { up: string; down: string };
  onMove: (from: number, to: number) => void;
}

/** La poignée valide le dépôt au relâchement. Son menu et les flèches du clavier avancent d’un cran. */
export function ReorderHandle({
  label, index, count, moveLabels, onMove, onStep,
  canStep = { up: index > 0, down: index < count - 1 },
  dragEnabled = count > 1,
}: Props) {
  const target = useRef<HTMLElement | null>(null);
  const clearTarget = () => {
    target.current?.removeAttribute("data-drop-target");
    target.current = null;
  };
  const press = useRef({ x: 0, y: 0, dragged: false });
  const grip = useRef<HTMLButtonElement | null>(null);
  const moveBy = (direction: "up" | "down") => {
    if (!canStep[direction]) return;
    if (onStep) onStep(direction);
    else onMove(index, index + (direction === "up" ? -1 : 1));
    // Le déplacement peut faire perdre le focus à la poignée. Respecter un changement de focus volontaire.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement?.tagName === "DIALOG") grip.current?.focus();
    });
  };
  const triggerProps: ButtonHTMLAttributes<HTMLButtonElement> = {
    disabled: !dragEnabled && !canStep.up && !canStep.down,
    "aria-keyshortcuts": "ArrowUp ArrowDown",
    onFocus: (event) => { grip.current = event.currentTarget; },
    onKeyDown: (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      event.stopPropagation();
      moveBy(event.key === "ArrowUp" ? "up" : "down");
    },
    onPointerDown: (event) => {
      if (!dragEnabled || event.button !== 0 || !event.isPrimary) return;
      // La poignée pilote le geste, même si la ligne accepte aussi le glisser-déposer natif.
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      grip.current = event.currentTarget;
      press.current = { x: event.clientX, y: event.clientY, dragged: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const gesture = press.current;
      if (!gesture.dragged && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 5) return;
      gesture.dragged = true;
      clearTarget();
      const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-reorder-index]");
      if (!row || row.closest("[data-reorder-list]") !== event.currentTarget.closest("[data-reorder-list]")) return;
      const to = Number(row.dataset.reorderIndex);
      if (to === index) return;
      row.dataset.dropTarget = to > index ? "after" : "before";
      target.current = row;
    },
    onPointerUp: (event) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const row = target.current;
      clearTarget();
      if (row) onMove(index, Number(row.dataset.reorderIndex));
    },
    onLostPointerCapture: clearTarget,
    onClickCapture: (event) => {
      if (event.detail && press.current.dragged) event.stopPropagation();
    },
  };
  const dots = (
    <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
      {[4, 9, 14].map(y => <g key={y}><circle cx="4" cy={y} r="1.4" /><circle cx="10" cy={y} r="1.4" /></g>)}
    </svg>
  );
  return <MoreMenu label={label} icon={dots} className="reorder-handle" triggerProps={triggerProps} items={[
    { label: moveLabels.up, disabled: !canStep.up, onSelect: () => moveBy("up") },
    { label: moveLabels.down, disabled: !canStep.down, onSelect: () => moveBy("down") },
  ]} />;
}
