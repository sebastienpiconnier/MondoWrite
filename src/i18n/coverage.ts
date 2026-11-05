// Traductions partielles : compléter une langue par la référence, et mesurer ce qui reste à traduire.
// Fonctions pures, SANS import à l'exécution : scripts/i18n.mjs les charge directement dans Node
// (`--experimental-strip-types`), sans passer par Vite. Lues aussi par langs.ts et ses tests.

type Node = string | readonly unknown[] | { [key: string]: unknown };

/**
 * Listes libres : suggestions et variantes, dont chaque langue peut avoir plus ou moins d'éléments
 * (quatre temps de conjugaison en français, trois en anglais). Toute autre liste est rangée par position
 * (colonnes d'un CSV, questions de l'assistant dont la clé est le rang) et garde la longueur de la référence.
 */
export const FREE_LISTS = ["pitch.suggest", "pitch.suggestScenario", "home.greeting", "screenplay.moments", "research.oldTitles"];
const isFreeList = (path: string) => FREE_LISTS.some((p) => path === p || path.startsWith(`${p}.`));

/**
 * La traduction complétée par la référence (l'anglais) : chaque chaîne absente, vide ou d'un autre genre
 * (liste à la place d'un texte) est prise dans `base`. Une liste rangée par position n'est reprise que si elle
 * a la même longueur ; une liste libre (FREE_LISTS), dès qu'elle n'est faite que de textes non vides. Une clé
 * inconnue de `base` (texte retiré depuis) est ignorée.
 */
export function complete<T>(base: T, partial: unknown, path = ""): T {
  const b = base as Node;
  if (typeof b === "string") return (typeof partial === "string" && partial.trim() !== "" ? partial : b) as T;
  if (Array.isArray(b)) {
    if (!Array.isArray(partial)) return base;
    if (isFreeList(path) && partial.length > 0 && partial.every((v) => typeof v === "string" && v.trim() !== "")) return partial as T;
    if (partial.length !== b.length) return base;
    return b.map((item, i) => complete(item, partial[i], `${path}[${i}]`)) as T;
  }
  const p = partial && typeof partial === "object" && !Array.isArray(partial) ? (partial as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(b)) out[key] = complete((b as Record<string, unknown>)[key], p[key], path ? `${path}.${key}` : key);
  return out as T;
}

function* leaves(node: unknown, path = ""): Generator<[string, string]> {
  if (typeof node === "string") yield [path, node];
  else if (Array.isArray(node)) for (const [i, v] of node.entries()) yield* leaves(v, `${path}[${i}]`);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) yield* leaves(v, path ? `${path}.${k}` : k);
}

/** Toutes les chaînes d'un dictionnaire, avec leur chemin (`settings.language`, `screenplay.extensions[2].text`). */
export const allStrings = (dict: unknown): Map<string, string> => new Map(leaves(dict));

function listAt(dict: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((n, k) => (n && typeof n === "object" ? (n as Record<string, unknown>)[k] : undefined), dict);
}

/**
 * Chemins des chaînes qui restent à traduire : absentes, ou encore identiques à la référence alors que le
 * français et l'anglais diffèrent (« PDF », « Fountain » ou « {n} % » sont les mêmes partout : rien à faire).
 * Une liste libre est traduite dès qu'elle est remplacée, quelle que soit sa longueur.
 */
export function missingPaths(partial: unknown, reference: unknown, french: unknown): string[] {
  const merged = complete(reference, partial);
  const done = allStrings(merged);
  const frs = allStrings(french);
  const missing: string[] = [];
  for (const [path, text] of allStrings(reference)) {
    if (frs.get(path) === text) continue;
    const list = path.replace(/\[\d+\]$/, "");
    if (list !== path && isFreeList(list) && JSON.stringify(listAt(merged, list)) !== JSON.stringify(listAt(reference, list))) continue;
    if (done.get(path) === text) missing.push(path);
  }
  return missing;
}

/** Nombre de chaînes à traduire : celles qui diffèrent entre le français et l'anglais. */
export function translatableCount(reference: unknown, french: unknown): number {
  const frs = allStrings(french);
  return [...allStrings(reference)].filter(([path, text]) => frs.get(path) !== text).length;
}

/** Part traduite, de 0 à 1. */
export function translatedShare(partial: unknown, reference: unknown, french: unknown): number {
  const total = translatableCount(reference, french);
  return total === 0 ? 1 : Math.max(0, total - missingPaths(partial, reference, french).length) / total;
}
