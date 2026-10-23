// Bouton « Filtrer » du canevas : une case par type de carte (avec sa couleur), et « Tout afficher ».
// Les cartes des types décochés sont masquées, avec les fils qui les touchent. État d'affichage :
// rien n'est enregistré, rien n'entre dans l'historique d'annulation.

import { useEffect, useId, useRef, useState } from "react";
import { useT } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { filterActive } from "../canvasFilter";
import { CARD_TYPES, typeColor } from "../types";

export function CanvasFilterMenu() {
  const t = useT().filter;
  const { types: labels } = useVocab();
  const filter = useCosmos((s) => s.filter);
  const setFilterTypes = useCosmos((s) => s.setFilterTypes);
  const clearFilter = useCosmos((s) => s.clearFilter);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const active = filterActive(filter);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="canvas-filter" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`icon-button has-label${active ? " is-on" : ""}`}
        // Le bandeau « Filtre actif » n'existe pas sur téléphone : le nom du bouton le dit (et l'entonnoir est plein).
        aria-label={active ? t.buttonActive : t.button}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={t.hint}
        onClick={() => setOpen(!open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16l-6.2 7.4V19l-3.6-2v-4.6z" />
        </svg>
        <span className="tool-label" aria-hidden="true">{t.short}</span>
      </button>
      {open && (
        <div id={panelId} className="canvas-filter-panel" role="group" aria-label={t.button}>
          <p className="canvas-filter-title">{t.title}</p>
          {CARD_TYPES.map((type) => {
            const shown = !filter.types.includes(type);
            return (
              <label key={type} className="canvas-filter-item">
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={() => setFilterTypes(shown ? [...filter.types, type] : filter.types.filter((x) => x !== type))}
                />
                <span className="add-card-dot" style={{ background: typeColor(type) }} aria-hidden="true" />
                {labels[type].label}
              </label>
            );
          })}
          <div className="canvas-filter-actions">
            <button type="button" className="ghost-button" disabled={!active} onClick={clearFilter}>
              {t.showAll}
            </button>
            <button type="button" className="ghost-button" disabled={CARD_TYPES.every((x) => filter.types.includes(x))} onClick={() => setFilterTypes([...CARD_TYPES])}>
              {t.hideAll}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
