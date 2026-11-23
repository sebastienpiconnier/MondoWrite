// Suit uniquement le pointeur qui a saisi la poignée. Le dépôt reste dans sa liste.
export function trackReorderDrag(
  button: HTMLButtonElement,
  start: PointerEvent,
  index: number,
  onDrag: () => void,
  onFinish: (to?: number) => void,
): () => void {
  const list = button.closest("[data-reorder-list]");
  const scroller = list?.closest<HTMLElement>("[data-reorder-scroll]");
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let target: HTMLElement | null = null;
  let x = start.clientX;
  let y = start.clientY;
  let dragging = false;
  let frame = 0;
  let lastTime = 0;

  function updateTarget() {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-reorder-index]");
    const next = row && row.closest("[data-reorder-list]") === list && Number(row.dataset.reorderIndex) !== index ? row : null;
    if (next === target) return;
    target?.removeAttribute("data-drop-target");
    target = next;
    if (target) target.dataset.dropTarget = Number(target.dataset.reorderIndex) > index ? "after" : "before";
  }

  function scrollFrame(now: number) {
    frame = 0;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    if (x < rect.left || x > rect.right || y < top || y > bottom) return;
    const band = Math.min(64, (bottom - top) / 4);
    if (band <= 0) return;
    const edge = Math.max(0, 1 - (bottom - y) / band) - Math.max(0, 1 - (y - top) / band);
    if (!edge) return;
    const elapsed = Math.min(now - lastTime, 32);
    lastTime = now;
    const before = scroller.scrollTop;
    // Vitesse en pixels par milliseconde, progressive près du bord et indépendante du taux de rafraîchissement.
    scroller.scrollTop += Math.sign(edge) * Math.max(1, Math.abs(edge) * elapsed * 1.1);
    if (scroller.scrollTop !== before) {
      updateTarget();
      frame = requestAnimationFrame(scrollFrame);
    }
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
    if (scroller && !frame) {
      lastTime = performance.now();
      frame = requestAnimationFrame(scrollFrame);
    }
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
    cancelAnimationFrame(frame);
    target?.removeAttribute("data-drop-target");
    listeners.abort();
    if (button.hasPointerCapture(start.pointerId)) button.releasePointerCapture(start.pointerId);
    onFinish(to);
  }

  function stop() { end(); }

  function escape(event: KeyboardEvent) {
    if (event.key === "Escape") stop();
  }

  button.setPointerCapture(start.pointerId);
  button.addEventListener("pointermove", move, options);
  button.addEventListener("pointerup", finish, options);
  button.addEventListener("pointercancel", finish, options);
  button.addEventListener("lostpointercapture", finish, options);
  window.addEventListener("blur", stop, options);
  window.addEventListener("keydown", escape, options);
  return stop;
}
