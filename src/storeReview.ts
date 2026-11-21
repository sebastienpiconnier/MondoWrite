// Demande de note sur l'App Store (iPhone et iPad, commandes `store_review` de src-tauri/src/lib.rs). iOS montre sa
// fenêtre trois fois par an au plus et décide seul : on ne la demande qu'à un bon moment, en revenant à l'accueil
// après une vraie séance d'écriture, chez un auteur qui revient, jamais dans les jours qui suivent une mise à jour
// (les versions sont fréquentes : on compte en jours, pas en numéros de version). Gardé sur l'appareil
// (localStorage), jamais dans le projet. Ailleurs (ordinateur, navigateur), rien n'est compté ni demandé.

import { version } from "../package.json";
import { isTauri, openExternal } from "./platform";

/** Page de l'app sur l'App Store, ouverte sur « Écrire un avis » (sans limite, contrairement à la fenêtre d'iOS). */
export const APP_STORE_REVIEW_URL = "https://apps.apple.com/app/id6825299934?action=write-review";

const KEY = "mondowrite.review";
const DAY = 24 * 60 * 60 * 1000;

/** Règles de la demande : toutes doivent être remplies. */
export const REVIEW_RULES = {
  /** Jours différents où un projet a été ouvert. */
  minDays: 5,
  /** Depuis la première utilisation comptée. */
  minAge: 7 * DAY,
  /** Entre deux demandes. */
  minGap: 120 * DAY,
  /** Depuis l'arrivée de la version en cours (un bug d'une nouvelle version se voit les premiers jours). */
  afterUpdate: 3 * DAY,
  /** Durée du projet ouvert avant le retour à l'accueil. */
  minSession: 10 * 60 * 1000,
} as const;

export interface ReviewState {
  /** Première utilisation comptée (millisecondes). */
  firstUse: number;
  /** Jours d'utilisation (AAAA-MM-JJ, heure locale), les plus récents, sans doublon. */
  days: string[];
  /** Version en cours et depuis quand elle est là. */
  version: string;
  versionSince: number;
  /** Dernière demande faite à iOS. */
  asked?: number;
}

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e14;
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Jour local d'une date (AAAA-MM-JJ). */
export function dayOf(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** État lu (stockage local, modifiable à la main) : null si la forme n'est pas la bonne. */
export function cleanReview(raw: unknown): ReviewState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (!isTime(v.firstUse) || !isTime(v.versionSince) || typeof v.version !== "string" || !Array.isArray(v.days)) return null;
  const state: ReviewState = {
    firstUse: v.firstUse,
    days: [...new Set(v.days.filter(isDay))].slice(-REVIEW_RULES.minDays),
    version: v.version,
    versionSince: v.versionSince,
  };
  if (isTime(v.asked)) state.asked = v.asked;
  return state;
}

/** Un projet vient d'être ouvert : le jour est compté, la version notée. */
export function noteUse(state: ReviewState | null, now: number, current: string): ReviewState {
  const base = state ?? { firstUse: now, days: [], version: current, versionSince: now };
  const today = dayOf(now);
  const days = base.days.includes(today) ? base.days : [...base.days, today].slice(-REVIEW_RULES.minDays);
  const changed = base.version !== current;
  return { ...base, days, version: current, versionSince: changed ? now : base.versionSince };
}

/** Faut-il demander une note maintenant ? `session` : durée du projet qu'on vient de quitter. */
export function reviewDue(state: ReviewState | null, now: number, session: number): boolean {
  if (!state) return false;
  const r = REVIEW_RULES;
  return (
    state.days.length >= r.minDays &&
    now - state.firstUse >= r.minAge &&
    now - state.versionSince >= r.afterUpdate &&
    session >= r.minSession &&
    (state.asked === undefined || now - state.asked >= r.minGap)
  );
}

function read(): ReviewState | null {
  try {
    return cleanReview(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return null;
  }
}

function write(state: ReviewState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Stockage plein ou refusé : la demande attendra.
  }
}

let supported: Promise<boolean> | null = null;

/** Vrai sur iPhone et iPad (la commande de l'app le dit), faux ailleurs. Demandé une seule fois. */
export function canRateInStore(): Promise<boolean> {
  supported ??= isTauri()
    ? import("@tauri-apps/api/core").then(({ invoke }) => invoke<boolean>("store_review_supported")).catch(() => false)
    : Promise.resolve(false);
  return supported;
}

let openedAt: number | null = null;

/** Projet ouvert (src/App.tsx). */
export async function reviewProjectOpened(): Promise<void> {
  if (!(await canRateInStore())) return;
  const now = Date.now();
  openedAt = now;
  write(noteUse(read(), now, version));
}

/** Retour à l'accueil (src/App.tsx) : la fenêtre d'iOS est demandée si toutes les règles sont remplies. */
export async function reviewProjectClosed(): Promise<void> {
  const start = openedAt;
  openedAt = null;
  if (start === null || !(await canRateInStore())) return;
  const now = Date.now();
  const state = read();
  if (!state || !reviewDue(state, now, now - start)) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    if (await invoke<boolean>("store_review")) write({ ...state, asked: now });
  } catch (err) {
    console.warn(err);
  }
}

/** Bouton « Noter MondoWrite » (À propos) : la page de l'App Store, ouverte sur l'écriture d'un avis. */
export function openStoreReviewPage(): Promise<void> {
  return openExternal(APP_STORE_REVIEW_URL);
}
