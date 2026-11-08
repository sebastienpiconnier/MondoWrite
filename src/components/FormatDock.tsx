// Barre de mise en forme collée au clavier virtuel, sur un téléphone tactile (à la place de la bulle au-dessus de la
// sélection, voir FormatBar.tsx). Elle paraît tant que l'éditeur a le focus, se pose sur le clavier (`--keyboard-h`,
// keyboard.ts) et défile de côté : tous les boutons restent atteignables, et le menu du système (Couper, Copier,
// Coller…) garde sa place au-dessus de la sélection.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { hiddenCaret, rowEdges } from "../formatDock";
import { useT } from "../i18n";

/** Chevron dessiné en trait d'encre (comme `.disclosure`), vers la droite ; retourné pour la gauche. */
const CHEVRON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
);

/**
 * Où poser la barre : dans la fenêtre ouverte qui contient l'éditeur (une fenêtre native est au premier plan, une
 * barre restée dans <body> passerait dessous), sinon dans <body> (une carte du canevas est dans le zoom de React Flow,
 * où `position: fixed` ne vaudrait plus pour l'écran).
 */
function hostOf(editor: Editor): HTMLElement {
  return editor.view.dom.closest<HTMLElement>("dialog[open]") ?? document.body;
}

/** Premier parent qui défile en hauteur, ou null (c'est alors la page). */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** Fait remonter le texte si le curseur passe sous la barre (le système ne le garde qu'au-dessus du clavier). */
function keepCaretAbove(editor: Editor, dock: HTMLElement | null) {
  if (!dock || editor.isDestroyed) return;
  let bottom: number;
  try {
    bottom = editor.view.coordsAtPos(editor.state.selection.head).bottom;
  } catch {
    return;
  }
  const delta = hiddenCaret(bottom, dock.getBoundingClientRect().top);
  if (delta === 0) return;
  const scroller = scrollerOf(editor.view.dom);
  if (scroller) scroller.scrollBy({ top: delta });
  else window.scrollBy({ top: delta });
}

/** `panel` : ce qui s'ouvre au-dessus des boutons (variantes de l'Atelier) ; `children` : la rangée de boutons. */
export function FormatDock({ editor, panel, children }: { editor: Editor; panel?: ReactNode; children: ReactNode }) {
  const f = useT().format;
  const [host, setHost] = useState<HTMLElement | null>(() => (editor.isFocused ? hostOf(editor) : null));
  const [edges, setEdges] = useState({ before: false, more: false });
  const dock = useRef<HTMLDivElement>(null);
  const toolbar = () => dock.current?.querySelector<HTMLElement>("[role=toolbar]") ?? null;
  // Une flèche fait défiler la rangée d'un écran presque entier ; le texte garde le focus (clavier ouvert).
  const slide = (dir: 1 | -1) => {
    const bar = toolbar();
    bar?.scrollBy({ left: dir * Math.max(88, bar.clientWidth - 88), behavior: "smooth" });
  };

  useEffect(() => {
    const onFocus = () => setHost(hostOf(editor));
    const onBlur = () => setHost(null);
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    return () => {
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
    };
  }, [editor]);

  useEffect(() => {
    if (!host) return;
    // Les vues gardent la hauteur de la barre en marge du bas (phone.css), comme celle du clavier.
    const root = document.documentElement;
    root.dataset.formatDock = "open";
    // Des boutons hors de l'écran : une flèche de ce côté-là, pour dire que la rangée défile (et y aller au doigt).
    const bar = toolbar();
    const more = () => {
      if (!bar) return;
      const next = rowEdges(bar.scrollLeft, bar.clientWidth, bar.scrollWidth);
      setEdges((e) => (e.before === next.before && e.more === next.more ? e : next));
    };
    let frame = 0;
    const keep = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        keepCaretAbove(editor, dock.current);
        more(); // une sélection ajoute ou retire des boutons
      });
    };
    editor.on("selectionUpdate", keep);
    window.visualViewport?.addEventListener("resize", keep);
    keep();
    bar?.addEventListener("scroll", more, { passive: true });
    const sizes = typeof ResizeObserver !== "undefined" && bar ? new ResizeObserver(more) : null;
    if (bar) sizes?.observe(bar);
    more();
    return () => {
      cancelAnimationFrame(frame);
      editor.off("selectionUpdate", keep);
      window.visualViewport?.removeEventListener("resize", keep);
      bar?.removeEventListener("scroll", more);
      sizes?.disconnect();
      delete root.dataset.formatDock;
    };
  }, [host, editor]);

  if (!host) return null;
  return createPortal(
    <div ref={dock} className={`format-bar format-dock nodrag nopan${edges.more ? " has-more" : ""}${edges.before ? " has-before" : ""}`}>
      {panel}
      <div className="format-dock-row">
        {children}
        {edges.before && (
          <button type="button" className="format-dock-arrow is-back" aria-label={f.scrollBack} title={f.scrollBack} onPointerDown={(e) => e.preventDefault()} onClick={() => slide(-1)}>
            {CHEVRON}
          </button>
        )}
        {edges.more && (
          <button type="button" className="format-dock-arrow is-more" aria-label={f.scrollMore} title={f.scrollMore} onPointerDown={(e) => e.preventDefault()} onClick={() => slide(1)}>
            {CHEVRON}
          </button>
        )}
      </div>
    </div>,
    host,
  );
}
