// Fiche d'un personnage : des caractéristiques standard, facultatives, et les questions gardées pour
// plus tard. Fonctions pures.
//
// Dans cartes/<id>.md, deux lignes facultatives du frontmatter :
//   fiche: {"age":"34","metier":"Gardienne de phare"}
//   questions: ["Que cache-t-elle aux autres ?"]
// Les clés de la fiche sont écrites dans le fichier : ne jamais les renommer ni les traduire.

import type { CardData, CardType, Link } from "./types";

/** Caractéristiques standard, dans l'ordre de la fiche. Libellés : `t.character.fields`. */
export const CHARACTER_FIELDS = [
  "role",
  "genre",
  "age",
  "metier",
  "surnoms",
  "origine",
  "apparence",
  "personnalite",
  "voix",
  "objectif",
  "besoin",
  "blessure",
  "motivation",
  "force",
  "faille",
  "peur",
  "secret",
  "relations",
  "arcType",
  "arc",
  // Bible v2 : accroche d'une ligne, arc en deux temps, personnage principal (valeur « oui » ou absente).
  "accroche",
  "debut",
  "fin",
  "principal",
  // Bible v2, lot 4 (bible de série) : enjeux à trois étages et consigne d'écriture, facultatifs.
  "enjeuExt",
  "enjeuRel",
  "enjeuInt",
  "ecriture",
  // Bible v2, lot 7 : profondeur (Final Draft, et l'échange sur les cartes d'une bible), sous « Ajouter si utile ».
  "paradoxe",
  "dilemme",
  "croyance",
  "valeur",
  "angleMort",
  "strategie",
] as const;
export type CharacterField = (typeof CHARACTER_FIELDS)[number];

/**
 * Moteur d'un personnage, en tête de sa fiche dans la Bible : trois cases lues d'un coup d'œil.
 * Un antagoniste (rôle qui le dit) montre ce qui le pousse, sa force et sa faille.
 */
export const MOTOR_FIELDS = ["objectif", "besoin", "blessure"] as const satisfies readonly CharacterField[];
export const ANTAGONIST_FIELDS = ["motivation", "force", "faille"] as const satisfies readonly CharacterField[];

/** Le rôle saisi désigne un antagoniste (en français ou en anglais, casse et accents ignorés). */
export const isAntagonist = (card: Pick<CardData, "fiche">) => /antagon|villain|m[ée]chant|nemesis|n[ée]m[ée]sis/i.test(card.fiche?.role ?? "");

/** Cases du moteur pour ce personnage. */
export const motorFields = (card: Pick<CardData, "fiche">): readonly CharacterField[] => (isAntagonist(card) ? ANTAGONIST_FIELDS : MOTOR_FIELDS);

/** Types d'arc : valeurs écrites dans le fichier (`arcType`), jamais traduites. Libellés : `t.character.arcTypes`. */
export const ARC_TYPES = ["positif", "negatif", "plat"] as const;
export type ArcType = (typeof ARC_TYPES)[number];
export const isArcType = (v: unknown): v is ArcType => typeof v === "string" && (ARC_TYPES as readonly string[]).includes(v);

/** Champs d'un personnage montrés hors de la liste de la fiche : en-tête (accroche, principal) et arc. */
export const CHARACTER_HEAD_FIELDS = ["arcType", "arc", "accroche", "debut", "fin", "principal"] as const satisfies readonly CharacterField[];

/** Valeur écrite pour un personnage principal (jamais traduite). */
export const PRINCIPAL = "oui";
export const isPrincipal = (card: Pick<CardData, "type" | "fiche">) => card.type === "personnage" && card.fiche?.principal === PRINCIPAL;

/** Champs montrés ailleurs que dans la liste de la fiche (bande du moteur, choix de l'arc). */
export function bandFields(card: Pick<CardData, "type" | "fiche">): ReadonlySet<string> {
  // Le statut d'une scène a son propre sélecteur (SceneStatusPicker) : pas une ligne de la fiche.
  if (card.type === "scene") return new Set<string>(["statut"]);
  return card.type === "personnage" ? new Set<string>([...motorFields(card), ...CHARACTER_HEAD_FIELDS]) : new Set<string>();
}

/** Valeur d'un champ telle qu'on la lit (le type d'arc est une clé, montrée par son libellé). */
export const ficheText = (key: string, value: string, arcLabels?: Record<string, string>) =>
  key === "arcType" || key === "statut" || isChoiceField(key) ? (arcLabels?.[value] ?? value) : value;

/** Fiche d'un lieu (idée reprise de la Bible du fork de NEO). */
export const PLACE_FIELDS = ["epoque", "ambiance", "evenements", "importance"] as const;
/** Fiche d'une intrigue : sa question dramatique et son parcours, du déclencheur à la résolution. */
/** Fiche d'un lien ou d'une image collés : d'où vient l'information. */
export const SOURCE_FIELDS = ["url", "auteur", "publication", "consulte", "retenir", "fiabilite"] as const;
/** Fiche d'un document importé (PDF) : d'où il vient et sa longueur. */
export const DOCUMENT_FIELDS = ["auteur", "publication", "pages", "retenir", "fiabilite"] as const;
/**
 * Fiche d'un épisode de série : numéro (ordre de la saison), synopsis de trois ou quatre phrases, personnage
 * pivot (identifiant d'une carte Personnage). Les fils présents sont les fils du canevas vers les Intrigues.
 */
export const EPISODE_FIELDS = ["numero", "saison", "repere", "synopsis", "pivot"] as const;

// Lot 7 : les cartes du monde. Qui garde un secret, qui appartient à un groupe, qui porte un objet : les fils.
export const EVENT_FIELDS = ["quand", "consequences", "recit"] as const;
export const OBJECT_FIELDS = ["origine", "usage", "symbole", "emplacement"] as const;
export const RULE_FIELDS = ["portee", "exceptions", "cout", "transgression"] as const;
export const GROUP_FIELDS = ["nature", "but", "fonctionnement", "ressources"] as const;
export const SECRET_FIELDS = ["verite", "enjeu", "indices", "revelation"] as const;
/** Carte Question : où elle en est (`etat`) et ce qui a été décidé. */
export const QUESTION_FIELDS = ["etat", "decision"] as const;
export const PLOT_FIELDS = ["nature", "question", "enjeu", "declencheur", "obstacles", "tournant", "resolution"] as const;

/** Champs de la fiche de chaque type de carte qui en a une. Clés écrites dans le fichier : ne jamais les renommer. */
/** Scène d'un roman : ce qui s'y passe, en une phrase (le scénario garde le sien dans le fichier Fountain). */
export const SCENE_FIELDS = ["synopsis", "statut", "but", "obstacle", "tournant", "changement", "issue"] as const;

/** Statut d'une scène : valeurs écrites dans le fichier (`fiche.statut`), jamais traduites. Libellés : `t.status.values`. */
export const SCENE_STATUSES = ["brouillon", "revoir", "fini"] as const;
export type SceneStatus = (typeof SCENE_STATUSES)[number];
export const isSceneStatus = (v: unknown): v is SceneStatus => typeof v === "string" && (SCENE_STATUSES as readonly string[]).includes(v);
export const sceneStatus = (card: Pick<CardData, "type" | "fiche">): SceneStatus | null => (card.type === "scene" && isSceneStatus(card.fiche?.statut) ? card.fiche!.statut as SceneStatus : null);

export const SHEET_FIELDS: Partial<Record<CardType, readonly string[]>> = {
  scene: SCENE_FIELDS,
  personnage: CHARACTER_FIELDS,
  lieu: PLACE_FIELDS,
  intrigue: PLOT_FIELDS,
  episode: EPISODE_FIELDS,
  lien: SOURCE_FIELDS,
  image: SOURCE_FIELDS,
  document: DOCUMENT_FIELDS,
  evenement: EVENT_FIELDS,
  objet: OBJECT_FIELDS,
  regle: RULE_FIELDS,
  groupe: GROUP_FIELDS,
  secret: SECRET_FIELDS,
  question: QUESTION_FIELDS,
};
export type SheetField =
  | CharacterField
  | (typeof PLACE_FIELDS)[number]
  | (typeof PLOT_FIELDS)[number]
  | (typeof SOURCE_FIELDS)[number]
  | (typeof DOCUMENT_FIELDS)[number]
  | (typeof SCENE_FIELDS)[number]
  | (typeof EPISODE_FIELDS)[number]
  | (typeof EVENT_FIELDS)[number]
  | (typeof OBJECT_FIELDS)[number]
  | (typeof RULE_FIELDS)[number]
  | (typeof GROUP_FIELDS)[number]
  | (typeof SECRET_FIELDS)[number]
  | (typeof QUESTION_FIELDS)[number]
  | "certitude";

/**
 * Champs à choix : valeurs écrites dans le fichier, jamais traduites (libellés : `t.fiche.values`). Une valeur
 * inconnue est ignorée à la lecture. `certitude` (lot 7) vaut pour toute fiche sauf celle d'une scène, qui a
 * déjà son statut.
 */
export const CHOICE_FIELDS = {
  certitude: ["etabli", "provisoire", "explorer"],
  etat: ["ouverte", "decidee", "abandonnee"],
  repere: ["milieu", "final"],
  // Scène : finit-elle mieux ou moins bien pour le héros ? Dessine la courbe du récit (ruban).
  issue: ["mieux", "pire", "pareil"],
} as const satisfies Partial<Record<SheetField, readonly string[]>>;
export type ChoiceField = keyof typeof CHOICE_FIELDS;
export const isChoiceField = (key: string): key is ChoiceField => key in CHOICE_FIELDS;

export const sheetFields = (type: CardType): readonly SheetField[] => {
  const own = (SHEET_FIELDS[type] ?? []) as readonly SheetField[];
  return own.length > 0 && type !== "scene" ? [...own, "certitude"] : own;
};

/** Question tranchée (décidée ou abandonnée) : elle passe en fin de rubrique, en gris. */
export const isSettledQuestion = (card: Pick<CardData, "type" | "fiche">) => card.type === "question" && (card.fiche?.etat === "decidee" || card.fiche?.etat === "abandonnee");

/** Champs courts (une ligne) ; les autres sont des zones de texte qui grandissent. */
/** Textes longs : toute la largeur de la fiche (CardSheet). */
export const WIDE_FIELDS: ReadonlySet<SheetField> = new Set(["synopsis"]);
export const SHORT_FIELDS: ReadonlySet<SheetField> = new Set(["numero", "saison", "quand", "fiabilite", "role", "genre", "age", "metier", "surnoms", "origine", "epoque", "nature", "url", "auteur", "publication", "consulte", "pages"]);

/** Adresse web d'une source, si elle en a une valide (http ou https). */
export function sourceUrl(card: Pick<CardData, "type" | "fiche">): string | null {
  const url = card.type === "lien" || card.type === "image" ? card.fiche?.url?.trim() : "";
  return url && /^https?:\/\/\S+$/i.test(url) ? url : null;
}

/** Ce que l'affiche d'un personnage montre sous son nom, dans cet ordre (idée reprise de la Bible du fork de NEO). */
export const POSTER_FIELDS: readonly CharacterField[] = ["genre", "age", "metier", "role"];

/** Surnoms d'un personnage, séparés par des virgules dans la fiche. */
export const nicknames = (card: Pick<CardData, "fiche">) =>
  (card.fiche?.surnoms ?? "").split(/[,;]/).map((n) => n.trim()).filter(Boolean);

const MAX_VALUE = 2000;
const MAX_QUESTIONS = 200;

/** Fiche lue sur disque : seules les clés connues et les textes sont gardés. */
export function readFiche(raw: unknown, type: CardType = "personnage"): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const key of sheetFields(type)) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (key === "arcType" && !isArcType(value)) continue;
    if (key === "statut" && !isSceneStatus(value)) continue;
    if (key === "principal" && value !== PRINCIPAL) continue;
    if (isChoiceField(key) && !(CHOICE_FIELDS[key] as readonly string[]).includes(value)) continue;
    out[key] = value.slice(0, MAX_VALUE);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Questions lues sur disque : des textes non vides, sans doublon. */
export function readQuestions(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = [...new Set(raw.filter((q): q is string => typeof q === "string").map((q) => q.trim()).filter(Boolean))].slice(0, MAX_QUESTIONS);
  return list.length > 0 ? list : undefined;
}

/** Fiche après modification d'un champ (vidé : retiré). undefined quand plus rien n'est rempli. */
export function setFicheField(fiche: Record<string, string> | undefined, key: SheetField, value: string): Record<string, string> | undefined {
  const next = { ...(fiche ?? {}) };
  if (value.trim()) next[key] = value;
  else delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

export const ficheCount = (card: Pick<CardData, "fiche">) => Object.values(card.fiche ?? {}).filter((v) => v.trim()).length;

/**
 * Deux textes de question identiques aux espaces près : les questions livrées ont une espace fine insécable
 * avant « ? » (1.7.4), celles gardées par les projets d'avant une espace ordinaire.
 */
export const sameQuestion = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

/** Questions de la carte, plus une. Même tableau si elle y est déjà. */
export function addQuestion(list: string[] | undefined, question: string): string[] | undefined {
  const q = question.trim();
  if (!q || list?.some((x) => sameQuestion(x, q))) return list;
  return [...(list ?? []), q];
}

/** Questions de la carte, moins une. undefined quand il n'en reste aucune. */
export function removeQuestion(list: string[] | undefined, question: string): string[] | undefined {
  if (!list?.some((x) => sameQuestion(x, question))) return list;
  const next = list.filter((q) => !sameQuestion(q, question));
  return next.length > 0 ? next : undefined;
}

/**
 * Anciennes cartes Question créées par « Je ne sais pas encore » (versions précédentes) : sans texte,
 * reliées par un seul fil, étiqueté « à creuser », à un personnage dont elles portent le nom en tête.
 * Rend, pour chacune, le personnage et la question à ranger dans sa carte.
 */
export function legacyParkedCards(cards: CardData[], links: Pick<Link, "source" | "target" | "label">[], labels: string[]): { cardId: string; characterId: string; question: string }[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const found: { cardId: string; characterId: string; question: string }[] = [];
  for (const card of cards) {
    if (card.type !== "question" || (card.html && card.html !== "<p></p>") || card.image) continue;
    const own = links.filter((l) => l.source === card.id || l.target === card.id);
    if (own.length !== 1 || !labels.includes(own[0].label)) continue;
    const other = byId.get(own[0].source === card.id ? own[0].target : own[0].source);
    if (!other || other.type !== "personnage") continue;
    const name = other.title.trim();
    const title = card.title.trim();
    const question = name && title.startsWith(`${name} : `) ? title.slice(name.length + 3).trim() : name ? "" : title;
    if (question) found.push({ cardId: card.id, characterId: other.id, question });
  }
  return found;
}
