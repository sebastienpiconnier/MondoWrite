// Liste des projets connus de cet appareil (écran d'accueil). C'est un réglage de l'appareil, pas
// une donnée des projets : retirer un projet de la liste ne touche à aucun de ses fichiers.

import type { ProjectKind } from "../types";

export interface ProjectEntry {
  /** Identifiant pour le stockage : chemin du dossier (ordinateur), nom du dossier privé (mobile), clé (navigateur). */
  id: string;
  /** Nom du dossier, affiché quand le projet n'a pas de titre. */
  name: string;
  title?: string;
  kind?: ProjectKind;
  /** Dernière ouverture (millisecondes), 0 si le projet n'a jamais été ouvert ici. */
  openedAt: number;
  /** Mobile : projet du dossier cloud choisi (OneDrive, Dropbox…), pas de l'espace de l'app. */
  cloud?: boolean;
}

const KEY = "cosmos:projets";
const MAX = 30;

export function readRecents(): ProjectEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter((e): e is ProjectEntry => typeof e?.id === "string" && typeof e?.name === "string");
  } catch {
    return [];
  }
}

function writeRecents(list: ProjectEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* liste non mémorisée, sans gravité */
  }
}

/** Place le projet en tête de liste, en complétant ce qu'on savait déjà de lui. Un projet qu'on ouvre n'est plus masqué. */
export function touchRecent(entry: ProjectEntry) {
  const list = readRecents();
  const known = list.find((e) => e.id === entry.id);
  writeRecents([{ ...known, ...entry }, ...list.filter((e) => e.id !== entry.id)]);
  showProject(entry.id);
}

// Projets masqués : retirés de la liste de l'accueil sans rien supprimer, réaffichables. Réglage de l'appareil,
// à part de la liste des récents : un projet du dossier cloud jamais ouvert ici n'est pas dans les récents (il est
// retrouvé à chaque lecture du dossier) et doit pourtant pouvoir être masqué.
const HIDDEN_KEY = "cosmos:projets-masques";
const MAX_HIDDEN = 200;

export function readHidden(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as unknown;
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeHidden(ids: string[]) {
  try {
    if (ids.length === 0) localStorage.removeItem(HIDDEN_KEY);
    else localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(-MAX_HIDDEN)));
  } catch {
    /* non mémorisé, sans gravité */
  }
}

export function hideProject(id: string) {
  const ids = readHidden();
  if (!ids.includes(id)) writeHidden([...ids, id]);
}

export function showProject(id: string) {
  const ids = readHidden();
  if (ids.includes(id)) writeHidden(ids.filter((x) => x !== id));
}

/** Projets visibles et projets masqués, chacun dans l'ordre reçu. */
export function splitHidden(list: ProjectEntry[], hidden: readonly string[] = readHidden()) {
  const set = new Set(hidden);
  return { shown: list.filter((e) => !set.has(e.id)), hidden: list.filter((e) => set.has(e.id)) };
}

export function dropRecent(id: string) {
  writeRecents(readRecents().filter((e) => e.id !== id));
}

/** Les plus récemment ouverts d'abord. */
export const byRecency = (list: ProjectEntry[]) => [...list].sort((a, b) => b.openedAt - a.openedAt);
