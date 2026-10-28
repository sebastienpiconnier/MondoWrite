// Liaisons d'une carte, écrites sur la carte (« Relié à : Inès, Le phare ») : utiles quand les fils du canevas
// sont masqués (réglage du projet `hideWires`), discrètes sinon. Fonctions pures.

export interface LinkedCard {
  id: string;
  title: string;
  type: string;
}

interface CardLike {
  id: string;
  title?: string;
  type: string;
}

interface EdgeLike {
  source: string;
  target: string;
}

const cache = new WeakMap<readonly EdgeLike[], WeakMap<readonly unknown[], Map<string, LinkedCard[]>>>();

/**
 * Voisines de chaque carte par les fils, dans les deux sens, sans doublon ni la carte elle-même,
 * dans l'ordre des fils. Le résultat est gardé tant que les cartes et les fils ne changent pas.
 */
export function linkedCards<N>(cards: readonly N[], toCard: (n: N) => CardLike, edges: readonly EdgeLike[]): Map<string, LinkedCard[]> {
  const byCards = cache.get(edges);
  const hit = byCards?.get(cards);
  if (hit) return hit;
  const info = new Map<string, CardLike>();
  for (const n of cards) {
    const c = toCard(n);
    info.set(c.id, c);
  }
  const out = new Map<string, LinkedCard[]>();
  const add = (from: string, to: string) => {
    const other = info.get(to);
    if (!other || from === to || !info.has(from)) return;
    const list = out.get(from) ?? [];
    if (list.some((l) => l.id === to)) return;
    list.push({ id: other.id, title: other.title?.trim() ?? "", type: other.type });
    out.set(from, list);
  };
  for (const e of edges) {
    add(e.source, e.target);
    add(e.target, e.source);
  }
  const map = byCards ?? new WeakMap();
  map.set(cards, out);
  if (!byCards) cache.set(edges, map);
  return out;
}

/** Clé stable des voisines d'une carte (pour ne redessiner la carte que si elles changent). */
export const linkedKey = (list: readonly LinkedCard[] | undefined): string => (list ?? []).map((l) => `${l.id}\u0001${l.type}\u0001${l.title}`).join("\u0002");

export function fromLinkedKey(key: string): LinkedCard[] {
  if (!key) return [];
  return key.split("\u0002").map((part) => {
    const [id, type, title] = part.split("\u0001");
    return { id, type, title };
  });
}

/** Fils à dessiner : tous, ou, fils masqués, seulement ceux des cartes dont on a rallumé les fils. */
export function wireShown(edge: EdgeLike, hideWires: boolean, shownFor: ReadonlySet<string>): boolean {
  return !hideWires || shownFor.has(edge.source) || shownFor.has(edge.target);
}
