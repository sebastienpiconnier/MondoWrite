// Bouton « Nouvelle carte » du canevas, en deux parties : le bouton crée une Idée (comme la touche N),
// la flèche ouvre le menu de tous les types de carte (libellés du vocabulaire du projet : Décor dans un
// scénario). Image ouvre la fenêtre Photos (photo libre ou image de l'appareil), Document le choix d'un PDF.
// Menu au clavier (flèches, Début, Fin, Échap), à la souris et au doigt.

import { useCosmos } from "../store";
import { formOf } from "../pitch";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useT } from "../i18n";
import { useVocab } from "../vocab";
import { typesFor, typeColor, type CardType } from "../types";

/** Types qui ouvrent une fenêtre avant de créer la carte : leur libellé finit par « … ». */
const ASKS: CardType[] = ["image", "document"];

export function NewCardMenu({ onCreate }: { onCreate: (type: CardType) => void }) {
  const t = useT().toile;
  const { types, kind } = useVocab();
  const film = useCosmos((s) => formOf(kind, s.pitch) === "film");
  const menuTypes = typesFor(kind, false, film);
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

  const choose = (type: CardType) => {
    close(false);
    onCreate(type);
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
      <button
        ref={toggleRef}
        type="button"
        className="add-card-main"
        aria-label={t.addCard}
        title={t.addCard}
        aria-keyshortcuts="N"
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
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open && (
        <div id={menuId} className="add-card-menu" role="menu" aria-label={t.addCardMore} onKeyDown={onMenuKey}>
          {menuTypes.map((type, i) => (
            <button
              key={type}
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="add-card-item"
              onClick={() => choose(type)}
            >
              <span className="add-card-dot" style={{ background: typeColor(type) }} aria-hidden="true" />
              <span className="add-card-text">
                <span className="add-card-label">
                  {types[type].label}
                  {ASKS.includes(type) ? "…" : ""}
                </span>
                {type in t.newCard && <span className="add-card-hint">{t.newCard[type as keyof typeof t.newCard]}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
