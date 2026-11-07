// Statistiques et objectifs du volet de droite : le manuscrit d'un roman et le scénario s'en servent tous deux.

import { useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { bookStartOfDay, dailyTarget, dayKey, pagesFor, reach, sessionWords, streak, wordsOn, WORDS_PER_PAGE, type Goals, type ManuscriptStats } from "../stats";

/** Statistiques et objectifs (idée reprise de NEO : objectif du jour, objectif du livre, jours d'affilée). */
export function StatsBox({
  stats,
  chapters,
  sceneWords,
  place,
  done,
  note,
  chapterWords,
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
  /** Mots du chapitre de la scène en cours (roman en chapitres) ; absent : pas d'objectif par chapitre. */
  chapterWords?: number;
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
  const now = new Date();
  const today = wordsOn(progress, dayKey(now));
  const days = streak(progress, now);
  const target = dailyTarget(goals, bookStartOfDay(progress, dayKey(now), stats.words), now);
  const dailyGoal = target.words;
  const sessionStart = useCosmos((x) => x.sessionStart);
  const resetSession = useCosmos((x) => x.resetSession);
  const session = sessionWords(sessionStart, stats.words);
  const dayLong = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(y, m - 1, d));
  };
  const hours = Math.floor(stats.minutes / 60);
  const reading = hours > 0 ? fmt(s.hours, { h: hours, m: String(stats.minutes % 60).padStart(2, "0") }) : fmt(s.minutes, { m: Math.max(stats.words > 0 ? 1 : 0, stats.minutes) });
  const bar = (value: number, goal: number | undefined, label: string) =>
    goal ? <progress className="ms-progress" max={goal} value={Math.min(value, goal)} aria-label={label} /> : null;
  const goalInput = (key: "daily" | "total" | "session" | "scene" | "chapter", label: string) => (
    <label className="ms-goal">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={key === "total" ? 1000 : key === "chapter" ? 500 : 100}
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
          {dailyGoal ? ` · ${fmt(s.dailyProgress, { pct: Math.min(100, Math.round((today / dailyGoal) * 100)), goal: num(dailyGoal) })}` : ""}
          {days > 1 ? ` · ${fmt(s.streak, { n: days })}` : ""}
        </p>
        {bar(today, dailyGoal, target.fromDeadline ? s.dailyDerived : s.dailyGoal)}
        {dailyGoal && today >= dailyGoal ? (
          <p className="ms-reached" role="status">
            ✓ {s.dailyReached}
          </p>
        ) : null}
        {target.fromDeadline && goals.deadline ? (
          <p className="ms-today ms-deadline">
            {target.late
              ? fmt(s.deadlineLate, { date: dayLong(goals.deadline), goal: num(target.words ?? 0) })
              : target.words === 0
                ? fmt(s.deadlineDone, { date: dayLong(goals.deadline) })
                : target.days === 1
                  ? fmt(s.deadlineLast, { date: dayLong(goals.deadline), goal: num(target.words ?? 0) })
                  : fmt(s.deadlineLine, { date: dayLong(goals.deadline), goal: num(target.words ?? 0), days: target.days ?? 0 })}
          </p>
        ) : null}
        {goals.total ? (
          <p className="ms-today">{fmt(s.bookProgress, { n: num(stats.words), total: num(goals.total), pct: Math.min(100, Math.round((stats.words / goals.total) * 100)) })}</p>
        ) : null}
        {bar(stats.words, goals.total, s.bookGoal)}
        {goals.session ? (
          <>
            <p className="ms-today">{fmt(s.sessionProgress, { n: num(session), goal: num(goals.session), pct: reach(session, goals.session)?.pct ?? 0 })}</p>
            {bar(session, goals.session, s.sessionGoal)}
            {session >= goals.session ? (
              <p className="ms-reached" role="status">
                ✓ {s.sessionReached}
              </p>
            ) : null}
          </>
        ) : null}
        {goals.scene ? (
          <>
            <p className="ms-today">{fmt(s.sceneProgress, { n: num(sceneWords), goal: num(goals.scene), pct: reach(sceneWords, goals.scene)?.pct ?? 0 })}</p>
            {bar(sceneWords, goals.scene, s.sceneGoal)}
          </>
        ) : null}
        {goals.chapter && chapterWords !== undefined ? (
          <>
            <p className="ms-today">{fmt(s.chapterProgress, { n: num(chapterWords), goal: num(goals.chapter), pct: reach(chapterWords, goals.chapter)?.pct ?? 0 })}</p>
            {bar(chapterWords, goals.chapter, s.chapterGoal)}
          </>
        ) : null}
        <div className="ms-goal-inputs">
          {/* Avec une échéance, l'objectif du jour est calculé : pas de champ à taper. */}
          {target.fromDeadline ? null : goalInput("daily", s.dailyGoal)}
          {goalInput("total", s.bookGoal)}
          <label className="ms-goal">
            <span>{s.deadlineGoal}</span>
            <input
              type="date"
              min={dayKey(now)}
              value={goals.deadline ?? ""}
              onChange={(e) => setGoals(withDeadline(goals, e.target.value))}
            />
          </label>
          {goalInput("session", s.sessionGoal)}
          {goalInput("scene", s.sceneGoal)}
          {chapterWords !== undefined ? goalInput("chapter", s.chapterGoal) : null}
        </div>
        <p className="sp-empty">{s.deadlineHelp}</p>
        {sessionStart !== null ? (
          <button type="button" className="chip" onClick={resetSession}>
            {s.sessionNew}
          </button>
        ) : null}
        <p className="sp-empty">{note ?? fmt(s.estimate, { n: WORDS_PER_PAGE })}</p>
      </div>
    </details>
  );
}

const OPEN_KEY = "mondowrite.stats.open";


/** Les objectifs avec une échéance changée ou retirée (champ vide). */
function withDeadline(goals: Goals, value: string): Goals {
  const { deadline: _old, ...rest } = goals;
  return value ? { ...rest, deadline: value } : rest;
}
