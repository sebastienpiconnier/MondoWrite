// Modèle en mémoire d'un scénario : une liste plate d'éléments, pas un arbre.
// Le fichier scenario.fountain reste la source de vérité sur disque (voir parse.ts et serialize.ts).

export type ElementType =
  | "sceneHeading"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "centered"
  | "pageBreak"
  | "section"
  | "synopsis"
  | "note"
  | "boneyard";

export interface ScreenplayElement {
  type: ElementType;
  /**
   * Texte sans les marqueurs Fountain (pas de « . » forcé, pas de « @ », pas de « > »).
   * Les parenthèses d'une didascalie font partie du texte. Plusieurs lignes = « \n ».
   */
  text: string;
  /** sceneHeading : carte liée, lue dans la note [[cosmos:id]]. */
  cardId?: string;
  /** sceneHeading : numéro de scène (#12A# en fin d'en-tête). */
  sceneNumber?: string;
  /** character : dialogue double (^). */
  dual?: boolean;
  /** section : niveau (nombre de #), 1 par défaut. */
  depth?: number;
  /** L'élément était forcé dans le source (., @, !, >). */
  forced?: boolean;
  /** Mode Atelier : texte proposé par l'IA et accepté, note [[ia]] en fin d'élément (action, réplique, didascalie, synopsis). */
  ia?: boolean;
}

export interface Screenplay {
  /** Page de titre : Title, Credit, Author, Draft date… Une valeur sur plusieurs lignes contient des « \n ». */
  titlePage: Record<string, string>;
  elements: ScreenplayElement[];
}

/** Les six éléments que l'interface propose. Les autres sont conservés tels quels. */
export const EDITABLE_TYPES = [
  "sceneHeading",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
] as const satisfies readonly ElementType[];
