// Recherche d'une carte par son titre ou son texte. Bouton loupe dans la barre du haut, ou
// Cmd/Ctrl+F. Choisir un résultat montre la carte sur le canevas.
// Avec un service d'IA local, un second mode « Par le sens » (SemanticSearch.tsx) trouve les passages
// qui parlent de la même chose, avec d'autres mots.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCommand } from "../commands";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { typeColor } from "../types";
import { useVocab } from "../vocab";
import { plainText, searchCards } from "../search";
import { sceneBody, sceneText } from "../screenplay/sceneText";
import { excerptOf } from "../ai/semantic";
import { fmt } from "../i18n";
import { goToHit, useCanSearchBySense, useSemanticSearch } from "./SemanticSearch";

/** Mode de la dernière recherche, gardé pour la session (l'auteur qui cherche par le sens y revient). */
let lastMode: "words" | "sense" = "words";

export function Search() {
  const { t, types } = useVocab();
  const s = t.search;
  const lang = useSettings((st) => st.lang);
  const nodes = useCosmos((st) => st.nodes);
  const revealCard = useCosmos((st) => st.revealCard);
  const [open, setOpen] = useState(false);
  // Barre des menus du Mac (Édition > Rechercher…).
  useCommand("search", () => setOpen(true));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = { panel: useId(), list: useId() };
  const senseOffered = useCanSearchBySense();
  const [modeChoice, setModeChoice] = useState(lastMode);
  const mode = senseOffered ? modeChoice : "words";
  const setMode = (m: "words" | "sense") => {
    lastMode = m;
    setModeChoice(m);
    setActive(0);
    inputRef.current?.focus();
  };
  const sense = useSemanticSearch(open && mode === "sense");
  const m = t.semantic;

  const manuscript = useCosmos((st) => st.manuscript);
  const screenplay = useCosmos((st) => st.screenplay);
  const kind = useCosmos((st) => st.kind);
  // Le texte des scènes (manuscrit d'un roman, scènes du scénario) : on y cherche aussi.
  const texts = useMemo(() => {
    if (!open) return {};
    const out: Record<string, string> = {};
    if (kind === "scenario") {
      const elements = screenplay?.elements ?? [];
      elements.forEach((el, i) => {
        if (el.type === "sceneHeading" && el.cardId) out[el.cardId] = sceneText(sceneBody(elements, i), lang);
      });
    } else {
      for (const [id, html] of Object.entries(manuscript)) out[id] = plainText(html);
    }
    return out;
  }, [open, kind, screenplay, manuscript, lang]);
  const results = useMemo(
    () => (open && mode === "words" ? searchCards(nodes.map((n) => n.data), query, lang, 20, texts) : []),
    [open, mode, nodes, query, lang, texts],
  );
  // Liste affichée : résultats par les mots, ou passages par le sens (calculés sur Entrée ou « Chercher »).
  const senseFresh = sense.status.step === "done" && sense.status.query === query;
  const count = mode === "words" ? results.length : senseFresh ? sense.hits.length : 0;

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
    setActive(0);
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
    // Trouvé dans le texte d'une scène : on ouvre ce texte (vue Manuscrit ou Scénario) sur cette scène.
    if (results.find((r) => r.id === id)?.inText) {
      useCosmos.getState().openInManuscript(id);
      return;
    }
    revealCard(id);
    useCosmos.getState().setSpotlight(id);
  };
  const chooseHit = (i: number) => {
    const hit = sense.hits[i];
    if (!hit) return;
    close(false);
    goToHit(hit);
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
          {senseOffered && (
            <div className="search-modes" role="group" aria-label={m.modes}>
              {(["words", "sense"] as const).map((value) => (
                <button key={value} type="button" className={`search-mode${mode === value ? " is-on" : ""}`} aria-pressed={mode === value} onClick={() => setMode(value)}>
                  {value === "words" ? m.modeWords : m.modeSense}
                </button>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="search"
            className="search-input"
            value={query}
            placeholder={mode === "sense" ? m.placeholder : s.placeholder}
            aria-label={s.button}
            role="combobox"
            aria-expanded={count > 0}
            aria-controls={ids.list}
            aria-activedescendant={active < count ? `${ids.list}-${active}` : undefined}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                if (count > 0) setActive((active + (e.key === "ArrowDown" ? 1 : -1) + count) % count);
              } else if (e.key === "Enter" && mode === "sense") {
                // Par le sens : Entrée lance la recherche ; sur une liste à jour, elle ouvre le passage choisi.
                e.preventDefault();
                if (senseFresh && sense.hits[active]) chooseHit(active);
                else if (!sense.busy) {
                  setActive(0);
                  void sense.run(query);
                }
              } else if (e.key === "Enter" && results[active]) {
                choose(results[active].id);
              } else if (e.key === "Escape") {
                e.stopPropagation();
                close(true);
              }
            }}
          />
          {mode === "sense" && (
            <div className="search-sense-bar">
              {sense.busy ? (
                <button type="button" className="ghost-button" onClick={sense.cancel}>
                  {m.cancel}
                </button>
              ) : (
                <button type="button" className="ghost-button" disabled={!query.trim()} onClick={() => { setActive(0); void sense.run(query); }}>
                  {m.go}
                </button>
              )}
            </div>
          )}
          {mode === "words" ? (
            <ul className="search-results" id={ids.list} role="listbox" aria-label={s.results}>
              {results.map((r, i) => (
                <li key={r.id} id={`${ids.list}-${i}`} role="option" aria-selected={i === active}>
                  <button type="button" className={`search-result${i === active ? " is-active" : ""}`} tabIndex={-1} onClick={() => choose(r.id)}>
                    <span className="search-result-head">
                      <span className="card-dot" style={{ background: typeColor(r.type) }} />
                      <span className="search-result-type">{types[r.type].label}</span>
                      <span className="search-result-title">{r.title || t.bible.untitled}</span>
                      {r.inText && <span className="search-result-type">{s.inText}</span>}
                    </span>
                    {r.excerpt && <span className="search-result-text">{r.excerpt}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="search-results" id={ids.list} role="listbox" aria-label={m.results}>
              {senseFresh &&
                sense.hits.map((hit, i) => {
                  const c = hit.chunk;
                  const inText = c.kind !== "card";
                  return (
                    <li key={c.key} id={`${ids.list}-${i}`} role="option" aria-selected={i === active}>
                      <button type="button" className={`search-result${i === active ? " is-active" : ""}`} tabIndex={-1} onClick={() => chooseHit(i)}>
                        <span className="search-result-head">
                          <span className="card-dot" style={{ background: typeColor(c.type) }} />
                          <span className="search-result-type">{types[c.type].label}</span>
                          <span className="search-result-title">{c.label || (c.type === "scene" ? m.untitledScene : t.bible.untitled)}</span>
                          {inText && <span className="search-result-type">{c.kind === "screenplay" ? m.inScreenplay : m.inManuscript}</span>}
                        </span>
                        <span className="search-result-text">{excerptOf(c.kind === "screenplay" && c.label ? c.text.slice(c.label.length) : c.kind === "card" && c.label ? c.text.slice(c.label.length) || c.text : c.text)}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
          {/* Annoncé aux lecteurs d'écran à chaque frappe (ou à chaque étape de la recherche par le sens). */}
          <p className="settings-hint" role="status">
            {mode === "words"
              ? query.trim() === "" ? s.prompt : results.length === 0 ? s.empty : ""
              : sense.status.step === "indexing"
                ? fmt(m.indexing, { done: sense.status.done, total: sense.status.total })
                : sense.status.step === "searching"
                  ? m.searching
                  : sense.status.step === "message"
                    ? sense.status.text
                    : senseFresh && sense.hits.length === 0
                      ? m.empty
                      : !sense.ready
                        ? m.noModel
                        : senseFresh ? "" : m.prompt}
          </p>
          {mode === "sense" && sense.status.step === "indexing" && (
            <progress className="search-progress" max={sense.status.total} value={sense.status.done} aria-hidden="true" />
          )}
        </div>
      )}
    </div>
  );
}
