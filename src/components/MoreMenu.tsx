// Menu « ⋯ » commun (1.11.1) : les actions secondaires d'une barre ou d'une ligne, pour n'afficher que l'essentiel
// (règles d'interface d'Apple : divulgation progressive ; même usage sous Windows, barre de commandes et « ⋯ »).
// Posé dans <body> (au-dessus de tout, même d'une colonne qui coupe ce qui dépasse), sous le bouton ou au-dessus
// s'il manque de place. Souris, doigt et clavier : flèches, Début, Fin, Échap rend le focus au bouton.
// Une action destructive (`danger`) est en rouge, en dernier, séparée des autres.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";
import { isAppleKeyboard } from "../platform";

export interface MoreItem {
  label: string;
  onSelect: () => void;
  /** Supprimer, mettre à la corbeille : en rouge, à la fin, après un filet. */
  danger?: boolean;
  disabled?: boolean;
  /** Raccourci affiché à droite (Ctrl ou Cmd + …), pour l'apprendre. */
  hint?: string;
  /** Infobulle. */
  title?: string;
}

const MENU_WIDTH = 240;

/** Raccourci à afficher dans un menu : « ⌘⇧H » sur un clavier Apple, « Ctrl+Maj+H » ailleurs. */
export function useKeyHint(): (...keys: ("Mod" | "Shift" | "Alt" | string)[]) => string {
  const t = useT();
  const apple = isAppleKeyboard();
  return (...keys) => {
    const names = keys.map((k) => (k === "Mod" ? (apple ? "⌘" : "Ctrl") : k === "Shift" ? (apple ? "⇧" : t.shortcuts.shift) : k === "Alt" ? (apple ? "⌥" : "Alt") : k));
    return apple ? names.join("") : names.join("+");
  };
}

export function MoreMenu({ items, label, className = "", icon }: { items: (MoreItem | false | null | undefined)[]; label?: string; className?: string; icon?: ReactNode }) {
  const t = useT();
  const name = label ?? t.app.moreActions;
  const list = items.filter((i): i is MoreItem => !!i);
  const ordered = [...list.filter((i) => !i.danger), ...list.filter((i) => i.danger)];
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const height = ordered.length * 44 + 24;
    const up = r.bottom + height > window.innerHeight && r.top > height;
    // Aligné sur le bord droit du bouton (il est le plus souvent au bout d'une barre), sans sortir de l'écran.
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    setPlace({ left, top: up ? r.top - 6 : r.bottom + 6, up });
  }, [open, ordered.length]);

  useEffect(() => {
    if (!open || !place) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", close);
    // En capture : le canevas arrête la molette avant qu'elle ne remonte jusqu'à la fenêtre.
    window.addEventListener("wheel", close, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close, { capture: true });
    };
  }, [open]);

  const onKey = (e: ReactKeyboardEvent) => {
    const all = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") all[(at + 1) % all.length]?.focus();
    else if (e.key === "ArrowUp") all[(at - 1 + all.length) % all.length]?.focus();
    else if (e.key === "Home") all[0]?.focus();
    else if (e.key === "End") all[all.length - 1]?.focus();
    else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      buttonRef.current?.focus();
      if (e.key === "Tab") return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  if (ordered.length === 0) return null;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`icon-button more-button nodrag ${className}`}
        aria-label={name}
        title={name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {icon ?? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5.5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="18.5" cy="12" r="1.8" />
          </svg>
        )}
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={menuRef}
            className={`more-menu nodrag nowheel${place.up ? " is-up" : ""}`}
            role="menu"
            aria-label={name}
            style={{ left: place.left, top: place.top, width: MENU_WIDTH }}
            onKeyDown={onKey}
          >
            {ordered.map((item, k) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                title={item.title}
                className={`${item.danger ? "is-danger" : ""}${item.danger && k > 0 && !ordered[k - 1].danger ? " has-rule" : ""}`}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span>{item.label}</span>
                {item.hint && <kbd>{item.hint}</kbd>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
