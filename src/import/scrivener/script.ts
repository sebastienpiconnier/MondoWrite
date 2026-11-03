// Un document de Scrivener écrit en mode script (scénario) → éléments du scénario MondoWrite. Scrivener n'enregistre
// pas le nom de l'élément : seulement la mise en forme du paragraphe (retrait à gauche en twips, alignement). On
// reconnaît donc chaque élément à son retrait, mesuré depuis celui de l'action, comme l'import d'un PDF : en-tête et
// action au bord, réplique à 1 pouce, didascalie à 1,5, personnage à 2, transition à droite (modèle « Screenplay » de
// Scrivener 3, vérifié sur un vrai projet en novembre 2026). Pur.

import type { ScreenplayElement } from "../../screenplay/model";
import { isNaturalHeading, isNaturalTransition, SCENE_NUMBER_RE } from "../../screenplay/rules";
import type { ImportedPara } from "../manuscript";

/** Bornes des retraits, en twips depuis l'action (1 pouce = 1 440). */
const DIALOGUE_FROM = 900;
const PAREN_FROM = 1800;
const CHARACTER_FROM = 2520;
const TRANSITION_FROM = 4300;

/** En-tête et numéro de scène (« INT. PHARE - NUIT #12# » → texte et « 12 »). */
function heading(text: string, forced = false): ScreenplayElement {
  const m = text.match(SCENE_NUMBER_RE);
  const clean = (m ? text.slice(0, m.index) : text).replace(/\s+/g, " ").trim();
  return { type: "sceneHeading", text: clean, ...(m ? { sceneNumber: m[1] } : {}), ...(forced ? { forced: true } : {}) };
}

const isUpper = (s: string) => /\p{Lu}/u.test(s) && s === s.toLocaleUpperCase("fr");

/**
 * Éléments d'un document en mode script. `title` : titre du document dans le classeur, qui sert d'en-tête quand le
 * texte n'en a pas (Scrivener montre souvent l'en-tête comme titre). Les paragraphes vides sont ignorés.
 */
export function scriptElements(paras: ImportedPara[], title: string): ScreenplayElement[] {
  const lines = paras.filter((p) => p.text.trim());
  const indents = lines.map((p) => p.indent ?? 0);
  const base = indents.length ? Math.min(...indents) : 0;
  const out: ScreenplayElement[] = [];
  let previous: ScreenplayElement["type"] | null = null;
  for (const p of lines) {
    const text = p.text.replace(/ /g, " ").trim();
    const d = (p.indent ?? 0) - base;
    let type: ScreenplayElement["type"];
    if (p.align === "r" || d >= TRANSITION_FROM) type = "transition";
    else if (d >= CHARACTER_FROM) type = "character";
    else if (d >= PAREN_FROM) type = "parenthetical";
    else if (d >= DIALOGUE_FROM) type = /^\(.*\)$/.test(text) ? "parenthetical" : "dialogue";
    else if (isNaturalHeading(text)) type = "sceneHeading";
    else if (p.align === "c") type = "centered";
    else if (isNaturalTransition(text) && isUpper(text)) type = "transition";
    else type = "action";
    // Une didascalie hors de toute réplique n'en est pas une.
    if (type === "parenthetical" && previous !== "character" && previous !== "dialogue" && previous !== "parenthetical") type = "action";
    if (type === "dialogue" && previous !== "character" && previous !== "dialogue" && previous !== "parenthetical") type = "action";
    out.push(type === "sceneHeading" ? heading(text) : { type, text });
    previous = type;
  }
  // Pas d'en-tête en tête du texte : celui du titre (forcé s'il n'a pas la forme d'un en-tête).
  const first = out.find((e) => e.type !== "synopsis");
  if (title.trim() && first?.type !== "sceneHeading") out.unshift(heading(title.trim(), !isNaturalHeading(title.trim())));
  return out;
}

/** Vrai si le Manuscrit est écrit en mode script : la plupart de ses documents de texte le sont. */
export function isScriptDraft(items: { type: string; script?: boolean }[]): boolean {
  const texts = items.filter((i) => i.type === "Text");
  return texts.length > 0 && texts.filter((i) => i.script).length * 2 > texts.length;
}
