// Réglages de l'export de la Bible (Bible v2, fenêtre « Exporter la Bible ») : pour qui, quelles parties,
// quel rendu. Gardés dans le projet sous `bibleExport` dans cosmos.json (l'image de couverture appartient au
// projet) : les réglages en cours et des réglages nommés. Module léger, lu par le store. Les clés et valeurs
// sont écrites dans le fichier : ne jamais les renommer. Fonctions pures.

import { BIBLE_PARTS, isPrivatePart, type PartKey } from "./bibleParts";
import { isMediaName } from "./media";
import type { ProjectKind } from "./types";

/** « moi » : bible de travail (tout) ; « tiers » : dossier de présentation (roman) ou bible de série (scénario). */
export type BibleAudience = "moi" | "tiers";
export const BIBLE_THEMES = ["sobre", "editorial", "nuit"] as const;
export type BibleTheme = (typeof BIBLE_THEMES)[number];
/** Nombre de couleurs d'accent proposées par chaque rendu. */
export const ACCENT_COUNT = 4;

export interface BibleExportOptions {
  audience: BibleAudience;
  /** Parties exportées, dans l'ordre du document. « Pour vous » vient toujours en dernier. */
  parts: PartKey[];
  theme: BibleTheme;
  /** Rang de la couleur d'accent dans le rendu (0 à ACCENT_COUNT - 1). */
  accent: number;
  /** Image de couverture : nom d'un fichier de medias/, ou "" (aucune). */
  cover: string;
  /** Photos des lieux en vignettes dans la partie Univers. */
  places: boolean;
  /** Scénario : les premières pages du pilote en annexe du PDF. */
  pilot: boolean;
  /** Scénario : la grille des fils (intrigues × parties du pilote). Pour un tiers, décochée par défaut (lot 6). */
  grid: boolean;
  /** Scénario : la page « En un coup d'œil » (les accroches). Pour un tiers, décochée par défaut : elle répète les fiches. */
  memo: boolean;
  /** Roman : les premières pages du manuscrit en annexe, pour un éditeur (lot 6, sur le modèle du pilote). */
  extract: boolean;
  /**
   * Destinataire : pourquoi ce guichet ou cette chaîne, en une phrase (lot 6). Réglage de l'envoi plutôt que
   * donnée du projet : un même dossier part à plusieurs endroits (un réglage nommé par destinataire).
   */
  recipient: string;
}

export interface BiblePreset {
  name: string;
  options: BibleExportOptions;
}

export interface BibleExportState {
  current: BibleExportOptions;
  presets: BiblePreset[];
}

const PUBLIC_PARTS = BIBLE_PARTS.filter((p) => !isPrivatePart(p));

/** Rendu de départ : Éditorial pour un éditeur, Sobre ailleurs (pour soi, et pour un producteur depuis le lot 6). */
export const defaultTheme = (audience: BibleAudience, kind: ProjectKind = "roman"): BibleTheme => (audience === "tiers" && kind === "roman" ? "editorial" : "sobre");

/** Réglages de départ pour un lecteur : tout pour soi ; sans « Pour vous » pour un tiers. */
export function defaultsFor(audience: BibleAudience, kind: ProjectKind = "roman"): BibleExportOptions {
  const forMe = audience === "moi";
  return { audience, parts: forMe ? [...BIBLE_PARTS] : [...PUBLIC_PARTS], theme: defaultTheme(audience, kind), accent: 0, cover: "", places: true, pilot: !forMe && kind === "scenario", extract: !forMe && kind === "roman", grid: forMe, memo: forMe, recipient: "" };
}

/**
 * Réglages montrés par la fenêtre : ceux du projet, ou, tant que l'auteur n'a rien changé, ceux de départ pour
 * ce type de projet (un producteur reçoit le pilote en annexe). Rien n'est écrit avant un changement.
 */
export const exportStateFor = (state: BibleExportState, kind: ProjectKind): BibleExportState =>
  bibleExportToMeta(state) === undefined ? { ...state, current: defaultsFor(state.current.audience, kind) } : state;

export const DEFAULT_BIBLE_EXPORT: BibleExportState = { current: defaultsFor("tiers"), presets: [] };

const MAX_PRESETS = 20;
const MAX_RECIPIENT = 300;

/** Parties relues : connues, sans doublon, « Pour vous » ramenée à la fin. */
export function cleanParts(raw: unknown): PartKey[] {
  if (!Array.isArray(raw)) return [];
  const known = [...new Set(raw.filter((p): p is PartKey => (BIBLE_PARTS as readonly string[]).includes(p as string)))];
  return [...known.filter((p) => !isPrivatePart(p)), ...known.filter(isPrivatePart)];
}

/** Réglages relus (cosmos.json) : toute valeur inconnue reprend sa valeur par défaut. */
export function cleanOptions(raw: unknown): BibleExportOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const audience: BibleAudience = o.audience === "moi" ? "moi" : "tiers";
  const d = defaultsFor(audience);
  const theme = (BIBLE_THEMES as readonly string[]).includes(o.theme as string) ? (o.theme as BibleTheme) : d.theme;
  const accent = typeof o.accent === "number" && Number.isInteger(o.accent) && o.accent >= 0 && o.accent < ACCENT_COUNT ? o.accent : 0;
  return {
    audience,
    parts: Array.isArray(o.parts) ? cleanParts(o.parts) : d.parts,
    theme,
    accent,
    cover: typeof o.cover === "string" && isMediaName(o.cover) ? o.cover : "",
    places: typeof o.places === "boolean" ? o.places : d.places,
    pilot: o.pilot === true,
    extract: o.extract === true,
    grid: typeof o.grid === "boolean" ? o.grid : d.grid,
    memo: typeof o.memo === "boolean" ? o.memo : d.memo,
    recipient: typeof o.recipient === "string" ? o.recipient.replace(/\s+/g, " ").trim().slice(0, MAX_RECIPIENT) : "",
  };
}

export function cleanBibleExport(raw: unknown): BibleExportState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const presets: BiblePreset[] = [];
  for (const p of Array.isArray(r.presets) ? r.presets : []) {
    const name = typeof p?.name === "string" ? p.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!name || presets.some((x) => x.name === name)) continue;
    presets.push({ name, options: cleanOptions(p.options) });
    if (presets.length >= MAX_PRESETS) break;
  }
  return { current: r.current === undefined ? DEFAULT_BIBLE_EXPORT.current : cleanOptions(r.current), presets };
}

/** Ce qui s'écrit dans cosmos.json : rien tant que l'auteur n'a rien changé. */
export function bibleExportToMeta(state: BibleExportState): BibleExportState | undefined {
  const clean = cleanBibleExport(state);
  return JSON.stringify(clean) === JSON.stringify(cleanBibleExport(DEFAULT_BIBLE_EXPORT)) ? undefined : clean;
}

/** Enregistre (ou remplace) un réglage nommé. Même objet si le nom est vide. */
export function savePreset(state: BibleExportState, name: string): BibleExportState {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!n) return state;
  const presets = state.presets.filter((p) => p.name !== n);
  return { ...state, presets: [...presets, { name: n, options: state.current }].slice(-MAX_PRESETS) };
}

export const deletePreset = (state: BibleExportState, name: string): BibleExportState =>
  state.presets.some((p) => p.name === name) ? { ...state, presets: state.presets.filter((p) => p.name !== name) } : state;

/** Change de lecteur : parties, rendu et annexe reprennent les valeurs de départ de ce lecteur, le reste est gardé. */
export function withAudience(options: BibleExportOptions, audience: BibleAudience, kind: ProjectKind = "roman"): BibleExportOptions {
  if (options.audience === audience) return options;
  const d = defaultsFor(audience, kind);
  return { ...options, audience, parts: d.parts, theme: d.theme, pilot: d.pilot, extract: d.extract, grid: d.grid, memo: d.memo };
}

/** Coche ou décoche une partie ; une partie cochée reprend sa place dans l'ordre des parties. */
export function togglePart(options: BibleExportOptions, part: PartKey): BibleExportOptions {
  if (options.parts.includes(part)) return { ...options, parts: options.parts.filter((p) => p !== part) };
  const before = BIBLE_PARTS.slice(0, BIBLE_PARTS.indexOf(part)).reverse().find((p) => options.parts.includes(p));
  const parts = [...options.parts];
  parts.splice(before ? parts.indexOf(before) + 1 : 0, 0, part);
  return { ...options, parts: cleanParts(parts) };
}

/** Monte ou descend une partie cochée ; « Pour vous » reste à la fin. Même objet au bord. */
export function movePart(options: BibleExportOptions, part: PartKey, way: "up" | "down"): BibleExportOptions {
  const pub: PartKey[] = options.parts.filter((p) => !isPrivatePart(p));
  const i = pub.indexOf(part);
  const j = way === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= pub.length) return options;
  [pub[i], pub[j]] = [pub[j], pub[i]];
  return { ...options, parts: [...pub, ...options.parts.filter(isPrivatePart)] };
}

/** Nom du fichier : « Dossier de présentation - Titre - 2026-10-25 ». */
export function bibleFileName(kind: string, title: string, date: Date): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0")).join("-");
  return `${kind} - ${title} - ${day}`;
}
