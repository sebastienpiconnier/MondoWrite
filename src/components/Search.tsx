// Recherche d'une carte par son titre ou son texte. Bouton loupe dans la barre du haut, ou
// Cmd/Ctrl+F. Choisir un résultat montre la carte sur le canevas.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { typeColor } from "../types";
import { useVocab } from "../vocab";
import { searchCards } from "../search";

export function Search() {
  const { t, types } = useVocab();
  const s = t.search;
  const lang = useSettings((st) => st.lang);
  const nodes = useCosmos((st) => st.nodes);
  const revealCard = useCosmos((st) => st.revealCard);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = { panel: useId(), list: useId() };

  const results = useMemo(
    () => (open ? searchCards(nodes.map((n) => n.data), query, lang) : []),
    [open, nodes, query, lang],
  );

  // Cmd/Ctrl+F ouvre la recherche, d'où que l'on soit dans le projet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  // La carte trouvée est centrée et mise en avant : le reste du canevas s'estompe (Échap ou un clic sur le fond le rend).
  const choose = (id: string) => {
    close(false);
    revealCard(id);
    useCosmos.getState().setSpotlight(id);
  };
  // Une nouvelle recherche rend tout le canevas.
  useEffect(() => {
    if (open) useCosmos.getState().setSpotlight(null);
  }, [open]);

  return (
    <div className="settings" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label={s.button}
        title={s.hint}
        aria-expanded={open}
        aria-controls={ids.panel}
        onClick={() => setOpen(!open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
      </button>

      {open && (
        <div className="settings-panel search-panel" id={ids.panel} role="search">
          <input
            ref={inputRef}
            type="search"
            className="search-input"
            value={query}
            placeholder={s.placeholder}
            aria-label={s.button}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={ids.list}
            aria-activedescendant={results[active] ? `${ids.list}-${active}` : undefined}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (results.length > 0) setActive((active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
              } else if (e.key === "Enter" && results[active]) {
                choose(results[active].id);
              } else if (e.key === "Escape") {
                e.stopPropagation();
                close(true);
              }
            }}
          />
          <ul className="search-results" id={ids.list} role="listbox" aria-label={s.results}>
            {results.map((r, i) => (
              <li key={r.id} id={`${ids.list}-${i}`} role="option" aria-selected={i === active}>
                <button type="button" className={`search-result${i === active ? " is-active" : ""}`} tabIndex={-1} onClick={() => choose(r.id)}>
                  <span className="search-result-head">
                    <span className="card-dot" style={{ background: typeColor(r.type) }} />
                    <span className="search-result-type">{types[r.type].label}</span>
                    <span className="search-result-title">{r.title || t.bible.untitled}</span>
                  </span>
                  {r.excerpt && <span className="search-result-text">{r.excerpt}</span>}
                </button>
              </li>
            ))}
          </ul>
          {/* Annoncé aux lecteurs d'écran à chaque frappe. */}
          <p className="settings-hint" role="status">
            {query.trim() === "" ? s.prompt : results.length === 0 ? s.empty : ""}
          </p>
        </div>
      )}
    </div>
  );
}
