// Couverture du projet, en tête de la Bible : tagline, logline, résumé, note d'intention, comparables,
// et des pastilles (genre, cible, format, point de vue, temps du récit, ton). Fonctions pures.
//
// Dans cosmos.json, un bloc facultatif :
//   "pitch": { "tagline": "…", "logline": "…", "genre": "Thriller psychologique" }
// Les clés sont écrites dans le fichier : ne jamais les renommer ni les traduire. Les valeurs sont le
// texte de l'auteur, dans sa langue (une pastille choisie dans les suggestions garde le libellé choisi).
// Le volume n'est pas saisi ici : il vient de l'objectif d'écriture. Les thèmes sont les cartes Thème.

/** Textes de la couverture, dans l'ordre d'affichage. */
export const PITCH_TEXTS = ["tagline", "logline", "resume", "comps", "intention"] as const;
/** Pastilles : une valeur courte, choisie dans une liste ou saisie librement. */
export const PITCH_CHIPS = ["genre", "cible", "format", "pov", "temps", "ton"] as const;

export type PitchText = (typeof PITCH_TEXTS)[number];
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
 * ne la perd pas. La 1.3.0 et les versions d’avant, elles, perdaient ces clés à l’enregistrement.
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

/** Champs remplis, pour le repère discret de la couverture. */
export const pitchFilled = (pitch: Pitch) => FIELDS.filter((key) => pitch[key]?.trim()).length;
export const PITCH_FIELD_COUNT = FIELDS.length;

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
