// Roman interactif, lot 13 (#93) : le mélange des numéros du livre-jeu. Fonctions pures, testées.
//
// Un livre-jeu imprimé ne doit pas laisser lire la suite d'un choix juste à côté : deux sections reliées (dans un
// sens ou dans l'autre) gagnent à ne pas avoir des numéros voisins, qui tombent souvent sur la même double page. On
// cherche donc un ordre où aucune section reliée n'est voisine, et on évite aussi, si possible, un écart de 2 ou 3.
// Recherche locale à graine fixe (même projet, mêmes numéros) : on part d'un mélange, puis on échange deux sections
// tant que cela ne coûte rien, dans un nombre d'essais borné. Les numéros figés (départ, cadenas) ne bougent pas.

/** Poids d'un lien selon l'écart des numéros : un écart de 1 compte beaucoup plus que 2 ou 3. */
const WEIGHT = [0, 9, 3, 1];
const weight = (a: number, b: number) => WEIGHT[Math.abs(a - b)] ?? 0;

/** Générateur pseudo-aléatoire (mulberry32), pour un mélange reproductible. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MixResult {
  /** Numéro de chaque section. */
  numbers: Record<string, number>;
  /** Liens qui restent entre deux numéros qui se suivent (0 : le mélange a réussi). */
  neighbours: number;
}

/**
 * Numérote `ids` : les sections de `fixed` gardent leur numéro, les autres prennent les plus petits numéros libres,
 * dans l'ordre qui laisse le moins de sections reliées côte à côte. `links` : destinations de chaque section.
 * `budget` borne le nombre d'échanges essayés (quelques millisecondes pour 400 sections).
 */
export function mixSections(
  ids: readonly string[],
  links: ReadonlyMap<string, readonly string[]>,
  fixed: Readonly<Record<string, number>>,
  seed: number,
  budget = 60_000,
): MixResult {
  const present = new Set(ids);
  const numbers: Record<string, number> = {};
  for (const id of ids) if (fixed[id] !== undefined) numbers[id] = fixed[id];
  const taken = new Set(Object.values(numbers));
  const free = ids.filter((id) => numbers[id] === undefined);
  const slots: number[] = [];
  for (let n = 1; slots.length < free.length; n++) if (!taken.has(n)) slots.push(n);

  // Voisins dans les deux sens, sans doublon ni la section elle-même.
  const near = new Map<string, string[]>(ids.map((id) => [id, []]));
  const seen = new Set<string>();
  for (const [from, list] of links)
    for (const to of list) {
      if (from === to || !present.has(from) || !present.has(to)) continue;
      const key = from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      near.get(from)!.push(to);
      near.get(to)!.push(from);
    }

  const rand = seeded(seed);
  const order = [...free];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  order.forEach((id, i) => (numbers[id] = slots[i]));

  const cost = (id: string, at = numbers[id]) => (near.get(id) ?? []).reduce((sum, other) => sum + weight(at, numbers[other]), 0);
  let total = 0;
  for (const key of seen) {
    const [a, b] = key.split("\u0000");
    total += weight(numbers[a], numbers[b]);
  }
  if (free.length > 1)
    for (let k = 0; k < budget && total > 0; k++) {
      const a = order[Math.floor(rand() * order.length)];
      const before = cost(a);
      if (before === 0) continue;
      const b = order[Math.floor(rand() * order.length)];
      if (a === b) continue;
      const na = numbers[a];
      const nb = numbers[b];
      const old = before + cost(b);
      numbers[a] = nb;
      numbers[b] = na;
      const now = cost(a) + cost(b);
      // Un lien entre a et b garde son écart : il compte pareil des deux côtés, la différence reste juste.
      if (now <= old) total += now - old;
      else {
        numbers[a] = na;
        numbers[b] = nb;
      }
    }

  let neighbours = 0;
  for (const key of seen) {
    const [a, b] = key.split("\u0000");
    if (Math.abs(numbers[a] - numbers[b]) === 1) neighbours++;
  }
  return { numbers, neighbours };
}
