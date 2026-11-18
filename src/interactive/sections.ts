// Roman interactif, lot 12 (#92) : numéros des sections figés. Fonctions pures, testées.
//
// Le livre-jeu numérote ses scènes (gamebook.ts) : la première est le 1, les autres sont mélangées. Ces numéros
// sont gardés dans cosmos.json (`sections`, par identifiant de scène, gardé par `metaKeep`) : ajouter ou retirer une
// scène ne renumérote plus le livre. Une nouvelle scène prend le plus petit numéro libre, une scène retirée laisse le
// sien libre (« Vérifier » signale le trou). « Renuméroter » refait le mélange, sauf pour les scènes dont le numéro
// est gardé (`sectionLocks`). Le départ est toujours le 1.

/** Clés de cosmos.json : jamais traduites (contrat de format). */
export const SECTIONS_KEY = "sections";
export const SECTION_LOCKS_KEY = "sectionLocks";

export interface SectionState {
  /** Numéro de chaque scène. */
  numbers: Record<string, number>;
  /** Scènes dont le numéro est gardé, même quand on renumérote. */
  locked: string[];
}

const isNumber = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n < 100000;

/** Numéros et cadenas lus dans les clés inconnues de cosmos.json (valeurs douteuses écartées, doublons retirés). */
export function readSections(metaKeep: Readonly<Record<string, unknown>> | undefined): SectionState {
  const raw = metaKeep?.[SECTIONS_KEY];
  const numbers: Record<string, number> = {};
  const taken = new Set<number>();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
      if (!isNumber(n) || taken.has(n) || !id) continue;
      taken.add(n);
      numbers[id] = n;
    }
  }
  const rawLocks = metaKeep?.[SECTION_LOCKS_KEY];
  const locked = Array.isArray(rawLocks) ? [...new Set(rawLocks.filter((x): x is string => typeof x === "string" && !!numbers[x]))] : [];
  return { numbers, locked };
}

/** Clés de cosmos.json pour ces numéros (rend le même objet quand rien ne change). */
export function withSections(metaKeep: Readonly<Record<string, unknown>>, state: SectionState): Record<string, unknown> {
  const before = readSections(metaKeep);
  if (sameNumbers(before.numbers, state.numbers) && sameList(before.locked, state.locked)) return metaKeep as Record<string, unknown>;
  const next = { ...metaKeep };
  if (Object.keys(state.numbers).length) next[SECTIONS_KEY] = { ...state.numbers };
  else delete next[SECTIONS_KEY];
  const locked = state.locked.filter((id) => state.numbers[id]);
  if (locked.length) next[SECTION_LOCKS_KEY] = locked;
  else delete next[SECTION_LOCKS_KEY];
  return next;
}

export function sameNumbers(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Numéros du livre pour ces scènes (`ids` dans l'ordre du Plan, la première est le départ). Les numéros gardés le
 * restent ; une scène sans numéro prend le plus petit libre ; le départ prend le 1 (celle qui l'avait prend l'ancien
 * numéro du départ). Sans aucun numéro gardé, `shuffle` donne le premier mélange.
 */
export function resolveSections(ids: readonly string[], stored: Readonly<Record<string, number>>, shuffle: () => readonly { id: string; n: number }[]): Record<string, number> {
  if (ids.length === 0) return {};
  const present = new Set(ids);
  const kept = Object.entries(stored).filter(([id]) => present.has(id));
  if (kept.length === 0) return Object.fromEntries(shuffle().map((s) => [s.id, s.n]));
  const out: Record<string, number> = Object.fromEntries(kept);
  const start = ids[0];
  const free = freeNumbers(out);
  // Le départ d'abord : il porte toujours le 1.
  if (out[start] !== 1) {
    const holder = Object.keys(out).find((id) => out[id] === 1);
    const old = out[start];
    if (holder) {
      if (old !== undefined) out[holder] = old;
      else delete out[holder];
    } else if (old !== undefined) free.push(old);
    out[start] = 1;
  }
  for (const id of ids) if (out[id] === undefined) out[id] = next(out, free);
  return out;
}

/** Numéros libres en dessous du plus grand (les trous), du plus petit au plus grand. */
export function freeNumbers(numbers: Readonly<Record<string, number>>): number[] {
  const taken = new Set(Object.values(numbers));
  const max = Math.max(0, ...taken);
  const out: number[] = [];
  for (let n = 1; n <= max; n++) if (!taken.has(n)) out.push(n);
  return out;
}

const next = (numbers: Record<string, number>, free: number[]): number => {
  const taken = new Set(Object.values(numbers));
  free.sort((a, b) => a - b);
  while (free.length) {
    const n = free.shift()!;
    if (!taken.has(n) && n !== 1) return n;
  }
  return Math.max(1, ...taken) + 1;
};

/** Numéros qui manquent dans le livre (aucune scène ne les porte). */
export const sectionGaps = (numbers: Readonly<Record<string, number>>) => freeNumbers(numbers);

/**
 * Donne le numéro `n` à la scène `id` et le garde. La scène qui l'avait prend l'ancien numéro de `id`. Refusé (rend
 * null) pour le départ, pour le 1, ou si `n` appartient à une scène gardée.
 */
export function setSectionNumber(state: SectionState, start: string, id: string, n: number): SectionState | null {
  if (!isNumber(n) || id === start || n === 1 || state.numbers[id] === undefined) return null;
  const holder = Object.keys(state.numbers).find((k) => state.numbers[k] === n);
  if (holder === id) return state.locked.includes(id) ? state : { ...state, locked: [...state.locked, id] };
  if (holder && (holder === start || state.locked.includes(holder))) return null;
  const numbers = { ...state.numbers, [id]: n };
  if (holder) numbers[holder] = state.numbers[id];
  return { numbers, locked: state.locked.includes(id) ? state.locked : [...state.locked, id] };
}

/** Garde ou libère le numéro d'une scène (le départ est toujours gardé au 1 : rien à faire). */
export function toggleSectionLock(state: SectionState, id: string): SectionState {
  if (state.numbers[id] === undefined) return state;
  const locked = state.locked.includes(id) ? state.locked.filter((x) => x !== id) : [...state.locked, id];
  return { ...state, locked };
}

/**
 * Renumérote : le départ au 1, les scènes gardées à leur numéro, les autres mélangées sur les numéros restants de 1
 * à N (le livre n'a plus de trou). `order` est le mélange proposé pour ces autres scènes (gamebook.ts).
 */
export function renumberSections(ids: readonly string[], state: SectionState, order: readonly string[]): SectionState {
  if (ids.length === 0) return { numbers: {}, locked: [] };
  const start = ids[0];
  const present = new Set(ids);
  const numbers: Record<string, number> = { [start]: 1 };
  const locked = state.locked.filter((id) => present.has(id) && id !== start && state.numbers[id] !== undefined && state.numbers[id] !== 1);
  for (const id of locked) numbers[id] = state.numbers[id];
  const taken = new Set(Object.values(numbers));
  const rest = order.filter((id) => present.has(id) && numbers[id] === undefined);
  for (const id of ids) if (numbers[id] === undefined && !rest.includes(id)) rest.push(id);
  let n = 1;
  for (const id of rest) {
    while (taken.has(n)) n++;
    numbers[id] = n;
    taken.add(n);
  }
  return { numbers, locked };
}

/** Sections dans l'ordre de leurs numéros. */
export const sectionList = (numbers: Readonly<Record<string, number>>) =>
  Object.entries(numbers)
    .map(([id, n]) => ({ id, n }))
    .sort((a, b) => a.n - b.n);
