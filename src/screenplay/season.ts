// Série écrite épisode par épisode (docs/plan-episodes.md, lot 1). Sur disque, un fichier Fountain par épisode :
// scenario.fountain pour le premier écrit (le « pilote » du format, que les versions d'avant ouvrent toujours),
// episodes/<id>.fountain pour les autres, au nom de leur carte Épisode. En mémoire, toute la saison est un seul
// scénario : chaque épisode commence par un repère (une section vide qui porte l'identifiant de sa carte et la page
// de titre de son fichier) et va jusqu'au repère suivant. Ainsi tout ce qui cherche une scène par sa carte
// (renommer, corbeille, recherche, statistiques, carte agrandie) voit la saison entière ; seules la vue Scénario et
// le séquencier lisent l'épisode ouvert (`episodeScript`), et y écrivent (`withEpisodeScript`).
// Fonctions pures ; elles rendent le même objet quand rien ne change.

import type { Screenplay, ScreenplayElement } from "./model";

/** Repère d'épisode : n'existe qu'en mémoire (serialize ne l'écrit jamais). */
export const isEpisodeMarker = (el: ScreenplayElement | undefined): el is ScreenplayElement & { episode: string } => !!el?.episode;

export const episodeMarker = (id: string, titlePage: Record<string, string>): ScreenplayElement => ({ type: "section", depth: 1, text: "", episode: id, titlePage });

/** Le scénario est une saison (il a au moins un repère d'épisode). */
export const isSeason = (sp: Screenplay | null | undefined): boolean => !!sp && isEpisodeMarker(sp.elements[0]);

/** Épisodes écrits, dans l'ordre de la saison en mémoire. */
export function episodeIds(sp: Screenplay | null | undefined): string[] {
  if (!sp) return [];
  return sp.elements.filter(isEpisodeMarker).map((el) => el.episode);
}

/** L'épisode demandé s'il est écrit, sinon le premier ; null hors d'une saison. */
export function resolveEpisode(sp: Screenplay | null | undefined, id: string | null | undefined): string | null {
  const ids = episodeIds(sp);
  if (ids.length === 0) return null;
  return id && ids.includes(id) ? id : ids[0];
}

/** Bornes d'un épisode : [rang de son repère, rang du repère suivant (ou fin)]. */
export function episodeRange(sp: Screenplay, id: string): [number, number] | null {
  const start = sp.elements.findIndex((el) => el.episode === id);
  if (start < 0) return null;
  let end = start + 1;
  while (end < sp.elements.length && !isEpisodeMarker(sp.elements[end])) end++;
  return [start, end];
}

/** Rang, dans la saison, du premier élément de l'épisode (0 hors d'une saison) : rang local + décalage = rang de la saison. */
export function episodeOffset(sp: Screenplay | null | undefined, id: string | null | undefined): number {
  if (!sp || !isSeason(sp)) return 0;
  const resolved = resolveEpisode(sp, id);
  const range = resolved ? episodeRange(sp, resolved) : null;
  return range ? range[0] + 1 : 0;
}

/** Épisode qui contient l'élément de ce rang (rang de la saison), ou null. */
export function episodeAt(sp: Screenplay | null | undefined, index: number): string | null {
  if (!sp || !isSeason(sp)) return null;
  let found: string | null = null;
  for (let i = 0; i <= index && i < sp.elements.length; i++) if (isEpisodeMarker(sp.elements[i])) found = sp.elements[i].episode!;
  return found;
}

/** Épisode dont le texte contient la scène de cette carte, ou null. */
export function episodeOfCard(sp: Screenplay | null | undefined, cardId: string): string | null {
  if (!sp || !isSeason(sp)) return null;
  const at = sp.elements.findIndex((el) => el.type === "sceneHeading" && el.cardId === cardId);
  return at < 0 ? null : episodeAt(sp, at);
}

// Le texte d'un épisode est rendu toujours par le même objet tant que ses éléments et sa page de titre restent les
// mêmes : la vue Scénario ne recharge son éditeur que si son scénario change sans elle.
const slices = new WeakMap<Screenplay, Map<string, Screenplay>>();
const lastSlice = new Map<string, Screenplay>();

const sameElements = (a: ScreenplayElement[], b: ScreenplayElement[]) => a.length === b.length && a.every((el, i) => el === b[i]);

/** Texte d'un épisode, comme un scénario à lui seul (sa page de titre, ses éléments). Hors d'une saison : le scénario lui-même. */
export function episodeScript(sp: Screenplay, id: string | null | undefined): Screenplay {
  const resolved = resolveEpisode(sp, id);
  if (!resolved) return sp;
  const cached = slices.get(sp)?.get(resolved);
  if (cached) return cached;
  const [start, end] = episodeRange(sp, resolved)!;
  const marker = sp.elements[start];
  const elements = sp.elements.slice(start + 1, end);
  const titlePage = marker.titlePage ?? {};
  const before = lastSlice.get(resolved);
  const script = before && before.titlePage === titlePage && sameElements(before.elements, elements) ? before : { titlePage, elements };
  remember(sp, resolved, script);
  return script;
}

function remember(sp: Screenplay, id: string, script: Screenplay) {
  let map = slices.get(sp);
  if (!map) slices.set(sp, (map = new Map()));
  map.set(id, script);
  lastSlice.set(id, script);
}

/** La saison avec le texte de cet épisode remplacé. Hors d'une saison : le texte donné. */
export function withEpisodeScript(sp: Screenplay, id: string | null | undefined, script: Screenplay): Screenplay {
  const resolved = resolveEpisode(sp, id);
  if (!resolved) return script;
  if (episodeScript(sp, resolved) === script) return sp;
  const [start, end] = episodeRange(sp, resolved)!;
  const marker = sp.elements[start];
  const elements = [...sp.elements.slice(0, start), { ...marker, titlePage: script.titlePage }, ...script.elements, ...sp.elements.slice(end)];
  const next = { titlePage: {}, elements };
  remember(next, resolved, script);
  return next;
}

/** Applique une transformation au texte d'un épisode seul (par exemple : ajouter une scène à la fin de l'épisode ouvert). */
export const inEpisode = (sp: Screenplay, id: string | null | undefined, fn: (script: Screenplay) => Screenplay): Screenplay =>
  withEpisodeScript(sp, id, fn(episodeScript(sp, id)));

/** Saison faite de fichiers lus : le pilote d'abord, puis les autres dans l'ordre donné. */
export function joinSeason(parts: { id: string; script: Screenplay }[]): Screenplay {
  const elements: ScreenplayElement[] = [];
  for (const { id, script } of parts) elements.push(episodeMarker(id, script.titlePage), ...script.elements);
  return { titlePage: {}, elements };
}

/** Épisodes de la saison, chacun en scénario à lui seul, dans l'ordre. */
export const splitSeason = (sp: Screenplay): { id: string; script: Screenplay }[] => episodeIds(sp).map((id) => ({ id, script: episodeScript(sp, id) }));

/**
 * Commence une saison : le texte écrit jusqu'ici devient celui d'un épisode (le pilote). Rien ne change si c'est
 * déjà une saison.
 */
export function startSeason(sp: Screenplay, pilot: string): Screenplay {
  if (isSeason(sp)) return sp;
  return joinSeason([{ id: pilot, script: sp }]);
}

/** Ajoute le texte d'un épisode à la fin de la saison (s'il n'y est pas déjà). */
export function addEpisode(sp: Screenplay, id: string, script: Screenplay): Screenplay {
  if (!isSeason(sp)) throw new Error("addEpisode : pas une saison");
  if (episodeRange(sp, id)) return sp;
  return { titlePage: {}, elements: [...sp.elements, episodeMarker(id, script.titlePage), ...script.elements] };
}

/**
 * Retire le texte d'un épisode (sa carte part à la corbeille). Le dernier épisode retiré : le scénario redevient un
 * texte seul, vide, qui garde la page de titre de l'épisode.
 */
export function removeEpisode(sp: Screenplay, id: string): { screenplay: Screenplay; removed: Screenplay | null } {
  const range = isSeason(sp) ? episodeRange(sp, id) : null;
  if (!range) return { screenplay: sp, removed: null };
  const removed = episodeScript(sp, id);
  const elements = [...sp.elements.slice(0, range[0]), ...sp.elements.slice(range[1])];
  const screenplay = elements.length > 0 ? { titlePage: {}, elements } : { titlePage: removed.titlePage, elements: [] };
  return { screenplay, removed };
}

/** Page de titre d'un nouvel épisode : celle du pilote (titre de la série, auteur, coordonnées), sans date ni version. */
export function newEpisodeTitlePage(pilot: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(pilot).filter(([key]) => !/^(draft date|date|revision|notes)$/i.test(key)));
}
