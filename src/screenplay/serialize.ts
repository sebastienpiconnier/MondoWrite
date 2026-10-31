// Modèle → Fountain. Le sérialiseur est seul responsable des lignes vides et des marqueurs de
// forçage : tout élément que le parseur ne reconnaîtrait pas seul reçoit son marqueur (., @, !, >).

import type { Screenplay, ScreenplayElement } from "./model";
import {
  isNaturalCharacter,
  isNaturalHeading,
  isNaturalTransition,
  isStandaloneNote,
  isTitleKey,
  startsStructure,
  TITLE_KEY_RE,
} from "./rules";

const IN_DIALOGUE = new Set(["character", "parenthetical", "dialogue"]);
const SPEECH = new Set(["parenthetical", "dialogue"]);

export function serialize(screenplay: Screenplay): string {
  const blocks: string[] = [];

  const title = Object.entries(screenplay.titlePage)
    .filter(([, value]) => value.trim() !== "")
    .map(([key, value]) =>
      value.includes("\n") ? `${key}:\n${value.split("\n").map((l) => `    ${l}`).join("\n")}` : `${key}: ${value}`,
    );
  if (title.length > 0) blocks.push(title.join("\n"));

  // Un élément vide (l'auteur vient de créer la ligne) ne s'écrit pas.
  const elements = screenplay.elements.filter((el) => el.type === "pageBreak" || el.text !== "");
  let body = "";
  // Sans page de titre, une première action « Title: … » serait relue comme page de titre.
  const first = elements[0];
  const forceFirst =
    title.length === 0 && first?.type === "action" && !first.forced && titleLike(first.text);
  elements.forEach((el, i) => {
    const prev = elements[i - 1];
    if (prev) {
      // Personnage, didascalie et réplique d'un même bloc se suivent sans ligne vide.
      body += SPEECH.has(el.type) && IN_DIALOGUE.has(prev.type) ? "\n" : "\n\n";
    }
    body += i === 0 && forceFirst ? `!${el.text}` : line(el, elements[i + 1]);
  });
  if (body !== "") blocks.push(body);

  return blocks.length > 0 ? blocks.join("\n\n") + "\n" : "";
}

function line(el: ScreenplayElement, next: ScreenplayElement | undefined): string {
  switch (el.type) {
    case "sceneHeading": {
      const dot = el.forced || !isNaturalHeading(el.text) ? "." : "";
      const link = el.cardId ? ` [[cosmos:${el.cardId}]]` : "";
      const number = el.sceneNumber ? ` #${el.sceneNumber}#` : "";
      return `${dot}${el.text}${link}${number}`;
    }
    case "action":
      return el.forced || actionNeedsForcing(el.text) ? `!${el.text}` : el.text;
    case "character": {
      // Sans réplique derrière lui, un nom en majuscules serait relu comme de l'action.
      const spoken = next !== undefined && SPEECH.has(next.type);
      const at = el.forced || !spoken || !isNaturalCharacter(el.text) ? "@" : "";
      return `${at}${el.text}${el.dual ? " ^" : ""}`;
    }
    case "parenthetical":
      return el.text;
    case "dialogue":
      return el.text
        .split("\n")
        .map((l) => (l.trim() === "" ? "  " : l))
        .join("\n");
    case "transition":
      return el.forced || !isNaturalTransition(el.text) ? `> ${el.text}` : el.text;
    case "centered":
      return `> ${el.text} <`;
    case "pageBreak":
      return "===";
    case "section":
      return `${"#".repeat(Math.max(1, el.depth ?? 1))} ${el.text}`;
    case "synopsis":
      return `= ${el.text}`;
    case "note":
      return `[[${el.text}]]`;
    case "boneyard":
      return `/*${el.text}*/`;
  }
}

/** Vrai si ce bloc serait lu comme une page de titre (chaque ligne « Clé: valeur », une clé connue). */
function titleLike(text: string): boolean {
  const keys = text.split("\n").map((l) => TITLE_KEY_RE.exec(l.trim()));
  return keys.every((k) => k !== null && k[2].trim() !== "") && keys.some((k) => k !== null && isTitleKey(k[1]));
}

/** Vrai si ce texte d'action serait relu comme un autre élément. */
function actionNeedsForcing(text: string): boolean {
  const lines = text.split("\n");
  const first = lines[0].trim();
  if (/^[!@>]/.test(first) || /^\.[^.]/.test(first)) return true;
  if (startsStructure(first) || isStandaloneNote(text)) return true;
  return lines.length === 1
    ? isNaturalHeading(first) || isNaturalTransition(first)
    : isNaturalCharacter(first);
}
