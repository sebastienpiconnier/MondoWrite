// Bouton « Nouvelle carte » du canevas, en deux parties : le bouton crée une Idée (comme la touche N),
// la flèche ouvre le menu des autres façons de créer une carte : Lien, Document PDF, Photo libre,
// Image de l'appareil. Menu au clavier (flèches, Début, Fin, Échap), à la souris et au doigt.

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useT } from "../i18n";
import { typeColor, type CardType } from "../types";

export type NewCardKind = "idee" | "lien" | "document" | "photo" | "image";

const ITEMS: { kind: NewCardKind; type: CardType }[] = [
  { kind: "idee", type: "idee" },
  { kind: "lien", type: "lien" },
  { kind: "document", type: "document" },
  { kind: "photo", type: "image" },
  { kind: "image", type: "image" },
];

export function NewCardMenu({ onCreate }: { onCreate: (kind: NewCardKind) => void }) {
  const t = useT().toile;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemsRef.current[0]?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) toggleRef.current?.focus();
  };

  const choose = (kind: NewCardKind) => {
    close(false);
    onCreate(kind);
  };

  const onMenuKey = (e: ReactKeyboardEvent) => {
    const items = itemsRef.current.filter((b): b is HTMLButtonElement => !!b);
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.stopPropagation();
      close(e.key === "Escape");
      if (e.key === "Tab") return;
    } else return;
    e.preventDefault();
  };

  return (
    <div className="add-card" ref={rootRef}>
      <button type="button" className="add-card-main" title={t.addCardHint} aria-keyshortcuts="N" onClick={() => onCreate("idee")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {t.addCard}
      </button>
      <button
        ref={toggleRef}
        type="button"
        className="add-card-more"
        aria-label={t.addCardMore}
        title={t.addCardMore}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={open ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"} />
        </svg>
      </button>
      {open && (
        <div id={menuId} className="add-card-menu" role="menu" aria-label={t.addCardMore} onKeyDown={onMenuKey}>
          {ITEMS.map((item, i) => (
            <button
              key={item.kind}
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="add-card-item"
              onClick={() => choose(item.kind)}
            >
              <span className="add-card-dot" style={{ background: typeColor(item.type) }} aria-hidden="true" />
              <span className="add-card-text">
                <span className="add-card-label">{t.newCard[item.kind].label}</span>
                <span className="add-card-hint">{t.newCard[item.kind].hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
