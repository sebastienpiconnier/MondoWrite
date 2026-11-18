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
    if (label !== edge.label) useCosmos.getState().editChoiceAt(edge.from, edge.index, { label, target: edge.target, cond: edge.cond, effects: edge.effects });
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
    marks.ending && <span key="end" className="choice-tag is-end">{m.end}</span>,
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

/** Numéro de la scène dans le livre-jeu imprimé, en pastille dans l'en-tête de sa carte (roman interactif). */
export function StorySection({ id }: { id: string }) {
  const t = useT();
  const n = useStoryMarks((s) => s.numbers[id]);
  if (n === undefined) return null;
  return (
    <span className="card-section" aria-label={fmt(t.interactive.plan.sectionAria, { n })} title={fmt(t.interactive.plan.sectionAria, { n })}>
      {n}
    </span>
  );
}
