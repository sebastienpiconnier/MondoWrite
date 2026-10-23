// Molette et trackpad sur le canevas : un seul gestionnaire, posé sur le conteneur du canevas en phase de
// capture (avant React Flow et les cartes).
// - Pincement (molette avec ctrlKey, ce que Chrome et Windows envoient ; ou événements gesture de WebKit sur
//   Mac) : zoom du canevas autour du pointeur, toujours, même au-dessus d'une carte.
// - Glissement à deux doigts ou molette seule : la zone sous le pointeur défile si elle a vraiment du contenu
//   à faire défiler dans ce sens ; sinon le canevas se déplace (mode « pan », par défaut) ou zoome (mode
//   « zoom », réglage de l'appareil, l'ancien comportement pour la souris).
// Les fonctions de ce fichier sont pures (testées) ; le branchement est dans Toile.tsx.

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

/** Ce qu'il faut savoir d'un événement wheel (sous-ensemble de WheelEvent, pour les tests). */
export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

const LINE = 16;

/** Déplacement en pixels, quelle que soit l'unité de l'événement (pixels, lignes, pages). */
export function wheelPixels(e: WheelLike, pageHeight: number): { dx: number; dy: number } {
  const unit = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? pageHeight : 1;
  let dx = e.deltaX * unit;
  let dy = e.deltaY * unit;
  // Maj + molette d'une souris (Windows, Linux) : défilement horizontal. Le Mac le fait déjà lui-même.
  if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0];
  return { dx, dy };
}

/** Facteur de zoom d'un événement de pincement (même échelle que React Flow), borné par cran de molette. */
export function pinchFactor(e: WheelLike): number {
  const step = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002;
  // Un pincement envoie de petits pas ; Ctrl + molette d'une souris, un grand : on le ramène à ±27 % par cran.
  const exponent = Math.max(-0.35, Math.min(0.35, -e.deltaY * step * 10));
  return Math.pow(2, exponent);
}

/** Facteur de zoom d'un cran de molette sans Ctrl (mode « zoom ») : l'échelle de React Flow, bornée. */
export function wheelZoomFactor(e: WheelLike): number {
  const step = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002;
  const exponent = Math.max(-0.35, Math.min(0.35, -e.deltaY * step));
  return Math.pow(2, exponent);
}

/** Zoom autour d'un point de l'écran (relatif au canevas) : ce point reste sous le pointeur. */
export function zoomAround(vp: Viewport, factor: number, px: number, py: number, minZoom: number, maxZoom: number): Viewport {
  const zoom = Math.max(minZoom, Math.min(maxZoom, vp.zoom * factor));
  if (zoom === vp.zoom) return vp;
  const k = zoom / vp.zoom;
  return { x: px - (px - vp.x) * k, y: py - (py - vp.y) * k, zoom };
}

/** Déplacement du canevas (les doigts poussent le contenu, comme dans un document). */
export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  if (dx === 0 && dy === 0) return vp;
  return { x: vp.x - dx, y: vp.y - dy, zoom: vp.zoom };
}

/** Ce qu'il faut savoir d'un élément pour décider s'il défile (sous-ensemble de HTMLElement, pour les tests). */
export interface ScrollBox {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  overflowX: string;
  overflowY: string;
}

const scrolls = (overflow: string) => overflow === "auto" || overflow === "scroll" || overflow === "overlay";

/** Cet élément peut-il encore défiler dans le sens du geste ? (Il doit avoir du contenu caché de ce côté.) */
export function canScroll(box: ScrollBox, dx: number, dy: number): boolean {
  // On suit le sens dominant du geste : un glissement vertical un peu de travers reste vertical.
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy === 0 || !scrolls(box.overflowY) || box.scrollHeight <= box.clientHeight + 1) return false;
    return dy > 0 ? box.scrollTop + box.clientHeight < box.scrollHeight - 1 : box.scrollTop > 0;
  }
  if (!scrolls(box.overflowX) || box.scrollWidth <= box.clientWidth + 1) return false;
  return dx > 0 ? box.scrollLeft + box.clientWidth < box.scrollWidth - 1 : box.scrollLeft > 0;
}

function boxOf(el: HTMLElement): ScrollBox {
  const s = getComputedStyle(el);
  return {
    scrollTop: el.scrollTop,
    scrollLeft: el.scrollLeft,
    scrollHeight: el.scrollHeight,
    scrollWidth: el.scrollWidth,
    clientHeight: el.clientHeight,
    clientWidth: el.clientWidth,
    overflowX: s.overflowX,
    overflowY: s.overflowY,
  };
}

/** Un élément entre la cible et le canevas qui défilerait avec ce geste. */
export function scrollableUnder(target: EventTarget | null, root: HTMLElement, dx: number, dy: number): boolean {
  let el = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  while (el && el !== root) {
    if (canScroll(boxOf(el), dx, dy)) return true;
    el = el.parentElement;
  }
  return false;
}

interface CanvasWheelOptions {
  root: HTMLElement;
  getViewport: () => Viewport;
  setViewport: (vp: Viewport) => void;
  minZoom: number;
  maxZoom: number;
  /** Ce que fait la molette sans Ctrl : déplacer (par défaut) ou zoomer. Relu à chaque geste. */
  mode?: () => "pan" | "zoom";
}

/** Ce que React Flow garde pour lui : mini-carte (elle a son propre zoom) et boutons posés sur le canevas. */
const OWN_WHEEL = ".react-flow__minimap, .react-flow__panel";

/** Branche le gestionnaire unique ; rend la fonction qui le retire. */
export function attachCanvasWheel({ root, getViewport, setViewport, minZoom, maxZoom, mode = () => "pan" }: CanvasWheelOptions): () => void {
  const point = (clientX: number, clientY: number) => {
    const r = root.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top] as const;
  };
  // Seulement ce qui est au-dessus du canevas lui-même : pas les menus et barres posés à côté dans le conteneur.
  const onCanvas = (t: EventTarget | null) => t instanceof Element && !!t.closest(".react-flow") && !t.closest(OWN_WHEEL);

  const onWheel = (e: WheelEvent) => {
    if (!onCanvas(e.target)) return;
    if (e.ctrlKey) {
      // Pincement : toujours le canevas. preventDefault empêche aussi le zoom de la page entière.
      e.preventDefault();
      e.stopPropagation();
      const [px, py] = point(e.clientX, e.clientY);
      const vp = getViewport();
      const next = zoomAround(vp, pinchFactor(e), px, py, minZoom, maxZoom);
      if (next !== vp) setViewport(next);
      return;
    }
    const { dx, dy } = wheelPixels(e, root.clientHeight);
    // Le contenu d'une carte (ou d'un menu) qui défile vraiment garde le geste : défilement natif.
    e.stopPropagation();
    if (scrollableUnder(e.target, root, dx, dy)) return;
    e.preventDefault();
    const vp = getViewport();
    let next: Viewport;
    if (mode() === "zoom") {
      const [px, py] = point(e.clientX, e.clientY);
      next = zoomAround(vp, wheelZoomFactor(e), px, py, minZoom, maxZoom);
    } else next = panBy(vp, dx, dy);
    if (next !== vp) setViewport(next);
  };

  // WebKit sur Mac (app de bureau) : le pincement du trackpad arrive en événements gesture, avec une échelle
  // cumulée depuis le début du geste. Sur iPad, le pincement des doigts passe déjà par les événements tactiles
  // (React Flow) : on ignore alors les gesture pour ne pas zoomer deux fois.
  let touches = 0;
  let lastScale = 1;
  const onTouch = (e: TouchEvent) => {
    touches = e.touches.length;
  };
  const onGestureStart = (e: Event) => {
    lastScale = 1;
    if (touches === 0 && onCanvas(e.target)) e.preventDefault();
  };
  const onGestureChange = (e: Event) => {
    const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
    if (touches > 0 || typeof g.scale !== "number" || !onCanvas(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const factor = g.scale / lastScale;
    lastScale = g.scale;
    const r = root.getBoundingClientRect();
    const [px, py] = typeof g.clientX === "number" && typeof g.clientY === "number" ? point(g.clientX, g.clientY) : [r.width / 2, r.height / 2];
    const vp = getViewport();
    const next = zoomAround(vp, factor, px, py, minZoom, maxZoom);
    if (next !== vp) setViewport(next);
  };

  root.addEventListener("wheel", onWheel, { capture: true, passive: false });
  root.addEventListener("touchstart", onTouch, { capture: true, passive: true });
  root.addEventListener("touchend", onTouch, { capture: true, passive: true });
  root.addEventListener("touchcancel", onTouch, { capture: true, passive: true });
  root.addEventListener("gesturestart", onGestureStart, { capture: true, passive: false } as AddEventListenerOptions);
  root.addEventListener("gesturechange", onGestureChange, { capture: true, passive: false } as AddEventListenerOptions);
  return () => {
    root.removeEventListener("wheel", onWheel, { capture: true });
    root.removeEventListener("touchstart", onTouch, { capture: true });
    root.removeEventListener("touchend", onTouch, { capture: true });
    root.removeEventListener("touchcancel", onTouch, { capture: true });
    root.removeEventListener("gesturestart", onGestureStart, { capture: true });
    root.removeEventListener("gesturechange", onGestureChange, { capture: true });
  };
}
