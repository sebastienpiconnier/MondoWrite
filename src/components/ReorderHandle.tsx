import { useRef } from "react";

interface Props {
  label: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
}

/** Pointer and keyboard operation share the same move. Commit a drag only on release. */
export function ReorderHandle({ label, index, count, onMove }: Props) {
  const target = useRef<HTMLElement | null>(null);
  const clearTarget = () => {
    target.current?.removeAttribute("data-drop-target");
    target.current = null;
  };
  return (
    <button type="button" className="reorder-handle" aria-label={label} title={label}
      disabled={count < 2} aria-keyshortcuts="ArrowUp ArrowDown"
      onKeyDown={(event) => {
        const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (!delta) return;
        event.preventDefault();
        const next = index + delta;
        if (next >= 0 && next < count) {
          const handle = event.currentTarget;
          onMove(index, next);
          requestAnimationFrame(() => handle.focus());
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        clearTarget();
        const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-reorder-index]");
        if (!row || row.closest("[data-reorder-list]") !== event.currentTarget.closest("[data-reorder-list]")) return;
        const to = Number(row.dataset.reorderIndex);
        if (to === index) return;
        row.dataset.dropTarget = to > index ? "after" : "before";
        target.current = row;
      }}
      onPointerUp={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const row = target.current;
        clearTarget();
        if (row) onMove(index, Number(row.dataset.reorderIndex));
      }}
      onLostPointerCapture={clearTarget}>
      <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
        {[4, 9, 14].map(y => <g key={y}><circle cx="4" cy={y} r="1.4" /><circle cx="10" cy={y} r="1.4" /></g>)}
      </svg>
    </button>
  );
}
