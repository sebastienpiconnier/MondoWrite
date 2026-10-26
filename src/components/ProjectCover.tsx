// Couverture du projet, en tête de la Bible : comme une quatrième de couverture. À gauche, la jaquette
// (titre, tagline, auteur, pastilles) ; à droite, logline, résumé, comparables, volume, thèmes et note
// d'intention. Rien n'est obligatoire : une pastille vide est un simple « + Genre », un texte vide garde
// son texte indicatif. Le volume vient de l'objectif d'écriture, les thèmes des cartes Thème.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { useSettings } from "../settings";
import { NOVEL_CHIPS, PITCH_CHIPS, SERIES_TEXTS, chipSuggestions, pitchFields, pitchFilled, type PitchChip, type PitchText } from "../pitch";
import { CoverAssistant } from "./CoverAssistant";
import { countWords } from "../manuscript";
import { typeColor } from "../types";
import { episodeOrder } from "../episodes";
import { minutesFor, usePagination } from "./usePagination";

/** Pastille : montre la valeur, ou « + Genre ». Toucher ouvre les suggestions et une saisie libre. */
function Chip({ field }: { field: PitchChip }) {
  const { t, kind } = useVocab();
  const p = t.pitch;
  const value = useCosmos((s) => s.pitch[field]);
  const setPitch = useCosmos((s) => s.setPitch);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const label = p.fields[field];
  // Crédits et « d'après » n'ont pas de suggestions : saisie libre seulement.
  const suggest = p.suggest as Record<string, readonly string[] | undefined>;
  const list = (kind === "scenario" && field in p.suggestScenario ? p.suggestScenario[field as keyof typeof p.suggestScenario] : suggest[field]) ?? [];
  const suggestions = chipSuggestions(list, value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const choose = (next: string) => {
    setPitch(field, next.trim());
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="pitch-chip-wrap" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`pitch-chip${value ? " is-set" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={value ? fmt(p.chipAria, { field: label, value }) : fmt(p.addChipAria, { field: label })}
        onClick={() => {
          setDraft(value ?? "");
          setOpen(!open);
        }}
      >
        {value ? (
          <>
            <span className="pitch-chip-key">{label}</span>
            <span>{value}</span>
          </>
        ) : (
          fmt(p.addChip, { field: label })
        )}
      </button>
      {open && (
        <div className="pitch-chip-panel" id={panelId} role="group" aria-label={label}>
          <div className="pitch-chip-options">
            {suggestions.map((s) => (
              <button key={s} type="button" className="ghost-button" onClick={() => choose(s)}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="pitch-chip-other"
            onSubmit={(e) => {
              e.preventDefault();
              choose(draft);
            }}
          >
            <input
              type="text"
              value={draft}
              autoComplete="off"
              placeholder={p.chipOther}
              aria-label={fmt(p.chipOtherAria, { field: label })}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="ghost-button" disabled={!draft.trim()}>
              {p.chipOk}
            </button>
            {value && (
              <button type="button" className="link-button" onClick={() => choose("")}>
                {p.chipClear}
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

/** Texte de la couverture : une zone qui grandit avec ce qu'on écrit. */
function PitchArea({ field, className, hint }: { field: PitchText; className?: string; hint?: string }) {
  const { t } = useVocab();
  const value = useCosmos((s) => s.pitch[field] ?? "");
  const setPitch = useCosmos((s) => s.setPitch);
  const id = useId();
  return (
    <div className={`pitch-field ${className ?? ""}`}>
      <label htmlFor={id}>{t.pitch.fields[field]}</label>
      <textarea
        id={id}
        rows={1}
        value={value}
        placeholder={t.pitch.placeholders[field]}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => setPitch(field, e.target.value)}
      />
      {hint && (
        <p className="pitch-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** Volume : mots écrits et objectif (roman), pages et minutes (scénario). */
function Volume() {
  const { t, kind } = useVocab();
  const p = t.pitch;
  const lang = useSettings((s) => s.lang);
  const manuscript = useCosmos((s) => s.manuscript);
  const goal = useCosmos((s) => s.goals.total);
  const pagination = usePagination();
  const words = useMemo(() => Object.values(manuscript).reduce((sum, html) => sum + countWords(html), 0), [manuscript]);
  const num = (n: number) => new Intl.NumberFormat(lang).format(n);
  if (kind === "scenario") {
    const pages = pagination?.pages ?? 0;
    return (
      <div className="pitch-volume">
        <span className="pitch-key">{p.volume}</span>
        <span>{fmt(p.volumePages, { pages: num(pages), minutes: num(minutesFor(pages)) })}</span>
      </div>
    );
  }
  const pct = goal ? Math.min(100, Math.round((words / goal) * 100)) : 0;
  return (
    <div className="pitch-volume">
      <span className="pitch-key">{p.volume}</span>
      <span>{goal ? fmt(p.volumeGoal, { n: num(words), goal: num(goal) }) : fmt(p.volumeWords, { n: num(words) })}</span>
      {goal ? (
        <span className="pitch-bar" role="progressbar" aria-label={p.volume} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </span>
      ) : (
        <span className="pitch-hint">{p.volumeNoGoal}</span>
      )}
    </div>
  );
}

export function ProjectCover({ onOpenTheme, onAddTheme, onAddEpisode }: { onOpenTheme: (id: string) => void; onAddTheme: () => void; onAddEpisode: () => void }) {
  const { t, kind, types } = useVocab();
  const p = t.pitch;
  const title = useCosmos((s) => s.title);
  const setTitle = useCosmos((s) => s.setTitle);
  const pitch = useCosmos((s) => s.pitch);
  const nodes = useCosmos((s) => s.nodes);
  const author = useSettings((s) => s.author);
  const lang = useSettings((s) => s.lang);
  const themes = useMemo(
    () =>
      nodes
        .filter((n) => n.data.type === "theme")
        .map((n) => n.data)
        .sort((a, b) => a.title.localeCompare(b.title, lang)),
    [nodes, lang],
  );
  // Pas de point de vue ni de temps du récit pour un scénario (toujours au présent, caméra).
  const chips = PITCH_CHIPS.filter((c) => kind === "roman" || !(NOVEL_CHIPS as readonly string[]).includes(c));
  const episodes = useMemo(() => episodeOrder(nodes.map((n) => n.data)), [nodes]);
  const seriesFilled = SERIES_TEXTS.some((k) => pitch[k]?.trim()) || episodes.length > 0;
  const tagId = useId();

  // Hauteur du titre ajustée à son contenu (repli si `field-sizing` n'est pas pris en charge, WebKit).
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  return (
    <section className="cover" aria-label={p.aria}>
      <div className="cover-jacket">
        <div className="cover-kind">{t.kinds[kind]}</div>
        {/* Zone de texte d'une ligne qui grandit : un titre long passe à la ligne au lieu d'être coupé. */}
        <textarea
          ref={titleRef}
          className="cover-title"
          rows={1}
          value={title}
          placeholder={p.untitled}
          aria-label={p.titleAria}
          autoComplete="off"
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        <label className="sr-only" htmlFor={tagId}>
          {p.fields.tagline}
        </label>
        <textarea
          id={tagId}
          className="cover-tagline"
          rows={1}
          value={pitch.tagline ?? ""}
          placeholder={p.placeholders.tagline}
          onChange={(e) => useCosmos.getState().setPitch("tagline", e.target.value)}
        />
        {author.trim() && <div className="cover-author">{fmt(p.byAuthor, { author: author.trim() })}</div>}
        <div className="cover-chips">
          {chips.map((c) => (
            <Chip key={c} field={c} />
          ))}
        </div>
        <div className="cover-filled">{fmt(p.filled, { n: pitchFilled(pitch, kind), total: pitchFields(kind).length })}</div>
      </div>

      <div className="cover-back">
        <CoverAssistant />
        <PitchArea field="logline" className="is-logline" hint={p.loglineHint} />
        <PitchArea field="resume" />
        <PitchArea field="comps" />
        <Volume />
        <div className="pitch-themes">
          <span className="pitch-key">{p.themes}</span>
          <div className="pitch-theme-list">
            {themes.length === 0 && <span className="pitch-hint">{p.themesEmpty}</span>}
            {themes.map((card) => (
              <button
                key={card.id}
                type="button"
                className="chip pitch-theme"
                aria-label={fmt(p.openTheme, { title: card.title.trim() || t.bible.untitled })}
                onClick={() => onOpenTheme(card.id)}
              >
                <span className="card-dot" style={{ background: typeColor("theme") }} />
                {card.title.trim() || t.bible.untitled}
              </button>
            ))}
            <button type="button" className="link-button" onClick={onAddTheme}>
              <span className="card-dot" style={{ background: typeColor("theme") }} /> {fmt(t.bible.addType, { type: types.theme.label })}
            </button>
          </div>
        </div>
        <details className="pitch-intention" open={!!pitch.intention}>
          <summary>{p.fields.intention}</summary>
          <PitchArea field="intention" className="is-bare" />
        </details>
        {/* Bible de série : ce qui aide un producteur à y croire et un scénariste à rejoindre l'écriture. */}
        {kind === "scenario" && (
          <details className="pitch-intention pitch-series" open={seriesFilled}>
            <summary>{p.seriesTitle}</summary>
            <div className="pitch-series-body">
              <p className="pitch-hint">{p.seriesHint}</p>
              {SERIES_TEXTS.map((k) => (
                <div key={k} className="pitch-series-field">
                  <PitchArea field={k} />
                  {/* Les épisodes sont des cartes (lot 6) : la couverture dit où les trouver, après l'épisode type. */}
                  {k === "episodeType" && (
                    <div className="pitch-episodes">
                      <span className="pitch-key">{p.fields.episodes}</span>
                      <p className="pitch-hint">{episodes.length === 0 ? p.episodesNone : episodes.length === 1 ? p.episodesOne : fmt(p.episodesCount, { n: episodes.length })}</p>
                      <div className="pitch-theme-list">
                        {episodes.length > 0 && (
                          <button type="button" className="chip pitch-theme" onClick={() => onOpenTheme(episodes[0].id)}>
                            <span className="card-dot" style={{ background: typeColor("episode") }} />
                            {p.episodesOpen}
                          </button>
                        )}
                        <button type="button" className="link-button" onClick={onAddEpisode}>
                          <span className="card-dot" style={{ background: typeColor("episode") }} /> {p.episodesAdd}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
