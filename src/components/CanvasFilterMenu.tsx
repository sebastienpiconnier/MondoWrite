// Bouton « Filtrer » du canevas : une case par type de carte (avec sa couleur), et « Tout afficher ».
// Les cartes des types décochés sont masquées, avec les fils qui les touchent. État d'affichage :
// rien n'est enregistré, rien n'entre dans l'historique d'annulation.

import { formOf } from "../pitch";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { narratorCounts } from "../pov";
import type { CardData } from "../types";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { filterActive } from "../canvasFilter";
import { typesFor, typeColor } from "../types";

const NO_NODES: readonly { id: string; data: CardData }[] = [];

export function CanvasFilterMenu() {
  const t = useT().filter;
  const { types: labels, kind } = useVocab();
  const film = useCosmos((s) => formOf(kind, s.pitch) === "film");
  const menuTypes = typesFor(kind, false, film);
  const filter = useCosmos((s) => s.filter);
  const [open, setOpen] = useState(false);
  const setFilterTypes = useCosmos((s) => s.setFilterTypes);
  const setFilterPov = useCosmos((s) => s.setFilterPov);
  const lang = useSettings((s) => s.lang);
  // Point de vue (1.13.0) : les narrateurs du projet, lus seulement menu ouvert.
  const nodes = useCosmos((s) => (open ? s.nodes : NO_NODES));
  const narrators = useMemo(() => {
    const counts = narratorCounts(nodes.map((n) => n.data));
    return nodes
      .filter((n) => counts.has(n.id))
      .map((n) => ({ id: n.id, name: n.data.title.trim() || t.untitled, n: counts.get(n.id)! }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, lang));
  }, [nodes, lang, t.untitled]);
  const clearFilter = useCosmos((s) => s.clearFilter);
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
          {menuTypes.map((type) => {
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
          {(narrators.length > 0 || filter.pov) && (
            <label className="canvas-filter-pov">
              <span>{t.povLabel}</span>
              <select value={filter.pov ?? ""} onChange={(e) => setFilterPov(e.target.value || null)}>
                <option value="">{t.povAll}</option>
                {narrators.map((x) => (
                  <option key={x.id} value={x.id}>
                    {fmt(t.povOption, { name: x.name, n: x.n })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="canvas-filter-actions">
            <button type="button" className="ghost-button" disabled={!active} onClick={clearFilter}>
              {t.showAll}
            </button>
            <button type="button" className="ghost-button" disabled={menuTypes.every((x) => filter.types.includes(x))} onClick={() => setFilterTypes([...menuTypes])}>
              {t.hideAll}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
