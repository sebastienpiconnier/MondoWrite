// Parties de la Bible (Bible v2, docs/plan-bible-v2.md) : les rubriques se rangent dans l'ordre d'un dossier
// professionnel. 1 Présentation, 2 Personnages, 3 Univers, 4 Structure, puis 5 « Pour vous », ce qui ne
// sert qu'à l'auteur (questions, idées en vrac, sources). Un regroupement d'affichage et d'export : aucun
// fichier ne change, et l'ordre choisi par l'auteur (bibleSections) vaut à l'intérieur de chaque partie.
// Fonctions pures.

import type { CardType } from "./types";
import { sectionOrder, type BibleSections } from "./bibleSections";

/** Clés des parties : jamais affichées telles quelles (libellés : `t.bible.parts`). */
export type PartKey = "presentation" | "personnages" | "univers" | "structure" | "pourVous";

export const BIBLE_PARTS: readonly PartKey[] = ["presentation", "personnages", "univers", "structure", "pourVous"];

/** Partie de chaque type de carte. Un type ajouté plus tard doit y figurer (TypeScript l'exige). */
export const PART_OF: Record<CardType, PartKey> = {
  theme: "presentation",
  personnage: "personnages",
  lieu: "univers",
  groupe: "univers",
  objet: "univers",
  evenement: "univers",
  regle: "univers",
  secret: "structure",
  intrigue: "structure",
  scene: "structure",
  episode: "structure",
  question: "pourVous",
  idee: "pourVous",
  lien: "pourVous",
  image: "pourVous",
  document: "pourVous",
};

/** Partie réservée à l'auteur : jamais dans un document destiné à un tiers. */
export const isPrivatePart = (part: PartKey) => part === "pourVous";

/** Numéro affiché d'une partie (1 à 5). */
export const partNumber = (part: PartKey) => BIBLE_PARTS.indexOf(part) + 1;

/** Rubriques dans l'ordre des parties ; à l'intérieur d'une partie, l'ordre donné est gardé. */
export function inPartOrder(types: readonly CardType[]): CardType[] {
  return BIBLE_PARTS.flatMap((part) => types.filter((type) => PART_OF[type] === part));
}

/** Rubriques affichées (non masquées), dans l'ordre des parties : celui de la Bible et de ses exports. */
export const bibleOrder = (prefs: BibleSections): CardType[] => inPartOrder(sectionOrder(prefs).filter((t) => !prefs.hidden.includes(t)));

export interface PartGroup<T> {
  part: PartKey;
  items: T[];
}

/** Regroupe des éléments par partie, dans l'ordre des parties ; une partie sans élément est omise. */
export function groupByPart<T>(items: readonly T[], typeOf: (item: T) => CardType): PartGroup<T>[] {
  return BIBLE_PARTS.map((part) => ({ part, items: items.filter((item) => PART_OF[typeOf(item)] === part) })).filter((g) => g.items.length > 0);
}

/** Déplace une rubrique à la place d'une autre de la même partie, sans toucher aux autres parties. */
export function moveInPart(prefs: BibleSections, type: CardType, target: CardType): BibleSections {
  const part = PART_OF[type];
  if (type === target || PART_OF[target] !== part) return prefs;
  const order = sectionOrder(prefs);
  const mates = order.filter((item) => PART_OF[item] === part);
  const to = mates.indexOf(target);
  mates.splice(mates.indexOf(type), 1);
  mates.splice(to, 0, type);
  let index = 0;
  return { ...prefs, order: order.map((item) => PART_OF[item] === part ? mates[index++] : item) };
}
