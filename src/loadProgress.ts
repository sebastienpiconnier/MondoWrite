// Avancement de l'ouverture d'un projet. Un projet dans iCloud peut mettre du temps à s'ouvrir (les fichiers
// arrivent d'abord sur l'appareil) : la page des projets montre ce qui se passe au lieu de sembler figée.
// Le stockage signale ses étapes (reportLoad), l'accueil les affiche (LoadingProject). Rien n'est enregistré.

import { create } from "zustand";

export type LoadPhase = "start" | "download" | "read";

export interface LoadState {
  /** Projet en cours d'ouverture, ou null. */
  title: string | null;
  phase: LoadPhase;
  /** Lecture : fichiers lus. Téléchargement : fichiers déjà arrivés. */
  done: number;
  total: number;
  /** Début de l'ouverture (millisecondes), pour l'aide qui apparaît si cela dure. */
  since: number;
  /** Des fichiers sont venus d'iCloud pendant cette ouverture : l'aide parle d'iCloud. */
  cloud: boolean;
}

const IDLE: LoadState = { title: null, phase: "start", done: 0, total: 0, since: 0, cloud: false };

export const useLoadProgress = create<LoadState>(() => IDLE);

export function startLoad(title: string) {
  useLoadProgress.setState({ ...IDLE, title, since: Date.now() });
}

/** Appelé par le stockage ; sans ouverture en cours (enregistrement, relecture), ne fait rien. */
export function reportLoad(phase: LoadPhase, done: number, total: number) {
  if (useLoadProgress.getState().title === null) return;
  useLoadProgress.setState((s) => ({ phase, done, total, cloud: s.cloud || phase === "download" }));
}

export function endLoad() {
  useLoadProgress.setState(IDLE);
}

/** Part faite, de 0 à 1, ou null quand on ne sait pas encore combien il y a de fichiers. */
export function loadFraction(s: Pick<LoadState, "done" | "total">): number | null {
  if (s.total <= 0) return null;
  return Math.max(0, Math.min(1, s.done / s.total));
}

/**
 * Fichiers iCloud : `pending` restants au tour actuel, `first` au premier tour. Le total est le plus grand nombre
 * vu (iCloud peut en découvrir d'autres en route), ce qui est arrivé = total - restants.
 */
export function downloadProgress(first: number, pending: number): { done: number; total: number } {
  const total = Math.max(first, pending);
  return { done: total - pending, total };
}
