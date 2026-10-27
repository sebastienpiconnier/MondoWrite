// Modèle de données de MondoWrite.
// Une carte naît "idee" (note libre) et peut être typée plus tard via le menu "/".

import type { Screenplay } from "./screenplay/model";
import type { Paper } from "./screenplay/layout";
import type { Plan } from "./plan";
import type { Goals, Progress } from "./stats";
import type { Pitch } from "./pitch";
import type { PrintOptions } from "./export/printOptions";
import type { ScriptPrint } from "./screenplay/export/scriptPrint";

export type CardType =
  | "idee"
  | "personnage"
  | "lieu"
  | "scene"
  | "intrigue"
  | "theme"
  | "question"
  | "image"
  | "lien"
  | "document"
  | "episode"
  // Lot 7 de la Bible v2 : les cartes du monde.
  | "evenement"
  | "objet"
  | "regle"
  | "groupe"
  | "secret";

/**
 * Nature du projet. Change le vocabulaire (Lieu → Décor, Plan → Séquencier…), le style des
 * scènes (en-têtes de scène) et, plus tard, l'éditeur de la vue Manuscrit (format scénario).
 * Les clés internes et le format des cartes restent identiques : on peut basculer à tout moment.
 */
export type ProjectKind = "roman" | "scenario";
export const PROJECT_KINDS: ProjectKind[] = ["roman", "scenario"];
export const isProjectKind = (v: unknown): v is ProjectKind => v === "roman" || v === "scenario";

/** Types dans l'ordre des menus. Libellés : i18n (`t.types[type]`). Couleurs : styles.css (`--type-<type>`). */
export const CARD_TYPES: CardType[] = ["idee", "personnage", "lieu", "scene", "intrigue", "episode", "groupe", "objet", "evenement", "regle", "secret", "theme", "question", "image", "lien", "document"];

/**
 * Types proposés dans un projet (menus, filtres, rubriques) : l'Épisode (lot 6 de la Bible v2) ne sert qu'à une
 * série. Un roman qui a déjà des cartes Épisode (scénario rebasculé en roman) les garde visibles.
 */
export const typesFor = (kind: ProjectKind, present = false): CardType[] => (kind === "scenario" || present ? CARD_TYPES : CARD_TYPES.filter((t) => t !== "episode"));

/** Ordre des parties de la bible : les personnages d'abord, les idées en vrac à la fin. */
export const BIBLE_ORDER: CardType[] = ["personnage", "intrigue", "lieu", "groupe", "objet", "evenement", "regle", "episode", "secret", "scene", "theme", "question", "image", "lien", "document", "idee"];

/** Couleur d'un type, en variable CSS (s'adapte au mode clair/sombre). */
export const typeColor = (t: CardType) => `var(--type-${t})`;

/** Contenu d'une carte. Le corps est stocké en Markdown sur disque, en HTML dans l'éditeur. */
export interface CardData {
  id: string;
  type: CardType;
  title: string;
  /** Corps en HTML (format de travail de TipTap). Converti en Markdown à la sauvegarde. */
  html: string;
  /** Image de la carte : nom d'un fichier du dossier medias/ du projet. */
  image?: string;
  /** Carte Document : le PDF, nom d'un fichier de medias/ (son aperçu, la première page, est dans `image`). */
  fichier?: string;
  /** Photos supplémentaires de la fiche (galerie de la Bible), noms de fichiers de medias/. */
  images?: string[];
  /** Personnage, lieu, intrigue : caractéristiques standard (clés fixes, voir SHEET_FIELDS dans character.ts). Absent : rien de rempli. */
  fiche?: Record<string, string>;
  /** Carte Scène : page hors récit du livre (page de titre, dédicace, prologue…), voir book.ts. Absent : une scène. */
  page?: string;
  /** Questions gardées pour plus tard (« Je ne sais pas encore »). Elles vivent dans la carte, pas sur le canevas. */
  questions?: string[];
  /** Personnage : réponses aux questions de l'assistant qui ne remplissent pas un champ de la fiche, par clé de question. */
  reponses?: Record<string, string>;
  /**
   * Ce qu'une version plus récente de MondoWrite a écrit et que celle-ci ne connaît pas : lignes du
   * frontmatter, champs de la fiche, type de carte. Gardé tel quel et réécrit, jamais affiché.
   */
  keep?: { front?: Record<string, string>; fiche?: Record<string, string>; type?: string };
  /**
   * Carnet (iPhone) : carte capturée en passant, encore à ranger. Elle attend dans « À ranger » du canevas jusqu'à
   * ce qu'on la déplace, qu'on la relie ou qu'on la dise rangée. Écrit seulement quand c'est vrai.
   */
  inbox?: boolean;
  /** Carte dans la corbeille (fichier de corbeille/) : jour, place sur le canevas, fils, scène du scénario. */
  trashed?: import("./trash").TrashInfo;
  [key: string]: unknown; // requis par React Flow pour data
}

/** Position d'une carte sur la toile. */
export interface CardLayout {
  id: string;
  x: number;
  y: number;
  width?: number;
}

/** Cadre de regroupement : un rectangle nommé derrière les cartes (« Acte 1 ? », « Le phare »). */
export interface Frame {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** « research » : la zone Recherche, où atterrissent les sources collées. Absent : un cadre ordinaire. */
  kind?: "research";
  /** Verrouillé : « Organiser » n'y touche pas (ni au cadre, ni aux cartes qu'il contient), et il ne se déplace,
   *  ne se redimensionne ni ne se supprime par mégarde. Écrit seulement quand il est vrai. */
  locked?: boolean;
}

/** Fil entre deux cartes, avec une étiquette libre ("soupçonne", "se passe à"…). */
export interface Link {
  id: string;
  source: string;
  target: string;
  label: string;
}

/** Fichier cosmos.json : tout ce qui n'est pas du texte. */
export interface ProjectMeta {
  version: 1;
  title: string;
  /** Absent dans les projets créés avant le mode scénario : vaut alors "roman". */
  kind?: ProjectKind;
  /** Format de page du scénario. Absent : "letter". */
  paper?: Paper;
  /** Scénario : numéroter les scènes (éditeur, PDF, FDX). Absent : non. */
  sceneNumbers?: boolean;
  /** Scénario : en-têtes de scène soulignés (éditeur, PDF, FDX). Absent : non. */
  underlineHeadings?: boolean;
  /** Copies Markdown (manuscrit, bible, canevas) dans markdown/. Absent : oui ; false : arrêtées. */
  markdownCopies?: boolean;
  layout: CardLayout[];
  links: Link[];
  /** Cadres de regroupement. Absent : aucun. Les cartes n'y sont pas rattachées : c'est leur position qui compte. */
  frames?: Frame[];
  /** Plan d'un roman : gabarit et scènes rangées dans ses cases. Absent : plan libre, rien de rangé. */
  plan?: Plan;
  /** Objectifs d'écriture (mots par jour, mots du livre). Absent : aucun. */
  goals?: Goals;
  /** Mots du manuscrit au début et à la fin de chaque jour d'écriture. Absent : rien d'écrit encore. */
  progress?: Progress;
  /** Couverture du projet (tagline, logline, résumé, pastilles…), voir pitch.ts. Absent : rien de rempli. */
  pitch?: Pitch;
  /** Passages retirés du manuscrit et gardés au chutier, voir chutier.ts. Absent : aucun. */
  chutier?: unknown[];
  /** Réglages du livre broché (format, papier, ISBN, pages de fin), voir export/printOptions.ts. Absent : valeurs par défaut. */
  print?: PrintOptions;
  /** Réglages de l'export PDF du scénario (contenu, en-tête, filigrane…), voir screenplay/export/scriptPrint.ts. Absent : format standard. */
  scriptPdf?: ScriptPrint;
  /** Réglages de l'export de la Bible (pour qui, parties, rendu) et réglages nommés, voir bibleExport.ts. Absent : valeurs par défaut. */
  bibleExport?: unknown;
  viewport?: { x: number; y: number; zoom: number };
}

/** Projet complet en mémoire. */
export interface Project {
  meta: ProjectMeta;
  cards: CardData[];
  /** Texte du scénario (scenario.fountain). null tant que le projet n'en a pas. */
  screenplay: Screenplay | null;
  /** Manuscrit d'un roman : texte de chaque scène (HTML), par identifiant de carte. Absent : rien d'écrit. */
  manuscript?: Record<string, string>;
  /** Cartes de la corbeille (corbeille/<id>.md). Absent : corbeille vide. */
  trash?: CardData[];
}
