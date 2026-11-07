// Lecture d'un fichier Final Draft (.fdx, du XML) : il devient un Screenplay, que l'import Fountain
// transforme ensuite en projet (cartes Scène, Personnage, Décor). Les paragraphes de type inconnu
// (General, Shot, Cast List…) deviennent de l'action ; les notes de script et les propriétés sont ignorées.
// La page de titre est lue ligne à ligne : titre, mention (« Written by »), auteur, puis le contact.

import type { Screenplay, ScreenplayElement } from "./model";
import { REV_TYPES, colorFor, type RevColor, type RevisionSet, type Revisions } from "./revisions";

/** Couleurs de Final Draft → nos couleurs (les autres noms reprennent la couleur de leur rang). */
const COLORS: Record<string, RevColor> = { blue: "bleu", pink: "rose", yellow: "jaune", green: "vert", goldenrod: "or", gold: "or", buff: "chamois", salmon: "saumon", cherry: "cerise" };

const TYPES: Record<string, ScreenplayElement["type"]> = {
  "scene heading": "sceneHeading",
  action: "action",
  general: "action",
  shot: "action",
  "cast list": "action",
  character: "character",
  parenthetical: "parenthetical",
  dialogue: "dialogue",
  transition: "transition",
};

/** Texte d'un paragraphe FDX : ses <Text>, bout à bout (les retours à la ligne gardés). */
const textOf = (p: Element) =>
  [...p.children]
    .filter((c) => c.tagName === "Text")
    .map((c) => c.textContent ?? "")
    .join("")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

/** Le scénario d'un fichier FDX, ou null si ce n'en est pas un. */
export function parseFdx(source: string): Screenplay | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source.replace(/^﻿/, ""), "application/xml");
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== "FinalDraft" || doc.getElementsByTagName("parsererror").length > 0) return null;

  const elements: ScreenplayElement[] = [];
  const content = [...root.children].find((c) => c.tagName === "Content");
  const read = (p: Element, dual: boolean) => {
    const text = textOf(p);
    if (!text) return;
    const type = TYPES[(p.getAttribute("Type") ?? "").toLowerCase()] ?? "action";
    const el: ScreenplayElement = { type, text };
    // Texte révisé : Final Draft note la passe sur le <Text> (RevisionID, 0 ou absent : version d'origine).
    const rev = Math.max(0, ...[...p.children].filter((c) => c.tagName === "Text").map((c) => Number(c.getAttribute("RevisionID")) || 0));
    if (rev >= 1 && rev <= 999 && REV_TYPES.has(type)) el.rev = rev;
    if (type === "sceneHeading" && p.getAttribute("Number")) el.sceneNumber = p.getAttribute("Number")!;
    // Dialogue simultané : le second personnage du bloc porte la marque.
    if (type === "character" && dual) el.dual = true;
    elements.push(el);
  };
  for (const p of content ? [...content.children] : []) {
    if (p.tagName !== "Paragraph") continue;
    const duo = [...p.children].find((c) => c.tagName === "DualDialogue");
    if (duo) {
      let characters = 0;
      for (const inner of [...duo.children]) {
        if (inner.tagName !== "Paragraph") continue;
        const isCharacter = (inner.getAttribute("Type") ?? "").toLowerCase() === "character";
        if (isCharacter) characters++;
        read(inner, isCharacter && characters > 1);
      }
      continue;
    }
    read(p, false);
  }

  // Page de titre : des lignes centrées, puis le contact en bas.
  const titlePage: Record<string, string> = {};
  const tp = [...root.children].find((c) => c.tagName === "TitlePage");
  const tpContent = tp ? [...tp.children].find((c) => c.tagName === "Content") : undefined;
  const lines = (tpContent ? [...tpContent.children] : []).filter((p) => p.tagName === "Paragraph").map(textOf).filter(Boolean);
  if (lines.length > 0) {
    titlePage.Title = lines[0];
    const credit = lines.findIndex((l, i) => i > 0 && /^(written by|screenplay by|by|écrit par|scénario de|de|par)\b/i.test(l));
    if (credit > 0) {
      titlePage.Credit = lines[credit];
      if (lines[credit + 1]) titlePage.Author = lines[credit + 1];
      const rest = lines.slice(credit + 2);
      if (rest.length > 0) titlePage.Contact = rest.join("\n");
    }
  }
  return { titlePage, elements };
}

/** Passes de révision d'un fichier FDX (bloc <Revisions>) : couleur, nom, passe ouverte. Vide si le fichier n'en a pas. */
export function parseFdxRevisions(source: string): Revisions {
  const empty: Revisions = { sets: [], current: null, locked: null };
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source.replace(/^﻿/, ""), "application/xml");
  } catch {
    return empty;
  }
  const block = [...(doc.documentElement?.children ?? [])].find((c) => c.tagName === "Revisions");
  if (!block) return empty;
  const sets: RevisionSet[] = [];
  for (const r of block.children) {
    const n = Number(r.getAttribute("ID"));
    if (r.tagName !== "Revision" || !Number.isInteger(n) || n < 1 || n > 999 || sets.some((s) => s.n === n)) continue;
    const date = r.getAttribute("Date") ?? "";
    const name = (r.getAttribute("Name") ?? "").trim();
    sets.push({
      n,
      color: COLORS[(r.getAttribute("Color") ?? "").trim().toLowerCase()] ?? colorFor(n),
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      // Le nom par défaut de Final Draft (« Blue Revision ») n'est pas un nom choisi.
      label: /^[A-Za-z]+ Revision$/.test(name) ? "" : name.slice(0, 80),
    });
  }
  sets.sort((a, b) => a.n - b.n);
  const active = Number(block.getAttribute("ActiveSet"));
  return { sets, current: sets.some((s) => s.n === active) ? active : null, locked: null };
}
