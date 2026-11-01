// Statistiques et objectifs du volet de droite : le manuscrit d'un roman et le scénario s'en servent tous deux.

import { useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { dayKey, pagesFor, streak, wordsOn, WORDS_PER_PAGE, type ManuscriptStats } from "../stats";

/** Statistiques et objectifs (idée reprise de NEO : objectif du jour, objectif du livre, jours d'affilée). */
export function StatsBox({
  stats,
  chapters,
  sceneWords,
  place,
  done,
  note,
}: {
  stats: ManuscriptStats;
  /** Scènes du récit marquées « terminée ». */
  done: number;
  chapters: number;
  sceneWords: number;
  /** Pages occupées par la scène dans le livre (mesurées à l'écran). */
  place: { first: number; last: number } | null;
  /** Remarque du bas (comment les pages sont estimées) ; celle du roman par défaut. */
  note?: string;
}) {
  const t = useT();
  const s = t.stats;
  // Replié par défaut (1.11.2) : le volet s'ouvre sur la scène, pas sur les chiffres. État de l'appareil.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const lang = useSettings((x) => x.lang);
  const goals = useCosmos((x) => x.goals);
  const setGoals = useCosmos((x) => x.setGoals);
  const progress = useCosmos((x) => x.progress);
  const num = (n: number) => new Intl.NumberFormat(lang).format(n);
  const today = wordsOn(progress, dayKey(new Date()));
  const days = streak(progress, new Date());
  const hours = Math.floor(stats.minutes / 60);
  const reading = hours > 0 ? fmt(s.hours, { h: hours, m: String(stats.minutes % 60).padStart(2, "0") }) : fmt(s.minutes, { m: Math.max(stats.words > 0 ? 1 : 0, stats.minutes) });
  const bar = (value: number, goal: number | undefined, label: string) =>
    goal ? <progress className="ms-progress" max={goal} value={Math.min(value, goal)} aria-label={label} /> : null;
  const goalInput = (key: "daily" | "total", label: string) => (
    <label className="ms-goal">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={key === "daily" ? 100 : 1000}
        inputMode="numeric"
        value={goals[key] ?? ""}
        placeholder={s.goalPlaceholder}
        onChange={(e) => setGoals({ ...goals, [key]: Number(e.target.value) || undefined })}
      />
    </label>
  );

  return (
    <details
      className="sp-box ms-stats"
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(now);
        try {
          localStorage.setItem(OPEN_KEY, now ? "1" : "0");
        } catch {
          /* stockage indisponible : l'état reste celui de la session */
        }
      }}
    >
      <summary>
        <span className="sp-box-title">{s.title}</span>
        <span className="ms-stats-glance">{fmt(s.glance, { n: num(stats.words), today: num(today) })}</span>
      </summary>
      <dl>
        <div>
          <dt>{s.words}</dt>
          <dd>{num(stats.words)}</dd>
        </div>
        <div>
          <dt>{s.pages}</dt>
          <dd>≈ {num(stats.pages)}</dd>
        </div>
        <div>
          <dt>{s.reading}</dt>
          <dd>≈ {reading}</dd>
        </div>
        <div>
          <dt>{s.scenes}</dt>
          <dd>{fmt(s.of, { n: num(stats.written), total: num(stats.scenes) })}</dd>
        </div>
        {done > 0 && (
          <div>
            <dt>{t.sceneStatus.done}</dt>
            <dd>{fmt(s.of, { n: num(done), total: num(stats.scenes) })}</dd>
          </div>
        )}
        {chapters > 0 && (
          <div>
            <dt>{s.chapters}</dt>
            <dd>{num(chapters)}</dd>
          </div>
        )}
        <div>
          <dt>{s.average}</dt>
          <dd>{num(stats.average)}</dd>
        </div>
        <div>
          <dt>{s.thisScene}</dt>
          <dd>{fmt(s.sceneValue, { n: num(sceneWords), pages: num(pagesFor(sceneWords)) })}</dd>
        </div>
        {place && (
          <div>
            <dt>{s.scenePlace}</dt>
            <dd>{place.first === place.last ? fmt(s.onePage, { n: place.first }) : fmt(s.pagesFrom, { first: place.first, last: place.last })}</dd>
          </div>
        )}
      </dl>
      <div className="ms-goals">
        <p className="ms-today">
          <strong>{fmt(s.today, { n: num(today) })}</strong>
          {goals.daily ? ` · ${fmt(s.dailyProgress, { pct: Math.min(100, Math.round((today / goals.daily) * 100)), goal: num(goals.daily) })}` : ""}
          {days > 1 ? ` · ${fmt(s.streak, { n: days })}` : ""}
        </p>
        {bar(today, goals.daily, s.dailyGoal)}
        {goals.total ? (
          <p className="ms-today">{fmt(s.bookProgress, { n: num(stats.words), total: num(goals.total), pct: Math.min(100, Math.round((stats.words / goals.total) * 100)) })}</p>
        ) : null}
        {bar(stats.words, goals.total, s.bookGoal)}
        <div className="ms-goal-inputs">
          {goalInput("daily", s.dailyGoal)}
          {goalInput("total", s.bookGoal)}
        </div>
        <p className="sp-empty">{note ?? fmt(s.estimate, { n: WORDS_PER_PAGE })}</p>
      </div>
    </details>
  );
}

const OPEN_KEY = "mondowrite.stats.open";

