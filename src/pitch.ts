// Couverture du projet, en tête de la Bible : tagline, logline, résumé, note d'intention, comparables,
// et des pastilles (genre, cible, format, point de vue, temps du récit, ton). Fonctions pures.
//
// Dans cosmos.json, un bloc facultatif :
//   "pitch": { "tagline": "…", "logline": "…", "genre": "Thriller psychologique" }
// Les clés sont écrites dans le fichier : ne jamais les renommer ni les traduire. Les valeurs sont le
// texte de l'auteur, dans sa langue (une pastille choisie dans les suggestions garde le libellé choisi).
// Le volume n'est pas saisi ici : il vient de l'objectif d'écriture. Les thèmes sont les cartes Thème.

/**
 * Textes de la couverture, dans l'ordre d'affichage. Les derniers (Bible v2) ne servent qu'à un scénario :
 * la sous-partie « Écrire la série » (`SERIES_TEXTS`).
 */
export const PITCH_TEXTS = [
  "tagline",
  "logline",
  "resume",
  "comps",
  "intention",
  "pourquoi",
  "promesse",
  "arene",
  "mecanique",
  "episodeType",
  "episodes",
  "aFaire",
  "aEviter",
  "pistes",
] as const;
/** Pastilles : une valeur courte, choisie dans une liste ou saisie librement. */
export const PITCH_CHIPS = ["genre", "cible", "format", "pov", "temps", "ton", "statut", "credits", "dapres"] as const;

export type PitchText = (typeof PITCH_TEXTS)[number];
/** Textes propres à une série : sous-partie « Écrire la série » de la couverture d'un scénario. */
export const SERIES_TEXTS = ["pourquoi", "promesse", "arene", "mecanique", "episodeType", "episodes", "aFaire", "aEviter", "pistes"] as const satisfies readonly PitchText[];
/** Pastilles d'un roman seulement (un scénario est toujours au présent, vu par la caméra). */
export const NOVEL_CHIPS = ["pov", "temps"] as const satisfies readonly (typeof PITCH_CHIPS)[number][];
export type PitchChip = (typeof PITCH_CHIPS)[number];
export type PitchField = PitchText | PitchChip;
export type Pitch = Partial<Record<PitchField, string>>;

const FIELDS: readonly PitchField[] = [...PITCH_TEXTS, ...PITCH_CHIPS];
const MAX_TEXT = 6000;
const MAX_CHIP = 120;

const limit = (key: PitchField) => ((PITCH_CHIPS as readonly string[]).includes(key) ? MAX_CHIP : MAX_TEXT);

/** Clé d'un champ qu'une version future aurait ajouté : gardée et réécrite telle quelle, jamais affichée. */
const FUTURE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_FUTURE = 40;

/**
 * Couverture lue dans cosmos.json : les clés connues et leurs textes non vides. Une clé inconnue (champ d'une
 * version plus récente) qui porte un texte est gardée telle quelle, pour être réécrite : ouvrir le projet ici
 * ne la perd pas. Les versions 1.3 et avant, elles, perdaient ces clés à l'enregistrement.
 */
export function readPitch(raw: unknown): Pitch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Pitch = {};
  for (const key of FIELDS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) out[key] = value.slice(0, limit(key));
  }
  let future = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if ((FIELDS as readonly string[]).includes(key) || !FUTURE_KEY.test(key) || typeof value !== "string" || !value.trim()) continue;
    if (future++ >= MAX_FUTURE) break;
    (out as Record<string, string>)[key] = value.slice(0, MAX_TEXT);
  }
  return out;
}

/** Couverture après modification d'un champ (vidé : retiré). Même objet si rien ne change. */
export function setPitchField(pitch: Pitch, key: PitchField, value: string): Pitch {
  const next = value.slice(0, limit(key));
  if ((pitch[key] ?? "") === next || (!next.trim() && !(key in pitch))) return pitch;
  const out = { ...pitch };
  if (next.trim()) out[key] = next;
  else delete out[key];
  return out;
}

export const isEmptyPitch = (pitch: Pitch) => Object.keys(pitch).length === 0;

/** Champs de la couverture selon le type de projet. */
export const pitchFields = (kind: "roman" | "scenario" = "roman"): PitchField[] =>
  FIELDS.filter((key) => (kind === "scenario" ? !(NOVEL_CHIPS as readonly string[]).includes(key) : !(SERIES_TEXTS as readonly string[]).includes(key)));

/** Champs remplis, pour le repère discret de la couverture. */
export const pitchFilled = (pitch: Pitch, kind: "roman" | "scenario" = "roman") => pitchFields(kind).filter((key) => pitch[key]?.trim()).length;

/** Épisodes d'une série : une ligne par épisode, « Titre : synopsis » (le titre seul est permis). */
export function readEpisodes(text: string | undefined): { title: string; synopsis: string }[] {
  return (text ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.{1,120}?)\s*:\s+(.+)$/);
      return m ? { title: m[1].trim(), synopsis: m[2].trim() } : { title: line, synopsis: "" };
    });
}

/** Suggestions d'une pastille, sans celle déjà choisie, sans doublon (casse et accents ignorés). */
export function chipSuggestions(list: readonly string[], current: string | undefined): string[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const seen = new Set<string>(current ? [norm(current)] : []);
  const out: string[] = [];
  for (const item of list) {
    const key = norm(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Champs que « Questionner » peut remplir, dans l'ordre des questions. */
export const askableFields = (kind: "roman" | "scenario"): PitchText[] =>
  PITCH_TEXTS.filter((key) => kind === "scenario" || !(SERIES_TEXTS as readonly string[]).includes(key));

/**
 * Prochaine question de « Questionner » : le premier champ vide qui n'a pas été passé. Quand tous les champs
 * vides ont été passés, on reprend celui qui a été passé il y a le plus longtemps (`skipped` est dans l'ordre
 * des passages : le dernier passé à la fin). Null : tout est rempli.
 */
export function nextAsk(pitch: Pitch, kind: "roman" | "scenario", skipped: readonly string[]): PitchText | null {
  const empty = askableFields(kind).filter((key) => !pitch[key]?.trim());
  return empty.find((key) => !skipped.includes(key)) ?? [...empty].sort((a, b) => skipped.indexOf(a) - skipped.indexOf(b))[0] ?? null;
}
