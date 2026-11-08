// Barre de mise en forme collée au clavier virtuel, sur un téléphone tactile (à la place de la bulle au-dessus de la
// sélection, voir FormatBar.tsx). Elle paraît tant que l'éditeur a le focus, se pose sur le clavier (`--keyboard-h`,
// keyboard.ts) et défile de côté : tous les boutons restent atteignables, et le menu du système (Couper, Copier,
// Coller…) garde sa place au-dessus de la sélection.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { hiddenCaret } from "../formatDock";

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

export function FormatDock({ editor, children }: { editor: Editor; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(() => (editor.isFocused ? hostOf(editor) : null));
  const dock = useRef<HTMLDivElement>(null);

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
    // D'autres boutons à droite, hors de l'écran : le bord de la rangée s'estompe, pour dire qu'elle défile.
    const bar = dock.current?.querySelector<HTMLElement>("[role=toolbar]");
    const more = () => {
      if (bar) dock.current?.classList.toggle("has-more", bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2);
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
    <div ref={dock} className="format-bar format-dock nodrag nopan">
      {children}
    </div>,
    host,
  );
}
