// Menu du clic droit sur le fond du canevas (#146) : il ne crée plus de carte d'un seul geste (ceux qui
// attendent un menu au clic droit en créaient sans le vouloir). Premier choix « Nouvelle carte ici », puis les
// types les plus courants, puis Coller (seulement des cartes copiées dans MondoWrite : lire le presse-papiers
// du système demanderait une permission), Organiser et Tout voir. Posé au point du clic, dans la fenêtre ;
// clavier (flèches, Début, Fin, Échap), souris et doigt, comme `MoreMenu`.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { portalRoot } from "./portalRoot";

export interface PaneMenuItem {
  label: string;
  onSelect: () => void;
  /** Un filet avant cet élément : il commence un nouveau groupe. */
  rule?: boolean;
  hint?: string;
}

const MENU_WIDTH = 240;
const ITEM_HEIGHT = 44;

export function PaneMenu({ x, y, label, items, onClose }: { x: number; y: number; label: string; items: PaneMenuItem[]; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; max: number } | null>(null);
  const before = useRef<Element | null>(document.activeElement);

  useLayoutEffect(() => {
    const viewW = window.visualViewport?.width ?? window.innerWidth;
    const viewH = window.visualViewport?.height ?? window.innerHeight;
    const height = items.length * ITEM_HEIGHT + 24;
    const left = Math.max(8, Math.min(x, viewW - MENU_WIDTH - 8));
    // Sous le pointeur s'il tient, sinon au-dessus, sinon contre le bas de la fenêtre (et il défile).
    const top = y + height + 8 <= viewH ? y : y - height >= 8 ? y - height : Math.max(8, viewH - height - 8);
    setPlace({ left, top, max: viewH - top - 8 });
  }, [x, y, items.length]);

  useEffect(() => {
    if (place) menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
  }, [place]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const close = () => onClose();
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", close);
    // En capture : le canevas arrête la molette avant qu'elle ne remonte jusqu'à la fenêtre.
    window.addEventListener("wheel", close, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close, { capture: true });
    };
  }, [onClose]);

  const onKey = (e: ReactKeyboardEvent) => {
    const all = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") all[(at + 1) % all.length]?.focus();
    else if (e.key === "ArrowUp") all[(at - 1 + all.length) % all.length]?.focus();
    else if (e.key === "Home") all[0]?.focus();
    else if (e.key === "End") all[all.length - 1]?.focus();
    else if (e.key === "Escape" || e.key === "Tab") {
      onClose();
      if (e.key === "Escape" && before.current instanceof HTMLElement) before.current.focus();
      if (e.key === "Tab") return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  if (!place) return null;
  return createPortal(
    <div
      ref={menuRef}
      className="more-menu pane-menu nodrag nowheel"
      role="menu"
      aria-label={label}
      style={{ left: place.left, top: place.top, width: MENU_WIDTH, maxHeight: place.max }}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, k) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={item.rule && k > 0 ? "has-rule" : ""}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          <span>{item.label}</span>
          {item.hint && <kbd>{item.hint}</kbd>}
        </button>
      ))}
    </div>,
    portalRoot(null),
  );
}
