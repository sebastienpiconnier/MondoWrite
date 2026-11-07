// Statistiques du manuscrit d'un roman : longueur, pages, temps de lecture, avancement, objectifs.
// Fonctions pures. L'idée des objectifs vient de NEO (Hugh Howey) : un objectif de mots par jour, un
// objectif pour le livre, et le compte des mots écrits chaque jour.
//
// Dans cosmos.json (facultatifs) :
//   "goals": { "daily": 500, "total": 80000, "deadline": "2027-03-01", "session": 300, "scene": 1500, "chapter": 4000 }
//   "progress": { "2026-10-08": { "start": 12000, "end": 12650 } }   (total du manuscrit au début et à la fin du jour)

import { countWords, isBlank, type Manuscript } from "./manuscript";

/** Mots par page d'un roman imprimé (format poche ou broché) : c'est aussi la page du Manuscrit à l'écran. */
export const WORDS_PER_PAGE = 250;
/** Vitesse de lecture silencieuse d'un adulte, en mots par minute. */
export const WORDS_PER_MINUTE = 230;
/** Jours d'avancement gardés dans le fichier. */
const KEEP_DAYS = 90;

export interface Goals {
  /** Mots par jour. */
  daily?: number;
  /** Mots pour le livre entier. */
  total?: number;
  /** Échéance (AAAA-MM-JJ) : avec l'objectif du livre, l'objectif du jour se calcule tout seul. */
  deadline?: string;
  /** Mots à écrire pendant une séance (depuis l'ouverture du projet ou la dernière remise à zéro). */
  session?: number;
  /** Mots visés pour une scène. */
  scene?: number;
  /** Mots visés pour un chapitre. */
  chapter?: number;
}

export type Progress = Record<string, { start: number; end: number }>;

const positive = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);

export const isDay = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);

/** Une date AAAA-MM-JJ qui existe vraiment (pas le 31 février). */
export function validDay(key: unknown): key is string {
  if (typeof key !== "string" || !isDay(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

const NUMERIC_GOALS = ["daily", "total", "session", "scene", "chapter"] as const;

export function readGoals(raw: unknown): Goals {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Goals = {};
  for (const key of NUMERIC_GOALS) {
    const v = positive(r[key]);
    if (v) out[key] = v;
  }
  if (validDay(r.deadline)) out.deadline = r.deadline;
  return out;
}

/** Aucun objectif posé : rien à écrire dans cosmos.json. */
export const hasGoals = (g: Goals) => Object.keys(g).length > 0;

export function readProgress(raw: unknown): Progress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Progress = {};
  for (const [day, value] of Object.entries(raw)) {
    const { start, end } = (value ?? {}) as Record<string, unknown>;
    if (isDay(day) && typeof start === "number" && typeof end === "number" && start >= 0 && end >= 0) out[day] = { start: Math.round(start), end: Math.round(end) };
  }
  return out;
}

/** Jour local au format AAAA-MM-JJ. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Avancement après une modification du manuscrit : `before` et `after`, le total de mots avant et après.
 * Le premier changement du jour fixe son point de départ. Même objet si le total ne bouge pas.
 */
export function recordProgress(progress: Progress, day: string, before: number, after: number): Progress {
  const today = progress[day];
  if (today ? today.end === after : before === after) return progress;
  const next: Progress = { ...progress, [day]: { start: today?.start ?? before, end: after } };
  const days = Object.keys(next).sort();
  for (const old of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete next[old];
  return next;
}

/** Mots écrits ce jour-là (jamais négatif : couper un passage ne fait pas reculer la journée). */
export const wordsOn = (progress: Progress, day: string) => Math.max(0, (progress[day]?.end ?? 0) - (progress[day]?.start ?? 0));

/** Jours d'affilée, jusqu'à aujourd'hui ou hier, où l'auteur a écrit. */
export function streak(progress: Progress, today: Date): number {
  let count = 0;
  const day = new Date(today);
  if (wordsOn(progress, dayKey(day)) === 0) day.setDate(day.getDate() - 1);
  while (wordsOn(progress, dayKey(day)) > 0) {
    count++;
    day.setDate(day.getDate() - 1);
  }
  return count;
}

export interface ManuscriptStats {
  words: number;
  /** Pages estimées (au moins une dès qu'il y a un mot). */
  pages: number;
  /** Temps de lecture, en minutes. */
  minutes: number;
  scenes: number;
  written: number;
  /** Moyenne de mots par scène écrite. */
  average: number;
  /** Mots de chaque scène. */
  perScene: Map<string, number>;
}

export function manuscriptStats(manuscript: Manuscript, order: string[]): ManuscriptStats {
  const perScene = new Map(order.map((id) => [id, countWords(manuscript[id])]));
  const words = [...perScene.values()].reduce((a, b) => a + b, 0);
  const written = order.filter((id) => !isBlank(manuscript[id])).length;
  return {
    words,
    pages: pagesFor(words),
    minutes: Math.round(words / WORDS_PER_MINUTE),
    scenes: order.length,
    written,
    average: written > 0 ? Math.round(words / written) : 0,
    perScene,
  };
}

export const pagesFor = (words: number) => (words > 0 ? Math.max(1, Math.ceil(words / WORDS_PER_PAGE)) : 0);

/** Première page d'une scène : celle où se termine le texte qui la précède. */
export const firstPageOf = (wordsBefore: number) => 1 + Math.floor(wordsBefore / WORDS_PER_PAGE);

/** Jours qui restent jusqu'à l'échéance, aujourd'hui compris ; 0 si elle est passée. */
export function daysLeft(deadline: string, today: Date): number {
  if (!validDay(deadline)) return 0;
  const [y, m, d] = deadline.split("-").map(Number);
  const end = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.max(0, Math.round((end - now) / 86_400_000) + 1);
}

export interface DailyTarget {
  /** Mots à écrire aujourd'hui, ou rien si aucun objectif n'est posé. */
  words?: number;
  /** Calculé d'après l'échéance (sinon c'est l'objectif du jour que l'auteur a tapé). */
  fromDeadline: boolean;
  /** Jours restants, aujourd'hui compris (avec une échéance). */
  days?: number;
  /** L'échéance est passée. */
  late?: boolean;
}

/**
 * Objectif du jour. Avec une échéance et un objectif du livre, il se calcule : ce qui reste à écrire au début de la
 * journée, réparti sur les jours qui restent (aujourd'hui compris). Il ne bouge pas pendant la journée, sinon il
 * reculerait à chaque mot écrit. Sans objectif du livre, l'échéance ne sert à rien : l'objectif du jour tapé reste.
 */
export function dailyTarget(goals: Goals, bookWordsAtDayStart: number, today: Date): DailyTarget {
  if (goals.deadline && goals.total) {
    const days = daysLeft(goals.deadline, today);
    const remaining = Math.max(0, goals.total - bookWordsAtDayStart);
    if (days === 0) return { words: remaining, fromDeadline: true, days, late: remaining > 0 };
    return { words: Math.ceil(remaining / days), fromDeadline: true, days };
  }
  return { words: goals.daily, fromDeadline: false };
}

/** Mots du livre au début d'un jour (le point de départ fixé par le premier changement du jour, sinon le total actuel). */
export const bookStartOfDay = (progress: Progress, day: string, bookWords: number) => progress[day]?.start ?? bookWords;

/** Mots écrits pendant la séance (jamais négatif) : `start` est le total avant la première modification. */
export const sessionWords = (start: number | null, now: number) => (start === null ? 0 : Math.max(0, now - start));

/** Une cible atteinte ou non, et sa part (0 à 100). */
export function reach(value: number, goal: number | undefined): { pct: number; reached: boolean } | null {
  if (!goal) return null;
  return { pct: Math.min(100, Math.round((value / goal) * 100)), reached: value >= goal };
}

/** Mots de chaque chapitre (somme des scènes), dans l'ordre donné par `chapterOf`. */
export function chapterWords(order: string[], perScene: Map<string, number>, chapterOf: (id: string) => string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of order) {
    const chapter = chapterOf(id);
    if (chapter) out.set(chapter, (out.get(chapter) ?? 0) + (perScene.get(id) ?? 0));
  }
  return out;
}
