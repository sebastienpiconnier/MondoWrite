// Le livre tel que le manuscrit le présente : les pages hors récit (page de titre, dédicace, épigraphe,
// prologue…) puis les scènes dans l'ordre du Plan, puis les pages de fin (épilogue, remerciements…).
// Idée reprise de NEO (Hugh Howey) : les pages d'un livre publié, à leur place.
//
// Une page hors récit est une carte Scène qui porte `page: <type>` dans son en-tête (cartes/<id>.md).
// Elle n'entre ni dans le Plan ni dans un chapitre ; son texte vit dans manuscrit/<id>.md comme une scène.
// Les clés sont écrites dans le fichier : ne jamais les renommer ni les traduire.

import type { CardData } from "./types";
import { planOrder, type Plan } from "./plan";

export const PAGE_KINDS = ["titre", "copyright", "dedicace", "epigraphe", "prologue", "epilogue", "remerciements", "auteur"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export const isPageKind = (v: unknown): v is PageKind => typeof v === "string" && (PAGE_KINDS as readonly string[]).includes(v);

/** Pages placées avant le récit ; les autres viennent après. */
const FRONT: ReadonlySet<PageKind> = new Set(["titre", "copyright", "dedicace", "epigraphe", "prologue"]);
export const isFront = (kind: PageKind) => FRONT.has(kind);

/** Pages sans titre de chapitre ni lettrine, composées à part (centrées, en italique…). */
export const QUIET_PAGES: ReadonlySet<PageKind> = new Set(["titre", "copyright", "dedicace", "epigraphe"]);

interface Positioned {
  id: string;
  data: CardData;
  position: { x: number; y: number };
}

/** Scènes du récit (pas les pages hors récit), dans l'ordre du canevas : l'ordre par défaut du Plan. */
export const storyScenes = (nodes: Positioned[]): string[] =>
  nodes
    .filter((n) => n.data.type === "scene" && !isPageKind(n.data.page))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    .map((n) => n.id);

/** Tout le livre, dans l'ordre de lecture : pages de début, récit (ordre du Plan), pages de fin. */
export function bookOrder(nodes: Positioned[], plan: Plan): string[] {
  const pages = nodes.filter((n) => n.data.type === "scene" && isPageKind(n.data.page));
  const rank = (n: Positioned) => PAGE_KINDS.indexOf(n.data.page as PageKind);
  const sorted = [...pages].sort((a, b) => rank(a) - rank(b) || a.position.y - b.position.y || a.position.x - b.position.x);
  return [
    ...sorted.filter((n) => isFront(n.data.page as PageKind)).map((n) => n.id),
    ...planOrder(plan, storyScenes(nodes)),
    ...sorted.filter((n) => !isFront(n.data.page as PageKind)).map((n) => n.id),
  ];
}
