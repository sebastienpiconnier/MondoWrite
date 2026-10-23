// Ouverture d'un projet en cours (page des projets) : nom du projet, étape et avancement. Apparaît seulement si
// l'ouverture dure (pas de clignotement pour un projet local), et explique l'attente quand iCloud est lent.

import { useEffect, useState } from "react";
import { fmt, useT } from "../i18n";
import { loadFraction, useLoadProgress } from "../loadProgress";

/** En dessous, l'ouverture est assez rapide pour ne rien montrer. */
const SHOW_AFTER_MS = 300;
/** Au-delà, une phrase dit pourquoi c'est long (fichiers venus d'iCloud). */
const SLOW_AFTER_MS = 4000;

export function LoadingProject() {
  const t = useT().home.loading;
  const state = useLoadProgress();
  const [now, setNow] = useState(() => Date.now());
  const active = state.title !== null;

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active || now - state.since < SHOW_AFTER_MS) return null;
  const fraction = loadFraction(state);
  const step = state.phase === "start" || state.total === 0 ? t.start : fmt(t[state.phase], { done: state.done, total: state.total });
  const slow = state.cloud && now - state.since >= SLOW_AFTER_MS;

  return (
    <div className="loading-project" role="status" aria-live="polite">
      <div className="loading-project-box">
        <span className="loading-spinner" aria-hidden="true" />
        <p className="loading-project-title">{state.title ? fmt(t.title, { title: state.title }) : t.untitled}</p>
        <div
          className={`loading-bar${fraction === null ? " is-indeterminate" : ""}`}
          role="progressbar"
          aria-label={step}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
        >
          <span style={fraction === null ? undefined : { width: `${fraction * 100}%` }} />
        </div>
        <p className="loading-project-step">{step}</p>
        {slow && <p className="loading-project-hint">{t.slow}</p>}
      </div>
    </div>
  );
}
