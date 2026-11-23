import { createDragEdgeScroll } from "./dragEdgeScroll";

// Suit uniquement le pointeur qui a saisi la poignée. Le dépôt reste dans sa liste.
export function trackReorderDrag(
  button: HTMLButtonElement,
  start: PointerEvent,
  index: number,
  onDrag: () => void,
  onFinish: (to?: number) => void,
): () => void {
  const list = button.closest("[data-reorder-list]");
  const scroll = createDragEdgeScroll(button, updateTarget);
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let target: HTMLElement | null = null;
  let x = start.clientX;
  let y = start.clientY;
  let dragging = false;

  function updateTarget() {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-reorder-index]");
    const next = row && row.closest("[data-reorder-list]") === list && Number(row.dataset.reorderIndex) !== index ? row : null;
    if (next === target) return;
    target?.removeAttribute("data-drop-target");
    target = next;
    if (target) target.dataset.dropTarget = Number(target.dataset.reorderIndex) > index ? "after" : "before";
  }

  function move(event: PointerEvent) {
    if (event.pointerId !== start.pointerId) return;
    x = event.clientX;
    y = event.clientY;
    if (!dragging) {
      if (Math.hypot(x - start.clientX, y - start.clientY) < 5) return;
      dragging = true;
      onDrag();
    }
    updateTarget();
    scroll.update(x, y);
  }

  function finish(event: PointerEvent) {
    if (event.pointerId !== start.pointerId) return;
    if (dragging && event.type === "pointerup") {
      x = event.clientX;
      y = event.clientY;
      updateTarget();
      const to = target?.dataset.reorderIndex;
      end(to === undefined ? undefined : Number(to));
    } else {
      stop();
    }
  }

  function end(to?: number) {
    scroll.stop();
    target?.removeAttribute("data-drop-target");
    listeners.abort();
    if (button.hasPointerCapture(start.pointerId)) button.releasePointerCapture(start.pointerId);
    onFinish(to);
  }

  function stop() { end(); }

  function escape(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop();
    }
  }

  button.setPointerCapture(start.pointerId);
  button.addEventListener("pointermove", move, options);
  button.addEventListener("pointerup", finish, options);
  button.addEventListener("pointercancel", finish, options);
  button.addEventListener("lostpointercapture", finish, options);
  window.addEventListener("blur", stop, options);
  window.addEventListener("keydown", escape, { ...options, capture: true });
  return stop;
}
