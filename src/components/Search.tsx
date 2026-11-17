// Recherche dans le projet. Bouton loupe dans la barre du haut, ou Cmd/Ctrl+F. Elle suit la vue et n'en change
// jamais (#85) : sur le canevas, les cartes (et le texte des scènes), montrées sur le canevas ; dans la Bible, les
// fiches ; dans le Plan, les scènes ; dans le Manuscrit et le Scénario, chaque passage du texte, sélectionné au
// milieu de l'écran.
// Avec un service d'IA local, un second mode « Par le sens » (SemanticSearch.tsx) trouve les passages
// qui parlent de la même chose, avec d'autres mots.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCommand } from "../commands";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { typeColor } from "../types";
import { useVocab } from "../vocab";
import { findPassages, plainText, searchCards, type TextUnit } from "../search";
import { sceneBody, sceneText } from "../screenplay/sceneText";
import { excerptOf } from "../ai/semantic";
import { openPalette } from "../commandList";
import { useKeyHint } from "./MoreMenu";
import { fmt } from "../i18n";
import { goToHit, useCanSearchBySense, useSemanticSearch } from "./SemanticSearch";
import { SCENE_AT } from "../store";
import { bookOrder } from "../book";
import { htmlParagraphs } from "../cardText";
import { sceneSynopsis } from "../screenplay/scenes";
import { isEditableType } from "../screenplay/editor/nodes";
import { revealPlanRow } from "./revealRow";
import type { SemanticHit } from "../ai/semantic";

/** Mode de la dernière recherche, gardé pour la session (l'auteur qui cherche par le sens y revient). */
let lastMode: "words" | "sense" = "words";

export function Search() {
  const { t, types } = useVocab();
  const key = useKeyHint();
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
  const plan = useCosmos((st) => st.plan);
  const rawView = useCosmos((st) => st.view);
  // La vue où l'on cherche (l'ancienne vue « carnet » est le canevas).
  const where = rawView === "carnet" ? "toile" : rawView;
  const inWriting = where === "manuscrit";

  // Synopsis des scènes (Bible et Plan) : fiche d'un roman, ligne « = » du Fountain d'un scénario.
  const synopses = useMemo(() => {
    const out: Record<string, string> = {};
    if (!open || (where !== "bible" && where !== "plan")) return out;
    if (kind === "scenario") {
      const elements = screenplay?.elements ?? [];
      elements.forEach((el, i) => {
        if (el.type === "sceneHeading" && el.cardId) out[el.cardId] = sceneSynopsis(elements, i);
      });
    } else {
      for (const n of nodes) if (n.data.type === "scene" && n.data.fiche?.synopsis) out[n.id] = n.data.fiche.synopsis;
    }
    return out;
  }, [open, where, kind, screenplay, nodes]);

  // Le texte des scènes (manuscrit d'un roman, scènes du scénario) : le canevas et le Plan y cherchent aussi.
  const texts = useMemo(() => {
    const out: Record<string, string> = {};
    if (!open || (where !== "toile" && where !== "plan")) return out;
    if (kind === "scenario") {
      const elements = screenplay?.elements ?? [];
      elements.forEach((el, i) => {
        if (el.type === "sceneHeading" && el.cardId) out[el.cardId] = sceneText(sceneBody(elements, i), lang);
      });
    } else {
      for (const [id, html] of Object.entries(manuscript)) out[id] = plainText(html);
    }
    if (where === "plan") for (const [id, text] of Object.entries(synopses)) out[id] = `${text} ${out[id] ?? ""}`;
    return out;
  }, [open, where, kind, screenplay, manuscript, lang, synopses]);

  // Cartes cherchées : toutes (canevas, Bible), les scènes seulement dans le Plan.
  const cards = useMemo(() => {
    const all = nodes.map((n) => n.data);
    return where === "plan" ? all.filter((c) => c.type === "scene") : all;
  }, [nodes, where]);
  const results = useMemo(
    () => (open && mode === "words" && !inWriting ? searchCards(cards, query, lang, 20, where === "bible" ? synopses : texts) : []),
    [open, mode, inWriting, cards, query, lang, where, synopses, texts],
  );

  // Manuscrit et Scénario : les scènes dans l'ordre du livre, leurs paragraphes (ou éléments) comme l'éditeur les montre.
  const units = useMemo((): TextUnit[] => {
    if (!open || !inWriting) return [];
    if (kind === "scenario") {
      const elements = screenplay?.elements ?? [];
      const out: TextUnit[] = [];
      let unit: TextUnit | null = null;
      elements.forEach((el, i) => {
        // Une scène va de son en-tête au suivant ; le texte d'avant la première scène a sa propre entrée.
        if (el.type === "sceneHeading" || !unit) {
          unit = { target: `${SCENE_AT}${i}`, title: el.type === "sceneHeading" ? el.text.trim() || m.untitledScene : "", texts: [] };
          out.push(unit);
        }
        if (isEditableType(el.type) && el.text.trim()) unit.texts.push(el.text);
      });
      return out;
    }
    const titles = new Map(nodes.map((n) => [n.id, n.data.title.trim()]));
    return bookOrder(nodes, plan).flatMap((id) => (manuscript[id] ? [{ target: id, title: titles.get(id) || m.untitledScene, texts: htmlParagraphs(manuscript[id]) }] : []));
  }, [open, inWriting, kind, screenplay, nodes, plan, manuscript, m.untitledScene]);
  const passages = useMemo(() => (mode === "words" && inWriting ? findPassages(units, query) : []), [mode, inWriting, units, query]);

  // Par le sens : les passages du texte dans le Manuscrit et le Scénario, les scènes dans le Plan, tout ailleurs.
  const senseHits = useMemo(
    () =>
      sense.hits.filter((hit) =>
        inWriting ? hit.chunk.kind !== "card" : where === "plan" ? hit.chunk.type === "scene" && !!hit.chunk.cardId : !!hit.chunk.cardId,
      ),
    [sense.hits, inWriting, where],
  );

  // Liste affichée : résultats par les mots, ou passages par le sens (calculés sur Entrée ou « Chercher »).
  const senseFresh = sense.status.step === "done" && sense.status.query === query;
  const count = mode === "words" ? (inWriting ? passages.length : results.length) : senseFresh ? senseHits.length : 0;

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
  /** Montre une carte dans la vue où l'on est, sans en changer (#85). */
  const showCard = (id: string) => {
    if (where === "bible") useCosmos.getState().openInBible(id);
    else if (where === "plan") revealPlanRow(id);
    else {
      // La carte trouvée est centrée et mise en avant : le reste du canevas s'estompe (Échap ou un clic sur le fond le rend).
      revealCard(id);
      useCosmos.getState().setSpotlight(id);
    }
  };
  const choose = (i: number) => {
    close(false);
    if (inWriting) {
      // Le passage dans le texte : la scène, puis la `nth` occurrence du mot, sélectionnée au milieu de l'écran.
      const p = passages[i];
      if (p) useCosmos.getState().openInManuscript(p.target, query.trim(), undefined, p.nth);
      return;
    }
    const r = results[i];
    if (r) showCard(r.id);
  };
  const chooseHit = (i: number) => {
    const hit: SemanticHit | undefined = senseHits[i];
    if (!hit) return;
    close(false);
    if (inWriting) goToHit(hit);
    else if (hit.chunk.cardId) showCard(hit.chunk.cardId);
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
        aria-label={inWriting ? s.buttonText : s.button}
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
            aria-label={inWriting ? s.buttonText : s.button}
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
                if (senseFresh && senseHits[active]) chooseHit(active);
                else if (!sense.busy) {
                  setActive(0);
                  void sense.run(query);
                }
              } else if (e.key === "Enter" && active < count) {
                choose(active);
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
          {mode === "words" && inWriting ? (
            <ul className="search-results" id={ids.list} role="listbox" aria-label={s.resultsText}>
              {passages.map((p, i) => (
                <li key={`${p.target}:${p.nth}`} id={`${ids.list}-${i}`} role="option" aria-selected={i === active}>
                  <button type="button" className={`search-result${i === active ? " is-active" : ""}`} tabIndex={-1} onClick={() => choose(i)}>
                    <span className="search-result-head">
                      <span className="card-dot" style={{ background: typeColor("scene") }} />
                      <span className="search-result-title">{p.title || m.untitledScene}</span>
                    </span>
                    <span className="search-result-text">{p.excerpt}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : mode === "words" ? (
            <ul className="search-results" id={ids.list} role="listbox" aria-label={s.results}>
              {results.map((r, i) => (
                <li key={r.id} id={`${ids.list}-${i}`} role="option" aria-selected={i === active}>
                  <button type="button" className={`search-result${i === active ? " is-active" : ""}`} tabIndex={-1} onClick={() => choose(i)}>
                    <span className="search-result-head">
                      <span className="card-dot" style={{ background: typeColor(r.type) }} />
                      <span className="search-result-type">{types[r.type].label}</span>
                      <span className="search-result-title">{r.title || t.bible.untitled}</span>
                      {r.inText && where !== "bible" && <span className="search-result-type">{s.inText}</span>}
                    </span>
                    {r.excerpt && <span className="search-result-text">{r.excerpt}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="search-results" id={ids.list} role="listbox" aria-label={m.results}>
              {senseFresh &&
                senseHits.map((hit, i) => {
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
              ? query.trim() === ""
                ? inWriting ? s.promptText : where === "bible" ? s.promptBible : where === "plan" ? s.promptPlan : s.prompt
                : count > 0 ? "" : inWriting ? s.emptyText : where === "plan" ? s.emptyScenes : s.empty
              : sense.status.step === "indexing"
                ? fmt(m.indexing, { done: sense.status.done, total: sense.status.total })
                : sense.status.step === "searching"
                  ? m.searching
                  : sense.status.step === "message"
                    ? sense.status.text
                    : senseFresh && senseHits.length === 0
                      ? m.empty
                      : !sense.ready
                        ? m.noModel
                        : senseFresh ? "" : m.prompt}
          </p>
          {mode === "sense" && sense.status.step === "indexing" && (
            <progress className="search-progress" max={sense.status.total} value={sense.status.done} aria-hidden="true" />
          )}
          {/* Palette de commandes (#26) : son chemin à la souris et au doigt, Cmd/Ctrl + K au clavier. */}
          <p className="search-commands">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setOpen(false);
                openPalette();
              }}
            >
              {t.palette.open}
            </button>{" "}
            <kbd>{key("Mod", "K")}</kbd>
          </p>
        </div>
      )}
    </div>
  );
}
