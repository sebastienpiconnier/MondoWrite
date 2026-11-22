// Enchaînements à relire (#120). Une scène est écrite pour suivre la précédente : quand on la déplace, elle se
// retrouve à côté de nouvelles voisines et la transition peut casser sans qu'on le voie. MondoWrite garde les
// enchaînements que l'auteur a lus (ou qui existaient déjà), et « Vérifier » signale ceux qui sont nouveaux.
//
// Dans cosmos.json, une clé facultative `transitions` (gardée telle quelle par une version d'avant) : la liste des
// enchaînements validés, « <scène d'avant>><scène> », la première du récit avec une scène d'avant vide (« >id »).
// On n'y fait qu'ajouter. Absente, rien n'est signalé : l'ordre du moment est validé au premier passage.
// Fonctions pures.

/** Clé de cosmos.json. */
export const TRANSITIONS_KEY = "transitions";

/** Un enchaînement : la scène d'avant (vide au début du récit) et la scène qui la suit. */
export interface Junction {
  prev: string;
  next: string;
}

export const junctionKey = (prev: string, next: string): string => `${prev}>${next}`;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Enchaînements validés lus dans cosmos.json, ou null si la clé manque (ou n'a pas la bonne forme). */
export function readTransitions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string" || seen.has(v)) continue;
    const cut = v.indexOf(">");
    if (cut < 0) continue;
    const prev = v.slice(0, cut);
    const next = v.slice(cut + 1);
    if ((prev && !ID.test(prev)) || !ID.test(next)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Les enchaînements de l'ordre du récit. */
export function junctions(order: readonly string[]): Junction[] {
  return order.map((next, i) => ({ prev: i > 0 ? order[i - 1] : "", next }));
}

/** Scènes dont on connaît déjà une scène d'avant validée. */
const knownScenes = (approved: readonly string[]): Set<string> => new Set(approved.map((k) => k.slice(k.indexOf(">") + 1)));

/**
 * Enchaînements à ajouter sans les faire relire : une scène nouvelle (jamais vue) avec sa voisine d'avant, et,
 * quand une ou plusieurs scènes nouvelles se glissent entre deux scènes dont l'enchaînement était validé (une scène
 * coupée en deux, dans le livre comme dans le scénario), la dernière nouvelle avec la suivante. Sans clé (`null`),
 * tout l'ordre du moment. Rend `approved` tel quel quand il n'y a rien à ajouter.
 */
export function withNewScenes(approved: readonly string[] | null, order: readonly string[]): readonly string[] {
  if (approved === null) return junctions(order).map((j) => junctionKey(j.prev, j.next));
  const known = knownScenes(approved);
  const have = new Set(approved);
  const add: string[] = [];
  const put = (key: string) => {
    if (have.has(key)) return;
    have.add(key);
    add.push(key);
  };
  let anchor = "";
  let run = false;
  order.forEach((id, i) => {
    const prev = i > 0 ? order[i - 1] : "";
    if (!known.has(id)) {
      put(junctionKey(prev, id));
      run = true;
      return;
    }
    if (run && have.has(junctionKey(anchor, id))) put(junctionKey(prev, id));
    anchor = id;
    run = false;
  });
  return add.length ? [...approved, ...add] : approved;
}

/** Un enchaînement à relire : son rang dans le récit (celui de la scène qui suit, à partir de 1). */
export interface Reread extends Junction {
  rank: number;
}

/** Enchaînements nouveaux d'une scène déjà connue : à relire. Rien sans clé (`null`). */
export function transitionsToReread(approved: readonly string[] | null, order: readonly string[]): Reread[] {
  if (approved === null) return [];
  const known = knownScenes(approved);
  const have = new Set(approved);
  const out: Reread[] = [];
  junctions(order).forEach((j, i) => {
    if (known.has(j.next) && !have.has(junctionKey(j.prev, j.next))) out.push({ ...j, rank: i + 1 });
  });
  return out;
}

/** Valide des enchaînements (ajout seulement). Rend `approved` tel quel si tout y est déjà. */
export function approveJunctions(approved: readonly string[] | null, list: readonly Junction[]): readonly string[] {
  const base = approved ?? [];
  const have = new Set(base);
  const add = list.map((j) => junctionKey(j.prev, j.next)).filter((k) => !have.has(k) && (have.add(k), true));
  return add.length ? [...base, ...add] : base;
}
