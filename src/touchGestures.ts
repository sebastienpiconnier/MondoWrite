// Gestes au doigt des vues d'écriture (Manuscrit, Scénario) et de la Bible (iPhone, iPad) : écarter deux doigts
// entre en mode focus, les pincer en sort ; glisser un doigt de côté ouvre ou ferme les volets. Les décisions sont
// des fonctions pures (testées) ; `attachTouchGestures` les branche sur un élément.

import { scrollableUnder } from "./canvasWheel";

/** Écart relatif et absolu à franchir pour qu'un geste à deux doigts compte (un léger tremblement ne fait rien). */
export const PINCH_RATIO = 1.3;
export const PINCH_MIN_PX = 40;
/** Glisser : assez long, surtout horizontal, et assez vif (un glisser lent est une sélection ou une lecture). */
export const SWIPE_MIN_PX = 60;
export const SWIPE_MAX_MS = 600;

export type Pinch = "spread" | "pinch";
export type Swipe = "left" | "right";

/** Deux doigts : « spread » s'ils se sont écartés, « pinch » s'ils se sont rapprochés, sinon rien encore. */
export function pinchKind(startDist: number, dist: number): Pinch | null {
  if (startDist <= 0) return null;
  if (dist - startDist >= PINCH_MIN_PX && dist / startDist >= PINCH_RATIO) return "spread";
  if (startDist - dist >= PINCH_MIN_PX && startDist / dist >= PINCH_RATIO) return "pinch";
  return null;
}

/** Un doigt : vers la droite ou la gauche (sens où va le doigt), sinon rien. */
export function swipeDir(dx: number, dy: number, ms: number): Swipe | null {
  if (ms > SWIPE_MAX_MS || Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < 2 * Math.abs(dy)) return null;
  return dx > 0 ? "right" : "left";
}

/** Volets de la vue : ouverts ou non ; `right` absent quand la vue n'en a pas à droite (Bible). */
export interface SidePanels {
  left: boolean;
  right?: boolean;
}

/**
 * Le volet qui bouge, comme un tiroir qu'on tire ou qu'on repousse : vers la droite, on referme le volet de droite
 * s'il est ouvert, sinon on tire celui de gauche ; vers la gauche, l'inverse.
 */
export function panelAfterSwipe(dir: Swipe, panels: SidePanels): { side: "left" | "right"; open: boolean } | null {
  const hasRight = panels.right !== undefined;
  if (dir === "right") {
    if (hasRight && panels.right) return { side: "right", open: false };
    if (!panels.left) return { side: "left", open: true };
    return null;
  }
  if (panels.left) return { side: "left", open: false };
  if (hasRight && !panels.right) return { side: "right", open: true };
  return null;
}

/** Ce qui garde ses gestes : listes déroulantes, menus, la barre d'éléments et le ruban. Un champ de texte ne garde le
 *  geste que s'il a le focus (on y sélectionne du texte) : la Bible en est couverte (couverture, titres, fiches), et un
 *  glisser qui partait d'un champ y était perdu. */
const OWN_TOUCH = "select, [role='menu'], [role='dialog'], .sp-bar, .ms-meta, .ribbon";
const FIELD = "input, textarea, [contenteditable='true']";

export interface GestureHandlers {
  onPinch?: (kind: Pinch) => void;
  onSwipe?: (dir: Swipe) => void;
}

/** Branche les gestes sur `root` ; rend la fonction qui les retire. Lit les gestionnaires à chaque geste. */
export function attachTouchGestures(root: HTMLElement, get: () => GestureHandlers): () => void {
  let start: { x: number; y: number; t: number; target: EventTarget | null } | null = null;
  let startDist = 0;
  let pinchDone = false;

  const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);

  // Le glisser se décide pendant le geste, dès qu'il a assez avancé : iOS ne livre pas toujours la fin du toucher
  // (touchcancel quand la page commence à défiler).
  const trySwipe = (x: number, y: number) => {
    const s = start;
    if (!s || !get().onSwipe) return;
    const dx = x - s.x;
    const dy = y - s.y;
    const dir = swipeDir(dx, dy, Date.now() - s.t);
    if (!dir) return;
    start = null;
    const el = s.target instanceof Element ? s.target : s.target instanceof Node ? s.target.parentElement : null;
    if (el?.closest(OWN_TOUCH)) return;
    const field = el?.closest(FIELD);
    if (field && field.contains(document.activeElement)) return;
    // Une sélection de texte en cours, ou un contenu qui défile de côté (page agrandie) : le geste est à eux.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && root.contains(sel.anchorNode)) return;
    if (scrollableUnder(s.target, root, -dx, 0)) return;
    get().onSwipe?.(dir);
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: Date.now(), target: e.target };
      pinchDone = false;
    } else {
      start = null;
      if (e.touches.length === 2) {
        startDist = dist(e);
        pinchDone = false;
      }
    }
  };

  const onMove = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      trySwipe(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    if (e.touches.length !== 2 || pinchDone || !get().onPinch) return;
    // Deux doigts : ni zoom de la page ni défilement pendant le geste.
    if (e.cancelable) e.preventDefault();
    const kind = pinchKind(startDist, dist(e));
    if (kind) {
      pinchDone = true;
      get().onPinch?.(kind);
    }
  };

  const onEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    if (t && e.touches.length === 0) trySwipe(t.clientX, t.clientY);
    if (e.touches.length === 0) start = null;
  };
  const onCancel = () => {
    start = null;
  };

  root.addEventListener("touchstart", onStart, { passive: true });
  root.addEventListener("touchmove", onMove, { passive: false });
  root.addEventListener("touchend", onEnd, { passive: true });
  root.addEventListener("touchcancel", onCancel, { passive: true });
  return () => {
    root.removeEventListener("touchstart", onStart);
    root.removeEventListener("touchmove", onMove);
    root.removeEventListener("touchend", onEnd);
    root.removeEventListener("touchcancel", onCancel);
  };
}
