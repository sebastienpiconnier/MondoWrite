// Gabarit de la page de scénario : une seule source de vérité pour le compteur de pages
// (paginate.ts) et, plus tard, pour le PDF. Courier 12 points : 10 caractères par pouce, 6 lignes par pouce.

import type { ElementType } from "./model";

export type Paper = "letter" | "a4";
export const PAPERS: Paper[] = ["letter", "a4"];
export const isPaper = (v: unknown): v is Paper => v === "letter" || v === "a4";
/** Format proposé à un nouveau scénario : US Letter en anglais (l'usage d'Amérique du Nord), A4 dans toute autre langue. */
export const defaultPaper = (lang: string): Paper => (/^en(-us|-ca)?$/i.test(lang) ? "letter" : "a4");

export interface Layout {
  paper: Paper;
  /** Dimensions et marges, en pouces. */
  width: number;
  height: number;
  margin: { top: number; bottom: number; left: number; right: number };
  /** Lignes de texte par page (constante à ajuster si le PDF s'écarte de plus de 5 %). */
  linesPerPage: number;
  /** Hauteur totale de la page en lignes, marges comprises (6 lignes par pouce) : sert à l'écran. */
  pageLines: number;
  /** Largeur de chaque élément, en caractères. */
  columns: Record<"action" | "character" | "parenthetical" | "dialogue", number>;
  /** Retrait depuis la marge gauche, en caractères. */
  indent: Record<"character" | "parenthetical" | "dialogue", number>;
}

const MARGIN = { top: 1, bottom: 1, left: 1.5, right: 1 };
const CHARS_PER_INCH = 10;

function layout(paper: Paper, width: number, height: number, linesPerPage: number): Layout {
  return {
    paper,
    width,
    height,
    margin: MARGIN,
    linesPerPage,
    pageLines: height * 6,
    columns: {
      // Letter : 8,5 − 1,5 − 1 = 6 pouces, soit 60 caractères. A4 : 57.
      action: Math.floor((width - MARGIN.left - MARGIN.right) * CHARS_PER_INCH + 1e-6),
      character: 38,
      parenthetical: 25,
      dialogue: 35,
    },
    // Dialogue à 2,5 pouces du bord, didascalie à 3,1, personnage à 3,7.
    indent: { dialogue: 10, parenthetical: 16, character: 22 },
  };
}

export const LAYOUTS: Record<Paper, Layout> = {
  letter: layout("letter", 8.5, 11, 55),
  // A4 : plus étroit (57 caractères) et plus haut (4 lignes de plus).
  a4: layout("a4", 8.27, 11.69, 59),
};

/** Largeur en caractères d'un élément ; 0 pour ce qui ne s'imprime pas (notes, sections…). */
export function columnsFor(type: ElementType, l: Layout): number {
  switch (type) {
    case "character":
    case "parenthetical":
    case "dialogue":
      return l.columns[type];
    case "sceneHeading":
    case "action":
    case "transition":
    case "centered":
      return l.columns.action;
    default:
      return 0;
  }
}
