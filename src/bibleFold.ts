// Fiches repliées de la Bible : état d'affichage gardé sur l'appareil (localStorage), jamais dans le projet,
// comme le sommaire ouvert ou fermé. Les identifiants de cartes sont uniques d'un projet à l'autre : une
// seule liste suffit pour tous les projets de l'appareil.

const KEY = "mondowrite.bible.folded";
/** Au-delà, les plus anciennes sont oubliées (une fiche oubliée se montre simplement dépliée). */
export const FOLD_LIMIT = 2000;

/** Plie ou déplie des fiches ; rend la même liste si rien ne change. Les dernières pliées sont à la fin. */
export function setFolded(folded: readonly string[], ids: readonly string[], fold: boolean): readonly string[] {
  if (fold) {
    const add = ids.filter((id) => !folded.includes(id));
    if (add.length === 0) return folded;
    const next = [...folded, ...add];
    return next.length > FOLD_LIMIT ? next.slice(next.length - FOLD_LIMIT) : next;
  }
  const remove = new Set(ids);
  const next = folded.filter((id) => !remove.has(id));
  return next.length === folded.length ? folded : next;
}

/** Liste relue de l'appareil : seulement des chaînes, bornée. */
export function readFolded(raw: string | null): readonly string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string").slice(-FOLD_LIMIT);
  } catch {
    return [];
  }
}

export function loadFolded(): readonly string[] {
  try {
    return readFolded(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function saveFolded(folded: readonly string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(folded));
  } catch {
    /* le choix vaut pour la session */
  }
}
