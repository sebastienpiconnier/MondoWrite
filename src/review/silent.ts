// Personnages muets (#47) : dans un scénario, un personnage est présenté en capitales dans l'action la première
// fois qu'il paraît. Ceux qui ne parlent jamais n'ont pas de réplique, donc ni ligne dans les Statistiques ni
// point dans « Vérifier ». On relève ici les noms en capitales de l'action qui ne sont ni des personnages qui
// parlent, ni des cartes (personnage, décor, objet, groupe), ni des décors des en-têtes, ni des termes techniques
// (capsExclusions.ts). C'est une lecture : rien n'est écrit. Fonctions pures.

import type { ElementType } from "../screenplay/model";
import { characterName, headingParts } from "../screenplay/scenes";
import type { CardData } from "../types";
import { foldName } from "./names";
import { cardNames } from "./report";
import { FILLER_WORDS, JOINER_WORDS, TECH_WORDS } from "./capsExclusions";

interface El {
  type: ElementType | string;
  text: string;
  omitted?: string;
}

export interface SilentCharacter {
  /** Nom tel qu'il est écrit la première fois (en capitales). */
  name: string;
  /** Index de l'élément d'action où il paraît pour la première fois. */
  first: number;
}

/** Suite de mots en capitales : une capitale, puis capitales, accents, apostrophes ou traits d'union. */
const CAPS_GROUP = /(?<![\p{L}\p{N}])\p{Lu}[\p{Lu}\p{M}'’-]*(?:[  ]+\p{Lu}[\p{Lu}\p{M}'’-]*)*(?![\p{L}\p{N}])/gu;
/** Cartes dont le titre, écrit en capitales dans l'action, n'est pas un personnage. */
const NAMED_TYPES = new Set(["lieu", "objet", "groupe"]);
/** Chiffres romains courts (« II », « IV ») : un numéro, pas un nom. */
const ROMAN = /^[IVXLC]{1,4}$/;

/** Un mot replié qui ne fait pas un nom à lui seul (une lettre, un terme technique, un chiffre romain). */
const notAName = (word: string) => word.length < 2 || TECH_WORDS.has(word) || ROMAN.test(word);

/**
 * Noms possibles dans un groupe en capitales : coupé sur « ET », « AND »…, les termes techniques retirés aux bords,
 * et rien s'il ne reste que des petits mots (« DE LA »). Chaque nom garde son écriture d'origine.
 */
export function namesInGroup(group: string): string[] {
  const words = group.trim().split(/[  ]+/);
  const out: string[] = [];
  let current: string[] = [];
  const flush = () => {
    let part = current;
    // Un mot qui se replie en plusieurs (« CONT'D ») est technique si chacun de ses morceaux l'est.
    const tech = (w: string) => foldName(w).split(" ").every(notAName);
    while (part.length > 0 && tech(part[0])) part = part.slice(1);
    while (part.length > 0 && (tech(part[part.length - 1]) || FILLER_WORDS.has(foldName(part[part.length - 1])))) part = part.slice(0, -1);
    const folded = part.map((w) => foldName(w));
    if (part.length > 0 && !folded.every((w) => FILLER_WORDS.has(w) || notAName(w))) out.push(part.join(" ").replace(/['’-]+$/, ""));
    current = [];
  };
  for (const w of words) {
    if (JOINER_WORDS.has(foldName(w))) flush();
    else current.push(w);
  }
  flush();
  return out;
}

/** Les deux noms désignent-ils la même personne (égaux, ou l'un est le prénom de l'autre) ? */
const sameName = (a: string, b: string) => {
  if (a === b) return true;
  const fa = a.split(" ")[0];
  const fb = b.split(" ")[0];
  return (fa === b && fa.length >= 3) || (fb === a && fb.length >= 3);
};

/** Personnages présentés en capitales dans l'action qui ne parlent jamais et n'ont pas de carte. */
export function silentCharacters(elements: El[], cards: CardData[]): SilentCharacter[] {
  // Ce qui a déjà un nom : personnages qui parlent, cartes, décors des en-têtes.
  const known: string[] = [];
  for (const el of elements) {
    if (el.type === "character") known.push(foldName(characterName(el.text)));
    if (el.type === "sceneHeading" && el.omitted === undefined) {
      const { location } = headingParts(el.text);
      known.push(foldName(location), ...location.split(/[,/]/).map(foldName));
    }
  }
  for (const card of cards) {
    if (card.type === "personnage") known.push(...cardNames(card, cards).map(foldName));
    else if (NAMED_TYPES.has(card.type) && card.title.trim()) known.push(foldName(card.title));
  }
  const names = known.filter(Boolean);
  const isKnown = (key: string) => names.some((k) => sameName(k, key));

  const found = new Map<string, SilentCharacter>();
  elements.forEach((el, i) => {
    if (el.type !== "action") return;
    // Une action toute en capitales (« NOIR. », « FONDU AU NOIR. ») n'introduit personne.
    if (!/\p{Ll}/u.test(el.text)) return;
    for (const m of el.text.matchAll(CAPS_GROUP)) {
      // Un bruit en capitales finit sur un point d'exclamation (« BANG ! ») : ce n'est pas un nom.
      if (/^[   ]*!/.test(el.text.slice(m.index + m[0].length))) continue;
      for (const name of namesInGroup(m[0])) {
        const key = foldName(name);
        if (!key || found.has(key) || isKnown(key)) continue;
        found.set(key, { name, first: i });
      }
    }
  });
  return [...found.values()];
}
