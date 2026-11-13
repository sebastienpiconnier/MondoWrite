// En-tête commun du Plan (roman) et du séquencier (scénario), #55 : une seule mise en page, lue avec le vocabulaire
// du projet. Première ligne : titre de la vue, présentation (Liste, Fiches, Chronologie), actions, total à droite ;
// seconde ligne : le gabarit et ce qu'il raconte. Les deux vues ne diffèrent que par ce qu'elles y mettent.

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useShellSlot } from "./useShellSlot";
import { useT } from "../i18n";
import { useSettings, type SequencerMode } from "../settings";

const MODES: SequencerMode[] = ["outline", "cards"];

interface Props {
  title: string;
  /** Chronologie affichée (état de la vue). */
  timeline: boolean;
  onTimeline: (on: boolean) => void;
  /** Libellé du groupe des présentations. */
  modeAria: string;
  /** Boutons d'action après les présentations (Organiser le canevas, Nouvel épisode…). */
  actions?: ReactNode;
  /** Total, aligné à droite (scènes, ou durée et pages). */
  total?: ReactNode;
  /** Choix du gabarit (absent dans une série : chaque épisode a le sien). */
  template?: ReactNode;
  /** Ce que raconte le gabarit choisi. */
  about?: string;
}

/** Bouton « Ranger » d'une scène (#55) : chapitre et case s'ouvrent sous la scène, le reste du temps ils attendent. */
export function ArrangeToggle({ open, title, onToggle }: { open: boolean; title: string; onToggle: () => void }) {
  const p = useT().plan;
  return (
    <button type="button" className="ghost-button plan-arrange" aria-expanded={open} title={p.arrangeHint} aria-label={`${p.arrange} : ${title}`} onClick={onToggle}>
      <span>{p.arrange}</span>
      <span className={`disclosure${open ? " is-open" : ""}`} aria-hidden="true" />
    </button>
  );
}

export function PlanHeader({ title, timeline, onTimeline, modeAria, actions, total, template, about }: Props) {
  const t = useT();
  const sq = t.screenplay.sequencer;
  const mode = useSettings((s) => s.sequencerMode);
  const setMode = useSettings((s) => s.setSequencerMode);
  const shellSlot = useShellSlot();
  const modes = (
      <div className="sq-modes" role="group" aria-label={modeAria}>
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={!timeline && mode === m}
            onClick={() => {
              setMode(m);
              onTimeline(false);
            }}
          >
            {sq[m]}
          </button>
        ))}
        <button type="button" className="plan-timeline-tab" aria-pressed={timeline} onClick={() => onTimeline(true)}>
          {t.plan.timeline}
        </button>
      </div>
  );
  const rest = (
    <>
      {actions}
      {total}
      {(template || about) && (
        <div className="sq-template-row">
          {template}
          {about && <p className="plan-about">{about}</p>}
        </div>
      )}
    </>
  );
  // Grand écran : présentation, actions et gabarit vivent dans la colonne de verre, le titre est dans le menu des vues.
  if (shellSlot) {
    return (
      <>
        <h1 className="sr-only">{title}</h1>
        {createPortal(
          <div className="shell-plan-tools">
            {modes}
            {rest}
          </div>,
          shellSlot,
        )}
      </>
    );
  }
  return (
    <header className="sq-head">
      <h1>{title}</h1>
      {modes}
      {rest}
    </header>
  );
}
