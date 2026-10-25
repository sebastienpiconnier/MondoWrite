// Statistiques des lieux (Bible, Lieux › Statistiques ; Décors dans un scénario) : scènes, pages ou mots,
// part du récit, apparitions, personnages croisés, et pour un scénario intérieur ou extérieur, jour ou nuit
// (lus dans l'en-tête de scène : le dépouillement d'un tournage). Rien n'est enregistré. Fonctions pures.

import type { ScreenplayElement } from "../screenplay/model";
import { headingParts, listScenes, sceneCharacters } from "../screenplay/scenes";
import { pagesBetween, type Pagination } from "../screenplay/paginate";
import type { CardData } from "../types";
import { countWords, detectCards } from "../manuscript";
import { foldName } from "./names";

/** Intérieur, extérieur, ou les deux (INT./EXT.) ; « » quand l'en-tête ne le dit pas. */
export type Setting = "int" | "ext" | "both" | "";
/** Jour, nuit, ou autre moment (« PLUS TARD », « CONTINU », vide). */
export type Moment = "day" | "night" | "other";

export interface PlaceRow {
  /** Carte Lieu, ou null pour un décor écrit dans le scénario sans carte. */
  id: string | null;
  name: string;
  scenes: number;
  /** Scénario : longueur en pages (fraction). Roman : 0. */
  pages: number;
  /** Roman : mots des scènes qui s'y passent. Scénario : 0. */
  words: number;
  /** Part du récit, de 0 à 1 : pages (scénario) ou scènes (roman). */
  share: number;
  first: number | null;
  last: number | null;
  /** Personnages qui y paraissent, par ordre d'entrée. */
  characters: string[];
  /** Scénario : scènes en intérieur, en extérieur, de jour, de nuit. */
  int: number;
  ext: number;
  day: number;
  night: number;
  /** Scénario : scènes dont le jour ou la nuit vient de la scène précédente (« PLUS TARD »). */
  inherited: number;
}

/** INT., EXT., INT./EXT. ou I/E d'un préfixe d'en-tête. */
export function settingOf(prefix: string): Setting {
  const p = prefix.toUpperCase().replace(/\./g, "");
  if (p === "INT/EXT" || p === "I/E") return "both";
  if (p === "INT") return "int";
  if (p === "EXT") return "ext";
  return "";
}

const NIGHT = new Set(["NUIT", "NIGHT", "SOIR", "SOIREE", "EVENING", "CREPUSCULE", "DUSK", "MINUIT", "MIDNIGHT"]);
const DAY = new Set(["JOUR", "DAY", "MATIN", "MATINEE", "MORNING", "MIDI", "NOON", "AFTERNOON", "AUBE", "DAWN", "AURORE"]);

/** Le moment d'un en-tête : jour, nuit ou autre (« APRÈS-MIDI » est un jour, « PLUS TARD » autre). */
export function momentOf(time: string): Moment {
  const words = foldName(time).split(/[^A-Z]+/);
  if (words.some((w) => NIGHT.has(w))) return "night";
  if (words.some((w) => DAY.has(w))) return "day";
  return "other";
}

// Moments qui continuent la scène d'avant : « PLUS TARD », « CONTINU », « MÊME MOMENT », « LATER »…
const CONTINUING = new Set(["PLUS", "TARD", "CONTINU", "CONTINUE", "CONTINUOUS", "CONT", "LATER", "SAME", "MEME", "MOMENT", "MOMENTS", "SUITE", "INSTANT", "TIME", "APRES", "PEU", "UN", "LE", "AU"]);

/** Le moment de chaque scène, dans l'ordre du scénario. Un moment absent ou qui continue la scène d'avant
 *  (« PLUS TARD ») reprend le jour ou la nuit de la scène précédente : `inherited` le signale. */
export function sceneMoments(elements: ScreenplayElement[]): { moment: Moment; inherited: boolean }[] {
  let previous: Moment = "other";
  return listScenes(elements).map((scene) => {
    const { time } = headingParts(scene.text);
    const own = momentOf(time);
    const words = foldName(time).split(/[^A-Z]+/).filter(Boolean);
    const continues = own === "other" && words.every((w) => CONTINUING.has(w));
    const result = continues && previous !== "other" ? { moment: previous, inherited: true } : { moment: own, inherited: false };
    previous = result.moment;
    return result;
  });
}

/** Le décor d'un en-tête correspond-il à ce lieu ? Égal une fois replié, ou lieu principal d'un « PHARE, LANTERNE ». */
export function sameLocation(location: string, name: string): boolean {
  const a = foldName(location);
  const b = foldName(name);
  if (!a || !b) return false;
  return a === b || foldName(location.split(",")[0]) === b;
}

const empty = (id: string | null, name: string): PlaceRow => ({
  id, name, scenes: 0, pages: 0, words: 0, share: 0, first: null, last: null, characters: [], int: 0, ext: 0, day: 0, night: 0, inherited: 0,
});

/** Scénario : une ligne par carte Lieu, plus les décors des en-têtes qui n'ont pas de carte. */
export function screenplayPlaces(elements: ScreenplayElement[], cards: CardData[], pagination: Pagination | null, locale = "fr"): PlaceRow[] {
  const scenes = listScenes(elements);
  const places = cards.filter((c) => c.type === "lieu" && c.title.trim());
  const rows = places.map((c) => empty(c.id, c.title.trim()));
  const extra = new Map<string, PlaceRow>();
  // Un personnage qui a sa carte est écrit comme sur sa carte (« Le Loup » plutôt que « LE LOUP »).
  const titled = new Map(cards.filter((c) => c.type === "personnage" && c.title.trim()).map((c) => [foldName(c.title), c.title.trim()]));
  const moments = sceneMoments(elements);
  let totalPages = 0;
  for (const [i, scene] of scenes.entries()) {
    const pages = pagination ? pagesBetween(pagination, scene.index, scene.end) : 0;
    totalPages += pages;
    const { prefix, location } = headingParts(scene.text);
    if (!location) continue;
    let row = rows[places.findIndex((c) => sameLocation(location, c.title))];
    if (!row) {
      const key = foldName(location.split(",")[0]);
      row = extra.get(key) ?? empty(null, location.split(",")[0].trim().toLocaleUpperCase(locale));
      extra.set(key, row);
    }
    row.scenes++;
    row.pages += pages;
    row.first ??= scene.number;
    row.last = scene.number;
    const setting = settingOf(prefix);
    if (setting === "int" || setting === "both") row.int++;
    if (setting === "ext" || setting === "both") row.ext++;
    const { moment, inherited } = moments[i];
    if (moment === "day") row.day++;
    if (moment === "night") row.night++;
    if (inherited) row.inherited++;
    for (const { name } of sceneCharacters(elements, scene)) {
      const upper = titled.get(foldName(name)) ?? name.toLocaleUpperCase(locale);
      if (!row.characters.some((n) => foldName(n) === foldName(upper))) row.characters.push(upper);
    }
  }
  const all = [...rows, ...extra.values()];
  for (const r of all) r.share = totalPages ? r.pages / totalPages : scenes.length ? r.scenes / scenes.length : 0;
  return all;
}

/**
 * Roman : une ligne par carte Lieu. Une scène s'y passe si un fil la relie au lieu sur le canevas, ou si son
 * texte le nomme ; ses personnages sont ceux que le texte cite. `order` est l'ordre de lecture des scènes.
 */
export function novelPlaces(
  manuscript: Record<string, string>,
  order: string[],
  cards: CardData[],
  links: { source: string; target: string }[],
): PlaceRow[] {
  const people = cards.filter((c) => c.type === "personnage" && c.title.trim());
  const linked = (a: string, b: string) => links.some((l) => (l.source === a && l.target === b) || (l.source === b && l.target === a));
  return cards
    .filter((c) => c.type === "lieu" && c.title.trim())
    .map((place) => {
      const row = empty(place.id, place.title.trim());
      order.forEach((id, i) => {
        const html = manuscript[id];
        if (!linked(place.id, id) && !detectCards(html, [place]).length) return;
        row.scenes++;
        row.words += countWords(html);
        row.first ??= i + 1;
        row.last = i + 1;
        for (const p of detectCards(html, people)) if (!row.characters.includes(p.title.trim())) row.characters.push(p.title.trim());
        for (const p of people) if (linked(p.id, id) && !row.characters.includes(p.title.trim())) row.characters.push(p.title.trim());
      });
      row.share = order.length ? row.scenes / order.length : 0;
      return row;
    });
}

export interface SettingSummary {
  int: number;
  ext: number;
  day: number;
  night: number;
  /** Scènes dont l'en-tête ne dit ni INT. ni EXT., ou dont le moment n'est ni jour ni nuit. */
  unknownSetting: number;
  otherMoment: number;
  /** Scènes dont le jour ou la nuit vient de la scène précédente. */
  inheritedDay: number;
  inheritedNight: number;
  scenes: number;
}

/** Scénario entier : scènes en intérieur ou extérieur, de jour ou de nuit. */
export function settingSummary(elements: ScreenplayElement[]): SettingSummary {
  const s: SettingSummary = { int: 0, ext: 0, day: 0, night: 0, unknownSetting: 0, otherMoment: 0, inheritedDay: 0, inheritedNight: 0, scenes: 0 };
  const moments = sceneMoments(elements);
  for (const [i, scene] of listScenes(elements).entries()) {
    const { prefix } = headingParts(scene.text);
    s.scenes++;
    const setting = settingOf(prefix);
    if (setting === "int" || setting === "both") s.int++;
    if (setting === "ext" || setting === "both") s.ext++;
    if (setting === "") s.unknownSetting++;
    const { moment, inherited } = moments[i];
    if (moment === "day") s.day++;
    else if (moment === "night") s.night++;
    else s.otherMoment++;
    if (inherited && moment === "day") s.inheritedDay++;
    if (inherited && moment === "night") s.inheritedNight++;
  }
  return s;
}

export type PlaceSortKey = "name" | "scenes" | "pages" | "words" | "share" | "first" | "characters";

export function sortPlaces(rows: PlaceRow[], key: PlaceSortKey, desc: boolean, locale = "fr"): PlaceRow[] {
  const value = (r: PlaceRow) => (key === "characters" ? r.characters.length : r[key as Exclude<PlaceSortKey, "name" | "characters">] ?? Infinity);
  const sorted = [...rows].sort((a, b) => (key === "name" ? a.name.localeCompare(b.name, locale) : value(a) - value(b)));
  return desc ? sorted.reverse() : sorted;
}

/** CSV (« ; » et virgule décimale en français), avec en-tête. */
export function placesCsv(rows: PlaceRow[], headers: string[], script: boolean, locale = "fr"): string {
  const sep = locale.startsWith("fr") ? ";" : ",";
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (n: number, digits: number) => (Math.round(n * 10 ** digits) / 10 ** digits).toLocaleString(locale);
  const lines = rows.map((r) =>
    [
      r.name,
      r.scenes,
      script ? num(r.pages, 1) : r.words,
      num(r.share * 100, 1),
      r.first,
      r.last,
      ...(script ? [r.int, r.ext, r.day, r.night] : []),
      r.characters.join(", "),
    ]
      .map(cell)
      .join(sep),
  );
  return [headers.map(cell).join(sep), ...lines].join("\r\n") + "\r\n";
}
