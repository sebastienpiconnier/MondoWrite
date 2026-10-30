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
  "pourquoiMoi",
  "promesse",
  "nestPas",
  "arene",
  // Lot 7 (modèle de Final Draft) : ce qui précède le pilote, ce qui tient la bande ensemble.
  "avantPilote",
  "ensemble",
  "mecanique",
  "episodeType",
  "episodes",
  "saison",
  "finSaison",
  // Lot 7 : les saisons suivantes en quelques lignes.
  "suite",
  "aFaire",
  "aEviter",
  "pistes",
  // Lot 7 : autres supports (podcast, roman graphique, jeu…), imprimés pour un tiers seulement.
  "supports",
  // Octobre 2026 : un film (long, court, téléfilm) a ses rubriques à lui (`FILM_TEXTS`).
  "noteRealisation",
  "traitement",
  "faisabilite",
] as const;
/** Pastilles : une valeur courte, choisie dans une liste ou saisie librement. */
export const PITCH_CHIPS = ["genre", "cible", "format", "forme", "pilote", "pov", "temps", "ton", "statut", "credits", "dapres"] as const;

export type PitchText = (typeof PITCH_TEXTS)[number];
/**
 * Textes propres à une série : sous-partie « Écrire la série » de la couverture d'un scénario. `episodes` n'y est
 * plus (lot 6) : chaque épisode est une carte Épisode, et la clé n'est relue que pour la reprise (episodes.ts).
 */
export const SERIES_TEXTS = [
  "pourquoi",
  "pourquoiMoi",
  "promesse",
  "nestPas",
  "arene",
  "avantPilote",
  "ensemble",
  "mecanique",
  "episodeType",
  "saison",
  "finSaison",
  "suite",
  "aFaire",
  "aEviter",
  "pistes",
  "supports",
] as const satisfies readonly PitchText[];
/**
 * Textes d'un film (long métrage, court métrage, téléfilm) : sous-partie « Écrire le film ». Ceux d'une série
 * qui valent aussi pour un film y sont repris ; le traitement est en option (un bouton l'ajoute), la faisabilité
 * part des statistiques du scénario (feasibility.ts) et reste modifiable.
 */
export const FILM_TEXTS = [
  "pourquoi",
  "pourquoiMoi",
  "nestPas",
  "noteRealisation",
  "traitement",
  "faisabilite",
  "aFaire",
  "aEviter",
  "pistes",
] as const satisfies readonly PitchText[];

/**
 * Forme d'un projet, lue dans la pastille Format (aucun réglage de plus) : un roman ; un film ; une série ;
 * une mini-série (une saison, sans suite) ; ou un scénario dont le format n'est pas encore choisi. Sans format,
 * une couverture qui a déjà des rubriques de série (projet d'avant octobre 2026) reste une série.
 */
export type ProjectForm = "roman" | "film" | "serie" | "miniserie" | "libre";

const SERIES_ONLY: readonly string[] = ["promesse", "arene", "avantPilote", "ensemble", "mecanique", "episodeType", "saison", "finSaison", "suite", "supports", "episodes", "forme", "pilote"];

export function formOf(kind: "roman" | "scenario", pitch: Pitch): ProjectForm {
  if (kind !== "scenario") return "roman";
  const format = (pitch.format ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/mini/.test(format)) return "miniserie";
  if (/serie|episode|saison|season/.test(format)) return "serie";
  if (/metrage|telefilm|film|feature|short|movie|court|long/.test(format)) return "film";
  return SERIES_ONLY.some((k) => (pitch as Record<string, string | undefined>)[k]?.trim()) ? "serie" : "libre";
}

export const isSeriesForm = (form: ProjectForm) => form === "serie" || form === "miniserie";

/** Rubriques d'écriture de la couverture pour cette forme (« Écrire la série » ou « Écrire le film »). */
export function writingTexts(form: ProjectForm): readonly PitchText[] {
  if (form === "serie") return SERIES_TEXTS;
  if (form === "miniserie") return SERIES_TEXTS.filter((k) => k !== "suite");
  if (form === "film") return FILM_TEXTS;
  return [];
}

/** Rubriques remplies qui ne sont pas celles de la forme (un film qui était une série) : montrées à part, jamais perdues. */
export function otherTexts(pitch: Pitch, form: ProjectForm): PitchText[] {
  if (form === "roman") return [];
  const own: readonly string[] = writingTexts(form);
  return [...new Set<PitchText>([...SERIES_TEXTS, ...FILM_TEXTS])].filter((k) => !own.includes(k) && !!pitch[k]?.trim());
}

/** Pastilles d'un roman seulement (un scénario est toujours au présent, vu par la caméra). */
export const NOVEL_CHIPS = ["pov", "temps"] as const satisfies readonly (typeof PITCH_CHIPS)[number][];
/** Pastilles d'une série seulement (lot 7) : forme (bouclée, feuilletonnante, hybride) et type de pilote. */
export const SERIES_CHIPS = ["forme", "pilote"] as const satisfies readonly (typeof PITCH_CHIPS)[number][];

/**
 * Pastilles de la couverture pour ce type de projet, dans l'ordre. Forme et pilote pour une série seulement
 * (sans forme donnée, un scénario est lu comme une série, comme avant octobre 2026).
 */
export const chipsFor = (kind: "roman" | "scenario", form: ProjectForm = kind === "scenario" ? "serie" : "roman"): PitchChip[] =>
  PITCH_CHIPS.filter((c) => !((kind === "scenario" ? NOVEL_CHIPS : SERIES_CHIPS) as readonly string[]).includes(c)).filter(
    (c) => kind !== "scenario" || isSeriesForm(form) || !(SERIES_CHIPS as readonly string[]).includes(c),
  );
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

/** Champs de la couverture selon le type de projet. */
/** Clés relues mais plus saisies sur la couverture (les épisodes sont des cartes depuis le lot 6). */
const RETIRED: readonly string[] = ["episodes"];

/** Rubriques d'écriture (série ou film), qui ne valent que pour la forme qui les montre. */
const WRITING: readonly string[] = [...new Set<string>([...SERIES_TEXTS, ...FILM_TEXTS])];

export const pitchFields = (kind: "roman" | "scenario" = "roman", form: ProjectForm = kind === "scenario" ? "serie" : "roman"): PitchField[] => {
  const own: readonly string[] = writingTexts(form);
  const chips: readonly string[] = chipsFor(kind, form);
  return FIELDS.filter((key) => !RETIRED.includes(key)).filter((key) =>
    (PITCH_CHIPS as readonly string[]).includes(key) ? chips.includes(key) : !WRITING.includes(key) || own.includes(key),
  );
};

/** Champs remplis, pour le repère discret de la couverture. */
export const pitchFilled = (pitch: Pitch, kind: "roman" | "scenario" = "roman", form?: ProjectForm) => pitchFields(kind, form).filter((key) => pitch[key]?.trim()).length;

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
/** Le traitement (long, en option) et la faisabilité (tirée des statistiques) ne se demandent pas. */
const NOT_ASKED: readonly string[] = ["traitement", "faisabilite"];

export const askableFields = (kind: "roman" | "scenario", form: ProjectForm = kind === "scenario" ? "serie" : "roman"): PitchText[] => {
  const own: readonly string[] = writingTexts(form);
  return PITCH_TEXTS.filter((key) => !RETIRED.includes(key) && !NOT_ASKED.includes(key)).filter((key) => !WRITING.includes(key) || own.includes(key));
};

/**
 * Prochaine question de « Questionner » : le premier champ vide qui n'a pas été passé. Quand tous les champs
 * vides ont été passés, on reprend celui qui a été passé il y a le plus longtemps (`skipped` est dans l'ordre
 * des passages : le dernier passé à la fin). Null : tout est rempli.
 */
export function nextAsk(pitch: Pitch, kind: "roman" | "scenario", skipped: readonly string[], form?: ProjectForm): PitchText | null {
  const empty = askableFields(kind, form).filter((key) => !pitch[key]?.trim());
  return empty.find((key) => !skipped.includes(key)) ?? [...empty].sort((a, b) => skipped.indexOf(a) - skipped.indexOf(b))[0] ?? null;
}
