import { useEffect, useRef, type ButtonHTMLAttributes } from "react";
import { MoreMenu } from "./MoreMenu";
import { trackReorderDrag } from "./trackReorderDrag";

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
  const stopDrag = useRef<(() => void) | null>(null);
  const dragged = useRef(false);
  useEffect(() => () => stopDrag.current?.(), []);
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
      stopDrag.current?.();
      dragged.current = false;
      stopDrag.current = trackReorderDrag(
        event.currentTarget, event.nativeEvent, index,
        () => { dragged.current = true; },
        (to) => {
          stopDrag.current = null;
          if (to !== undefined) onMove(index, to);
        },
      );
    },
    onClickCapture: (event) => {
      if (event.detail && dragged.current) event.stopPropagation();
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
