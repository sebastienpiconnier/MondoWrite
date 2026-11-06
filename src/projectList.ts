// Liste des projets de la page d'accueil (#27) : recherche, tri et filtre roman / scénario quand elle grandit
// (fonctions pures). Le tri et le filtre choisis sont un réglage de l'appareil, comme la liste elle-même.

import type { ProjectEntry } from "./storage/recents";
import type { ProjectKind } from "./types";

export const PROJECT_SORTS = ["recent", "name", "kind"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];
export type KindFilter = "all" | ProjectKind;

/** À partir de combien de projets la recherche, le tri et le filtre apparaissent. */
export const LIST_TOOLS_MIN = 6;

export interface ListPrefs {
  sort: ProjectSort;
  kind: KindFilter;
}

export const DEFAULT_PREFS: ListPrefs = { sort: "recent", kind: "all" };
const KEY = "mondowrite.home.list";

export function readListPrefs(raw: unknown = loadRaw()): ListPrefs {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sort = PROJECT_SORTS.includes(v.sort as ProjectSort) ? (v.sort as ProjectSort) : DEFAULT_PREFS.sort;
  const kind = v.kind === "roman" || v.kind === "scenario" ? v.kind : "all";
  return { sort, kind };
}

function loadRaw(): unknown {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function writeListPrefs(prefs: ListPrefs) {
  try {
    if (prefs.sort === DEFAULT_PREFS.sort && prefs.kind === DEFAULT_PREFS.kind) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* non mémorisé, sans gravité */
  }
}

/** Repli pour chercher : minuscules, sans accents. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Projets à afficher : ceux dont le titre ou le nom du dossier contient chaque mot de la recherche, du type choisi,
 * dans l'ordre choisi. `nameOf` donne le nom affiché (titre, sinon dossier, sinon « Sans titre »).
 */
export function listProjects(list: ProjectEntry[], query: string, prefs: ListPrefs, lang: string, nameOf: (p: ProjectEntry) => string): ProjectEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const byName = (a: ProjectEntry, b: ProjectEntry) => nameOf(a).localeCompare(nameOf(b), lang, { sensitivity: "base", numeric: true });
  const byRecent = (a: ProjectEntry, b: ProjectEntry) => b.openedAt - a.openedAt || byName(a, b);
  // Un projet sans type connu est un roman (absent = roman dans cosmos.json).
  const kindOf = (p: ProjectEntry): ProjectKind => p.kind ?? "roman";
  const kept = list.filter((p) => {
    if (prefs.kind !== "all" && kindOf(p) !== prefs.kind) return false;
    if (words.length === 0) return true;
    const text = fold(`${nameOf(p)} ${p.name}`);
    return words.every((w) => text.includes(w));
  });
  const order = prefs.sort === "name" ? byName : prefs.sort === "kind" ? (a: ProjectEntry, b: ProjectEntry) => (kindOf(a) === kindOf(b) ? byRecent(a, b) : kindOf(a) === "roman" ? -1 : 1) : byRecent;
  return [...kept].sort(order);
}

/** Les deux types sont-ils dans la liste (sinon le filtre ne sert à rien) ? */
export function hasBothKinds(list: ProjectEntry[]): boolean {
  const kinds = new Set(list.map((p) => p.kind ?? "roman"));
  return kinds.size > 1;
}
