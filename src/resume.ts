// « Reprendre là où j'en étais » (#27) : pour chaque projet, la vue où l'on était et, dans le Manuscrit ou le
// Scénario, la scène et la place du curseur. Gardé sur l'appareil (localStorage), jamais dans le projet : deux
// appareils n'ont pas à s'accorder sur où chacun en était.
//
// La vue d'écriture ouverte déclare où est son curseur (`setCaretSource`) ; la position est relevée quand on
// change de vue, après un enregistrement réussi et en revenant aux projets (`captureSpot`).

import type { View } from "./projectState";

export const VIEWS: readonly View[] = ["toile", "plan", "bible", "manuscrit", "carnet"];

export interface Spot {
  view: View;
  /** Scène du Manuscrit ou du Scénario : identifiant de sa carte, ou `@` + rang de son en-tête (scène sans carte). */
  scene?: string;
  /** Scénario : rang de l'élément du curseur depuis l'en-tête de la scène. */
  el?: number;
  /** Place du curseur : dans la scène (roman), dans l'élément (scénario). */
  offset?: number;
  /** Nom de la scène, pour l'accueil (« Reprendre · Chapitre 3, La forêt »). */
  label?: string;
  /** Quand la position a été relevée (millisecondes). */
  at: number;
}

const KEY = "mondowrite.resume";
/** Projets dont on garde la position (les plus récents). */
export const MAX_SPOTS = 30;
const MAX_LABEL = 120;

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;
/** Une date en millisecondes (jusqu'en l'an 5000). */
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e14;

/** Position lue (stockage local, modifiable à la main) : tout ce qui n'a pas la bonne forme est écarté. */
export function cleanSpot(raw: unknown): Spot | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (!VIEWS.includes(v.view as View) || !isTime(v.at)) return null;
  const spot: Spot = { view: v.view as View, at: v.at as number };
  if (typeof v.scene === "string" && /^@?[A-Za-z0-9_-]{1,64}$/.test(v.scene)) {
    spot.scene = v.scene;
    if (isCount(v.el)) spot.el = v.el;
    if (isCount(v.offset)) spot.offset = v.offset;
    if (typeof v.label === "string" && v.label.trim()) spot.label = v.label.trim().slice(0, MAX_LABEL);
  }
  return spot;
}

function readAll(): Record<string, Spot> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, Spot> = {};
    for (const [id, value] of Object.entries(raw)) {
      const spot = cleanSpot(value);
      if (spot) out[id] = spot;
    }
    return out;
  } catch {
    return {};
  }
}

/** Garde les `max` positions les plus récentes (pur). */
export function pruneSpots(all: Record<string, Spot>, max = MAX_SPOTS): Record<string, Spot> {
  const entries = Object.entries(all).sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, max));
}

function writeAll(all: Record<string, Spot>) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(pruneSpots(all)));
  } catch {
    /* non mémorisé, sans gravité */
  }
}

export function readSpot(projectId: string): Spot | null {
  return readAll()[projectId] ?? null;
}

export function forgetSpot(projectId: string) {
  const all = readAll();
  if (!(projectId in all)) return;
  delete all[projectId];
  writeAll(all);
}

export type Caret = Pick<Spot, "scene" | "el" | "offset" | "label">;
let caretSource: (() => Caret | null) | null = null;

/** La vue d'écriture ouverte dit où est son curseur ; elle retire sa fonction en se démontant. */
export function setCaretSource(source: (() => Caret | null) | null) {
  caretSource = source;
}

/**
 * Nouvelle position (pur) : la vue en cours, et la scène lue dans la vue d'écriture si elle est ouverte, sinon
 * celle d'avant (passer du Manuscrit au Canevas garde la scène où l'on écrivait).
 */
export function nextSpot(view: View, caret: Caret | null, previous: Spot | null, now: number): Spot {
  const scene = caret?.scene ? caret : previous?.scene ? previous : null;
  const spot: Spot = { view, at: now };
  if (scene?.scene) {
    spot.scene = scene.scene;
    if (scene.el !== undefined) spot.el = scene.el;
    if (scene.offset !== undefined) spot.offset = scene.offset;
    if (scene.label) spot.label = scene.label;
  }
  return cleanSpot(spot) ?? { view, at: now };
}

/** Relève la position du projet ouvert (`projectId` : celui du stockage). */
export function captureSpot(projectId: string | null | undefined, view: View) {
  if (!projectId) return;
  let caret: Caret | null = null;
  try {
    caret = caretSource?.() ?? null;
  } catch {
    caret = null;
  }
  const all = readAll();
  all[projectId] = nextSpot(view, caret, all[projectId] ?? null, Date.now());
  writeAll(all);
}
