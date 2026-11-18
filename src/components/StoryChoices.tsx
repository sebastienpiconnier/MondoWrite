// Roman interactif, lot 11 (#91) : sur le canevas, le bandeau d'une flèche de choix (texte, « Seulement si »,
// « Donne », la retirer) et « Ajouter un choix vers… » du menu ⋯ d'une carte Scène (clavier, doigt). Chaque geste
// écrit dans le bloc de choix de la scène (store : addChoiceTo, editChoiceAt) : le texte reste la seule source.

import { useEffect, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { END_TARGET, type ChoiceEdge } from "../interactive/choices";
import { ChoiceRules } from "./ChoiceRules";
import { useStoryMarks } from "../interactive/useStoryMap";
import { readMarksKey, type SceneMarks } from "../interactive/storyMap";

/** Demande venue du menu ⋯ d'une carte Scène, servie par le canevas. */
export type StoryChoiceAsk = { kind: "pick" | "after" | "end"; id: string };
export const STORY_CHOICE_EVENT = "story-choice";
export const askStoryChoice = (detail: StoryChoiceAsk) => window.dispatchEvent(new CustomEvent<StoryChoiceAsk>(STORY_CHOICE_EVENT, { detail }));

/** Bandeau d'une flèche choisie : son texte, et la retirer. */
export function EdgeEditor({ edge, onDone }: { edge: ChoiceEdge; onDone: () => void }) {
  const m = useT().interactive.map;
  const [label, setLabel] = useState(edge.label);
  const commit = () => {
    if (label !== edge.label) useCosmos.getState().editChoiceAt(edge.from, edge.index, { label, target: edge.target, cond: edge.cond, effects: edge.effects, hidden: edge.hidden });
  };
  return (
    <div className="choice-edge-editor">
      <label>
        <span>{m.edgeLabel}</span>
        <input
          type="text"
          value={label}
          maxLength={200}
          placeholder={m.defaultLabel}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              onDone();
            } else if (e.key === "Escape") onDone();
          }}
        />
      </label>
      <ChoiceRules line={{ ...edge, label }} n={edge.index + 1} onChange={(next) => useCosmos.getState().editChoiceAt(edge.from, edge.index, next)} />
      <button
        type="button"
        className="ghost-button is-danger"
        onClick={() => {
          useCosmos.getState().editChoiceAt(edge.from, edge.index, null);
          onDone();
        }}
      >
        {m.removeChoice}
      </button>
    </div>
  );
}

/** « Ajouter un choix vers… » : la liste des scènes, puis la fin. */
export function TargetPicker({ from, title, scenes, onClose }: { from: string; title: string; scenes: { id: string; title: string; rank: number }[]; onClose: () => void }) {
  const m = useT().interactive.map;
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const pick = (to: string) => {
    useCosmos.getState().addChoiceTo(from, to);
    onClose();
  };
  return (
    <div
      className="choice-picker"
      role="dialog"
      aria-label={fmt(m.pickTitle, { title })}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <p className="choice-picker-title">{fmt(m.pickTitle, { title })}</p>
      <p className="choice-picker-hint">{m.pickHint}</p>
      <ul>
        {scenes.map((s, i) => (
          <li key={s.id}>
            <button type="button" ref={i === 0 ? first : undefined} onClick={() => pick(s.id)}>
              {s.rank}. {s.title.trim() || m.untitled}
            </button>
          </li>
        ))}
        <li>
          <button type="button" ref={scenes.length === 0 ? first : undefined} onClick={() => pick(END_TARGET)}>
            {m.ending}
          </button>
        </li>
      </ul>
      <button type="button" className="ghost-button" onClick={onClose}>
        {m.cancel}
      </button>
    </div>
  );
}

/** Repères d'une scène (départ, fin, inaccessible…), en pastilles. */
export function MarksTags({ marks, className = "" }: { marks: SceneMarks | null | undefined; className?: string }) {
  const m = useT().interactive.map;
  if (!marks) return null;
  const tags = [
    marks.start && <span key="start" className="choice-tag is-start">{m.start}</span>,
    marks.ending && (
      <span key="end" className={`choice-tag is-end${marks.endKind ? ` is-${marks.endKind}` : ""}`}>
        {marks.endKind === "good" ? m.endGood : marks.endKind === "bad" ? m.endBad : m.end}
      </span>
    ),
    marks.deadEnd && <span key="dead" className="choice-tag is-dead">{m.deadEnd}</span>,
    marks.broken > 0 && <span key="broken" className="choice-tag is-broken">{fmt(m.broken, { n: marks.broken })}</span>,
    marks.unreachable && <span key="unreachable" className="choice-tag is-broken">{m.unreachable}</span>,
    marks.locked && <span key="locked" className="choice-tag is-warn">{m.locked}</span>,
    marks.factIssue && <span key="fact" className="choice-tag is-warn">{m.factIssue}</span>,
  ].filter(Boolean);
  if (tags.length === 0) return null;
  return <p className={`choice-scene-tags ${className}`.trim()}>{tags}</p>;
}

/** Repères d'une carte Scène sur le canevas, lus dans `useStoryMarks` (calculés une fois par le canevas). */
export function StoryMarks({ id }: { id: string }) {
  const key = useStoryMarks((s) => s.byId[id] ?? "");
  return <MarksTags marks={readMarksKey(key)} className="card-story-marks" />;
}

/** Petit cadenas d'un numéro gardé. */
export const LockGlyph = () => (
  <svg className="section-lock" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** Numéro de la scène dans le livre-jeu imprimé, en pastille dans l'en-tête de sa carte (roman interactif). */
export function StorySection({ id }: { id: string }) {
  const t = useT();
  const n = useStoryMarks((s) => s.numbers[id]);
  const locked = useStoryMarks((s) => s.locked.includes(id));
  if (n === undefined) return null;
  const label = locked ? fmt(t.interactive.plan.sectionLockedAria, { n }) : fmt(t.interactive.plan.sectionAria, { n });
  return (
    <span className="card-section" aria-label={label} title={label}>
      {n}
      {locked && <LockGlyph />}
    </span>
  );
}

/**
 * Numéro d'une section dans « Sections du livre » (lot 12) : un bouton qui devient un champ. Le numéro tapé est
 * gardé (cadenas) ; la section qui l'avait prend l'ancien. Le départ reste au 1.
 */
export function SectionNumber({ id, n, title, locked, start }: { id: string; n: number | undefined; title: string; locked: boolean; start: boolean }) {
  const p = useT().interactive.plan;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [refused, setRefused] = useState(false);
  if (n === undefined) return <span className="plan-section-number">·</span>;
  if (start)
    return (
      <span className="plan-section-number is-start" aria-label={fmt(p.sectionAria, { n })} title={p.startNumber}>
        {n}
      </span>
    );
  const commit = () => {
    const value = Number(draft);
    if (!draft.trim() || value === n) return setEditing(false);
    if (useCosmos.getState().setSectionNumber(id, value)) {
      setEditing(false);
      setRefused(false);
    } else setRefused(true);
  };
  if (editing)
    return (
      <input
        className="plan-section-number is-editing"
        type="number"
        inputMode="numeric"
        min={2}
        autoFocus
        value={draft}
        aria-label={fmt(p.numberInput, { title })}
        aria-invalid={refused || undefined}
        title={refused ? p.numberRefused : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setRefused(false);
        }}
        onBlur={() => {
          setEditing(false);
          setRefused(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setEditing(false);
            setRefused(false);
          }
        }}
      />
    );
  return (
    <button
      type="button"
      className={`plan-section-number${locked ? " is-locked" : ""}`}
      aria-label={fmt(locked ? p.numberLockedAria : p.numberAria, { title, n })}
      title={locked ? p.lockedHint : p.numberHint}
      onClick={() => {
        setDraft(String(n));
        setEditing(true);
      }}
    >
      {n}
      {locked && <LockGlyph />}
    </button>
  );
}

/** « Renuméroter » des Sections du livre : demande confirmation sur place. */
export function RenumberButton() {
  const p = useT().interactive.plan;
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button type="button" className="ghost-button" title={p.renumberHint} onClick={() => setAsking(true)}>
        {p.renumber}
      </button>
    );
  return (
    <span className="plan-renumber-ask" role="group" aria-label={p.renumberAsk}>
      <span>{p.renumberAsk}</span>
      <button
        type="button"
        className="ghost-button"
        autoFocus
        onClick={() => {
          useCosmos.getState().renumberSections();
          setAsking(false);
        }}
      >
        {p.renumberYes}
      </button>
      <button type="button" className="ghost-button" onClick={() => setAsking(false)}>
        {p.renumberNo}
      </button>
    </span>
  );
}
