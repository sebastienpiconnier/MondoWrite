// Import d'un scénario (#169) : certains logiciels écrivent une ligne « = … » par étape d'une scène, une sous l'en-tête
// puis une avant chaque bloc d'action qu'elle résume. MondoWrite lirait toutes celles qui suivent l'en-tête comme un
// seul synopsis interminable, et montrerait les autres comme des blocs « Synopsis » au milieu de la scène.
// Ici, à l'import seulement : la première ligne « = » juste sous l'en-tête reste le synopsis de la scène ; les suivantes,
// et celles du corps de la scène, deviennent des notes [[…]] à leur place. Le synopsis d'une section (épisode, étape
// d'une structure, acte) et ce qui précède la première scène ne bougent pas. Fonction pure.

import type { ScreenplayElement } from "./model";

export interface SynopsesToNotes {
  elements: ScreenplayElement[];
  /** Nombre de synopsis changés en notes. */
  converted: number;
}

export function synopsesToNotes(elements: readonly ScreenplayElement[]): SynopsesToNotes {
  let converted = 0;
  let inScene = false;
  // Vrai tant qu'on n'a vu sous l'en-tête que des synopsis (le premier y est gardé).
  let underHeading = false;
  let keptOne = false;
  const out = elements.map((el) => {
    if (el.type === "sceneHeading") {
      inScene = true;
      underHeading = true;
      keptOne = false;
      return el;
    }
    if (el.type === "section") {
      inScene = false;
      underHeading = false;
      return el;
    }
    if (el.type !== "synopsis") {
      underHeading = false;
      return el;
    }
    if (!inScene) return el;
    if (underHeading && !keptOne) {
      keptOne = true;
      return el;
    }
    // Une note ne peut pas contenir « ]] » : il deviendrait la fin de la note.
    const text = el.text.replace(/\]\]/g, "] ]").trim();
    if (!text) return el;
    converted++;
    return { type: "note", text } satisfies ScreenplayElement;
  });
  return converted ? { elements: out, converted } : { elements: elements as ScreenplayElement[], converted: 0 };
}
