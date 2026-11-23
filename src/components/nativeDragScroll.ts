import { createDragEdgeScroll, nearestScrollPanel } from "./dragEdgeScroll";

// Laisser le navigateur défiler en premier : certains WebView déplacent seulement le fantôme du glisser natif.
export function listenForNativeDragScroll() {
  const listeners = new AbortController();
  const options = { signal: listeners.signal, capture: true };
  let panel: HTMLElement | null = null;
  let scroll: ReturnType<typeof createDragEdgeScroll> | null = null;
  let reorderList: Element | null = null;
  let scrolled = false;
  let transfer: DataTransfer | null = null;
  let hover: Element | null = null;
  let timer = 0, x = 0, y = 0, left = 0, top = 0;

  function stop() {
    window.clearTimeout(timer);
    scroll?.stop();
    scroll = null;
    panel = null;
    scrolled = false;
    hover = null;
  }

  function rememberPosition() {
    if (!panel) return;
    left = panel.scrollLeft;
    top = panel.scrollTop;
  }

  function afterScroll() {
    rememberPosition();
    scrolled = true;
    if (!reorderList) return;
    const hit = document.elementFromPoint(x, y);
    const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer };
    if (hover && hover !== hit) hover.dispatchEvent(new DragEvent("dragleave", { ...init, relatedTarget: hit }));
    hover = hit;
    if (hit && reorderList.contains(hit)) hit.dispatchEvent(new DragEvent("dragover", init));
  }

  function deferToBrowser() {
    window.clearTimeout(timer);
    scroll?.stop();
    scroll = null;
    rememberPosition();
    timer = window.setTimeout(() => {
      if (!panel) return;
      scroll = createDragEdgeScroll(panel, afterScroll);
      scroll.update(x, y);
    }, 350);
  }

  function track(event: DragEvent) {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    transfer = event.dataTransfer;
    // Même le vide entre deux lignes peut se trouver devant une ligne après le défilement.
    if (reorderList?.contains(event.target)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    }
    x = event.clientX;
    y = event.clientY;
    const next = nearestScrollPanel(event.target);
    if (next !== panel) {
      stop();
      panel = next;
      if (panel) deferToBrowser();
    } else {
      scroll?.update(x, y);
    }
  }
  document.addEventListener("dragstart", (event) => {
    reorderList = event.target instanceof Element && event.target.matches('[draggable="true"]')
      ? event.target.closest("[data-native-reorder]") : null;
  }, options);
  document.addEventListener("dragenter", track, options);
  document.addEventListener("dragover", track, options);
  document.addEventListener("scroll", (event) => {
    if (panel && event.target === panel && (left !== panel.scrollLeft || top !== panel.scrollTop)) deferToBrowser();
  }, options);
  document.addEventListener("dragleave", (event) => {
    if (event.isTrusted && panel && event.target instanceof Node && panel.contains(event.target) &&
        (!(event.relatedTarget instanceof Node) || !panel.contains(event.relatedTarget))) stop();
  }, options);
  function end() { stop(); reorderList = null; transfer = null; }
  document.addEventListener("dragend", end, options);
  document.addEventListener("drop", (event) => {
    // WebKit peut garder l'ancienne ligne sous un pointeur immobile. Le gestionnaire de la
    // ligne visible conserve la validation métier (chapitres, cases, blocs du scénario).
    const hit = scrolled && reorderList ? document.elementFromPoint(event.clientX, event.clientY) : null;
    const retarget = hit && hit !== event.target && reorderList?.contains(hit);
    const staleInside = scrolled && reorderList && event.target instanceof Node &&
      reorderList.contains(event.target) && !reorderList.contains(hit);

    end();
    if (retarget || staleInside) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    if (retarget) {
      hit.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: event.clientX,
        clientY: event.clientY, dataTransfer: event.dataTransfer }));
    }
  }, options);
  window.addEventListener("blur", end, options);
  return () => { stop(); listeners.abort(); };
}
