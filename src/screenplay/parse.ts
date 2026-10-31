// Fountain → modèle. Lecture ligne à ligne, d'après la spécification fountain.io/syntax.
// Ce qui n'est pas reconnu devient de l'action : on ne perd jamais de texte.

import type { Screenplay, ScreenplayElement } from "./model";
import {
  LINK_RE,
  SCENE_NUMBER_RE,
  isBlank,
  isCentered,
  isNaturalCharacter,
  isNaturalHeading,
  isNaturalTransition,
  isPageBreak,
  isStandaloneNote,
  isTitleKey,
  startsStructure,
  TITLE_KEY_RE,
} from "./rules";

const TITLE_CONTINUATION_RE = /^(?: {3,}|\t)\s*(\S.*)$/;

export function parse(source: string): Screenplay {
  // Fichiers venus d'autres logiciels : BOM et fins de ligne Windows ou anciennes Mac.
  const lines = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  let start = 0;
  while (start < lines.length && isBlank(lines[start])) start++;

  const title = parseTitlePage(lines, start);
  return {
    titlePage: title?.titlePage ?? {},
    elements: parseBody(lines, title?.next ?? start),
  };
}

/** Page de titre : bloc « Clé: valeur » en tête de fichier, terminé par une ligne vide. */
function parseTitlePage(
  lines: string[],
  start: number,
): { titlePage: Record<string, string>; next: number } | null {
  if (start >= lines.length || isNaturalHeading(lines[start])) return null;

  const entries: [string, string[]][] = [];
  let i = start;
  for (; i < lines.length && !isBlank(lines[i]); i++) {
    const continuation = TITLE_CONTINUATION_RE.exec(lines[i]);
    const key = TITLE_KEY_RE.exec(lines[i]);
    if (continuation && entries.length > 0) {
      entries[entries.length - 1][1].push(continuation[1].trimEnd());
    } else if (key) {
      const value = key[2].trimEnd();
      entries.push([key[1].trim(), value === "" ? [] : [value]]);
    } else {
      return null;
    }
  }
  // « FADE IN: » seul en tête de fichier n'est pas une page de titre : une clé a toujours une valeur.
  if (entries.length === 0 || entries.some(([, value]) => value.length === 0)) return null;
  // Une première action « Paris, 1942 : la ville est occupée. » n'est pas une page de titre : il faut
  // au moins une clé du format (Title, Author…), les autres clés du bloc sont gardées telles quelles.
  if (!entries.some(([key]) => isTitleKey(key))) return null;

  const titlePage: Record<string, string> = {};
  for (const [key, value] of entries) titlePage[key] = value.join("\n");
  return { titlePage, next: i };
}

function parseBody(lines: string[], start: number): ScreenplayElement[] {
  const out: ScreenplayElement[] = [];
  // Vrai si la ligne précédente est vide (ou début de fichier, ou élément de structure).
  let boundary = true;
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    const s = line.trim();

    if (s === "") {
      boundary = true;
      i++;
      continue;
    }

    // Boneyard /* … */ : peut contenir des lignes vides.
    if (s.startsWith("/*")) {
      const end = findBoneyardEnd(lines, i);
      if (end !== -1) {
        const raw = lines.slice(i, end + 1).join("\n").trim();
        out.push({ type: "boneyard", text: raw.slice(2, -2) });
        boundary = true;
        i = end + 1;
        continue;
      }
    }

    // Note seule [[ … ]], éventuellement sur plusieurs lignes (sans ligne vide).
    if (s.startsWith("[[")) {
      const end = findNoteEnd(lines, i);
      if (end !== -1) {
        const raw = lines.slice(i, end + 1).join("\n").trim();
        out.push({ type: "note", text: raw.slice(2, -2) });
        boundary = true;
        i = end + 1;
        continue;
      }
    }

    if (isPageBreak(s)) {
      out.push({ type: "pageBreak", text: "" });
      boundary = true;
      i++;
      continue;
    }

    if (s.startsWith("=")) {
      out.push({ type: "synopsis", text: s.slice(1).trim() });
      boundary = true;
      i++;
      continue;
    }

    const section = /^(#+)\s*(.*)$/.exec(s);
    if (section) {
      out.push({ type: "section", text: section[2], depth: section[1].length });
      boundary = true;
      i++;
      continue;
    }

    if (isCentered(s)) {
      out.push({ type: "centered", text: s.slice(1, -1).trim() });
      boundary = false;
      i++;
      continue;
    }

    if (s.startsWith(">")) {
      out.push({ type: "transition", text: s.slice(1).trim(), forced: true });
      boundary = false;
      i++;
      continue;
    }

    // « . » force un en-tête, mais « ... » reste de l'action.
    if (/^\.[^.]/.test(s)) {
      out.push(heading(s.slice(1), true));
      boundary = false;
      i++;
      continue;
    }

    if (s.startsWith("!")) {
      i = readAction(lines, i, out, true);
      boundary = false;
      continue;
    }

    if (s.startsWith("@")) {
      i = readDialogueBlock(lines, i, out, true);
      boundary = false;
      continue;
    }

    const nextBlank = i + 1 >= lines.length || isBlank(lines[i + 1]);

    if (boundary && nextBlank && isNaturalHeading(s)) {
      out.push(heading(s, false));
      boundary = false;
      i++;
      continue;
    }

    if (boundary && nextBlank && isNaturalTransition(s)) {
      out.push({ type: "transition", text: s });
      boundary = false;
      i++;
      continue;
    }

    // Un nom en majuscules suivi d'une ligne vide n'est pas un personnage : c'est de l'action.
    if (boundary && !nextBlank && isNaturalCharacter(s)) {
      i = readDialogueBlock(lines, i, out, false);
      boundary = false;
      continue;
    }

    i = readAction(lines, i, out, false);
    boundary = false;
  }

  return out;
}

function heading(raw: string, forced: boolean): ScreenplayElement {
  const el: ScreenplayElement = { type: "sceneHeading", text: raw };
  const link = LINK_RE.exec(el.text);
  if (link) {
    el.cardId = link[1];
    el.text = el.text.replace(LINK_RE, "");
  }
  const number = SCENE_NUMBER_RE.exec(el.text);
  if (number) {
    el.sceneNumber = number[1];
    el.text = el.text.replace(SCENE_NUMBER_RE, "");
  }
  el.text = el.text.trim();
  if (forced) el.forced = true;
  return el;
}

/** Paragraphe d'action : lignes jusqu'à une ligne vide ou un élément de structure. Rend l'index suivant. */
function readAction(lines: string[], start: number, out: ScreenplayElement[], forced: boolean): number {
  // L'indentation de l'action est conservée ; seul le « ! » de forçage est retiré.
  const text = [forced ? lines[start].replace("!", "") : lines[start]];
  let i = start + 1;
  while (i < lines.length && !isBlank(lines[i]) && !startsStructure(lines[i])) {
    // « ! » en tête d'une ligne suivante : ligne forcée en action (écrite ainsi par le sérialiseur), on le retire.
    text.push(lines[i].startsWith("!") ? lines[i].slice(1) : lines[i]);
    i++;
  }
  const el: ScreenplayElement = { type: "action", text: text.join("\n") };
  if (forced) el.forced = true;
  out.push(el);
  return i;
}

/** Personnage, puis didascalies et répliques jusqu'à une ligne vide. Rend l'index suivant. */
function readDialogueBlock(lines: string[], start: number, out: ScreenplayElement[], forced: boolean): number {
  let name = lines[start].trim();
  if (forced) name = name.slice(1).trim();
  const character: ScreenplayElement = { type: "character", text: name };
  if (/\^$/.test(name)) {
    character.text = name.replace(/\s*\^$/, "");
    character.dual = true;
  }
  if (forced) character.forced = true;
  out.push(character);

  let i = start + 1;
  let dialogue: ScreenplayElement | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (isBlank(line)) {
      // Deux espaces sur une ligne « vide » : la réplique continue après un saut de ligne.
      if (dialogue && /^\s{2,}$/.test(line)) {
        dialogue.text += "\n";
        continue;
      }
      break;
    }
    const s = line.trim();
    if (s.startsWith("(") && s.endsWith(")")) {
      out.push({ type: "parenthetical", text: s });
      dialogue = null;
    } else if (dialogue) {
      dialogue.text += "\n" + line;
    } else {
      dialogue = { type: "dialogue", text: line };
      out.push(dialogue);
    }
  }
  return i;
}

function findBoneyardEnd(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) {
    const s = lines[i].trim();
    if (s.endsWith("*/") && (i > start || s.length >= 4)) return i;
  }
  return -1;
}

function findNoteEnd(lines: string[], start: number): number {
  for (let i = start; i < lines.length && !isBlank(lines[i]); i++) {
    if (lines[i].trimEnd().endsWith("]]")) {
      return isStandaloneNote(lines.slice(start, i + 1).join("\n")) ? i : -1;
    }
  }
  return -1;
}
