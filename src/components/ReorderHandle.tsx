import { useRef, type ButtonHTMLAttributes } from "react";
import { MoreMenu } from "./MoreMenu";

interface Props {
  label: string;
  index: number;
  count: number;
  moveLabels: { up: string; down: string };
  onMove: (from: number, to: number) => void;
}

/** Le clavier et le pointeur partagent le même déplacement. Le glisser-déposer est validé au relâchement. */
export function ReorderHandle({ label, index, count, onMove, moveLabels }: Props) {
  const target = useRef<HTMLElement | null>(null);
  const clearTarget = () => {
    target.current?.removeAttribute("data-drop-target");
    target.current = null;
  };
  const press = useRef({ x: 0, y: 0, dragged: false });
  const grip = useRef<HTMLButtonElement | null>(null);
  const moveBy = (delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= count) return;
    onMove(index, next);
    // Le déplacement peut faire perdre le focus à la poignée. Respecter un changement de focus volontaire.
    requestAnimationFrame(() => {
      if (document.activeElement === document.body || document.activeElement?.tagName === "DIALOG") grip.current?.focus();
    });
  };
  const triggerProps: ButtonHTMLAttributes<HTMLButtonElement> = {
    disabled: count < 2,
    "aria-keyshortcuts": "ArrowUp ArrowDown",
    onFocus: (event) => { grip.current = event.currentTarget; },
    onKeyDown: (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      moveBy(event.key === "ArrowUp" ? -1 : 1);
    },
    onPointerDown: (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
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
    { label: moveLabels.up, disabled: index === 0, onSelect: () => moveBy(-1) },
    { label: moveLabels.down, disabled: index === count - 1, onSelect: () => moveBy(1) },
  ]} />;
}
