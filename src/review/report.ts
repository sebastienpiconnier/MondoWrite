// Chiffres des personnages (Bible, Personnages › Chiffres) : scènes, répliques, mots dits, temps de parole,
// apparitions, et répartition par genre d'après le champ « Genre » des fiches (valeurs de l'auteur, regroupées
// telles quelles). Rien n'est enregistré : tout est relu dans le texte. Fonctions pures.

import type { ScreenplayElement } from "../screenplay/model";
import { characterName, listScenes } from "../screenplay/scenes";
import type { CardData } from "../types";
import { countWords, detectCards } from "../manuscript";
import { foldName } from "./names";
import { scenesWith } from "./filter";
import { csvSeparator } from "../typoRules";

export interface CharacterRow {
  /** Carte Personnage, ou null pour un nom qui parle sans carte. */
  id: string | null;
  name: string;
  /** Valeur du champ « Genre » de la fiche, telle qu'écrite ("" si vide). */
  gender: string;
  scenes: number;
  /** Scénario : répliques. Roman : 0. */
  lines: number;
  /** Scénario : mots dits. Roman : mots des scènes où il est cité. */
  words: number;
  /** Part, de 0 à 1 : temps de parole (scénario) ou scènes où il est cité (roman). */
  share: number;
  /** Numéros des scènes de première et dernière apparition (1 = la première du récit). */
  first: number | null;
  last: number | null;
  /** Point de vue (1.13.0) : scènes qu'il raconte, leurs mots (roman), et leur part du récit. Absent sans point de vue. */
  pov?: { scenes: number; words: number; share: number };
}

/**
 * Ajoute à chaque ligne d'une carte Personnage les scènes qu'elle raconte (`fiche.pov` des scènes de `order`,
 * l'ordre du récit). Part : des mots du livre (roman écrit), sinon du nombre de scènes. Mêmes lignes si aucune
 * scène n'a de point de vue.
 */
export function withPov(rows: CharacterRow[], cards: CardData[], order: string[], words: (id: string) => number = () => 0): CharacterRow[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const told = new Map<string, { scenes: number; words: number }>();
  let total = 0;
  for (const id of order) {
    const w = words(id);
    total += w;
    const pov = byId.get(id)?.fiche?.pov;
    if (!pov || byId.get(pov)?.type !== "personnage") continue;
    const t = told.get(pov) ?? { scenes: 0, words: 0 };
    t.scenes++;
    t.words += w;
    told.set(pov, t);
  }
  if (told.size === 0) return rows;
  return rows.map((r) => {
    if (!r.id) return r;
    const t = told.get(r.id) ?? { scenes: 0, words: 0 };
    return { ...r, pov: { ...t, share: total > 0 ? t.words / total : order.length ? t.scenes / order.length : 0 } };
  });
}

/** Mots d'une réplique (la ponctuation seule, « ? » ou « — », n'en est pas un). */
const spokenWords = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Articles qu'on ne prend jamais pour un prénom (« Les Thénardier », « The Mother »). */
const ARTICLES = new Set(["LES", "UNE", "DES", "THE", "AUX"]);

/**
 * Prénom d'usage d'un personnage : « HUGO » pour « Hugo Le Bris », celui que propose la complétion du scénario
 * (premier mot d'au moins trois lettres, jamais un article). Null si une autre carte Personnage porte le même.
 */
export function usageName(card: CardData, cards: CardData[] = []): string | null {
  const words = card.title.trim().split(/\s+/);
  const first = foldName(words[0] ?? "");
  if (words.length < 2 || first.length < 3 || ARTICLES.has(first)) return null;
  const shared = cards.some((c) => c.id !== card.id && c.type === "personnage" && (foldName(c.title.trim().split(/\s+/)[0] ?? "") === first || foldName(c.title) === first));
  return shared ? null : words[0];
}

/** Noms par lesquels une carte Personnage est désignée : titre, prénom d'usage (voir `usageName`) et surnoms. */
export const cardNames = (card: CardData, cards: CardData[] = []) =>
  [card.title, usageName(card, cards) ?? "", ...(card.fiche?.surnoms ?? "").split(/[,;]/)].map((n) => n.trim()).filter(Boolean);

/** Scénario : une ligne par carte Personnage, plus les noms qui parlent sans carte. */
export function screenplayReport(elements: ScreenplayElement[], cards: CardData[], locale = "fr"): CharacterRow[] {
  const scenes = listScenes(elements);
  const sceneNumber = new Map(scenes.map((s) => [s.index, s.number]));
  // Répliques et mots dits, par nom replié.
  const spoken = new Map<string, { name: string; lines: number; words: number }>();
  let speaker: string | null = null;
  for (const el of elements) {
    if (el.type === "character") {
      const name = characterName(el.text).toLocaleUpperCase(locale);
      speaker = name ? foldName(name) : null;
      if (speaker) {
        const s = spoken.get(speaker) ?? { name, lines: 0, words: 0 };
        s.lines++;
        spoken.set(speaker, s);
      }
    } else if (el.type === "dialogue" && speaker) {
      spoken.get(speaker)!.words += spokenWords(el.text);
    } else if (el.type !== "parenthetical") speaker = null;
  }
  const total = [...spoken.values()].reduce((n, s) => n + s.words, 0);

  const row = (id: string | null, name: string, gender: string, names: string[]): CharacterRow => {
    const keys = new Set(names.map(foldName));
    let lines = 0;
    let words = 0;
    for (const [key, s] of spoken) if (keys.has(key)) (lines += s.lines), (words += s.words);
    const where = [...new Set(names.flatMap((n) => scenesWith(elements, n)))].map((i) => sceneNumber.get(i)!).sort((a, b) => a - b);
    return { id, name, gender, scenes: where.length, lines, words, share: total ? words / total : 0, first: where[0] ?? null, last: where[where.length - 1] ?? null };
  };

  const rows: CharacterRow[] = [];
  const covered = new Set<string>();
  for (const card of cards) {
    if (card.type !== "personnage" || !card.title.trim()) continue;
    const names = cardNames(card, cards);
    names.forEach((n) => covered.add(foldName(n)));
    rows.push(row(card.id, card.title.trim(), (card.fiche?.genre ?? "").trim(), names));
  }
  for (const [key, s] of spoken) if (!covered.has(key)) rows.push(row(null, s.name, "", [s.name]));
  return rows;
}

/** Roman : une ligne par carte Personnage ; les scènes sont celles où le texte le cite (dans l'ordre du livre). */
export function novelReport(manuscript: Record<string, string>, order: string[], cards: CardData[]): CharacterRow[] {
  const written = order.filter((id) => manuscript[id]);
  return cards
    .filter((c) => c.type === "personnage" && c.title.trim())
    .map((card) => {
      const where: number[] = [];
      let words = 0;
      written.forEach((id) => {
        if (!detectCards(manuscript[id], [card]).length) return;
        where.push(order.indexOf(id) + 1);
        words += countWords(manuscript[id]);
      });
      return {
        id: card.id,
        name: card.title.trim(),
        gender: (card.fiche?.genre ?? "").trim(),
        scenes: where.length,
        lines: 0,
        words,
        share: written.length ? where.length / written.length : 0,
        first: where[0] ?? null,
        last: where[where.length - 1] ?? null,
      };
    });
}

export interface GenderGroup {
  /** Valeur écrite dans les fiches ("" : non renseigné). */
  gender: string;
  characters: number;
  lines: number;
  words: number;
  /** Somme des parts (temps de parole, ou scènes pour un roman, rapportées au total des parts). */
  share: number;
}

/** Répartition par genre : valeurs regroupées telles qu'écrites (sans casse), « non renseigné » à la fin. */
export function genderSummary(rows: CharacterRow[]): GenderGroup[] {
  const groups = new Map<string, GenderGroup>();
  const totalShare = rows.reduce((n, r) => n + r.share, 0);
  for (const r of rows) {
    const key = r.gender.toLocaleLowerCase();
    const g = groups.get(key) ?? { gender: r.gender, characters: 0, lines: 0, words: 0, share: 0 };
    g.characters++;
    g.lines += r.lines;
    g.words += r.words;
    g.share += totalShare ? r.share / totalShare : 0;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.gender === "") === (b.gender === "") ? b.share - a.share : a.gender === "" ? 1 : -1);
}

export type SortKey = "name" | "gender" | "scenes" | "lines" | "words" | "share" | "first" | "pov";

/** Tri d'une colonne (nombres décroissants d'abord, textes dans l'ordre alphabétique de la langue). */
export function sortRows(rows: CharacterRow[], key: SortKey, desc: boolean, locale = "fr"): CharacterRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (key === "name" || key === "gender") return a[key].localeCompare(b[key], locale);
    if (key === "pov") return (a.pov?.scenes ?? -1) - (b.pov?.scenes ?? -1) || (a.pov?.words ?? 0) - (b.pov?.words ?? 0);
    return (a[key] ?? Infinity) - (b[key] ?? Infinity);
  });
  return desc ? sorted.reverse() : sorted;
}

/**
 * CSV (séparateur « ; » là où la virgule est décimale, « , » ailleurs, typoRules.ts, comme les tableurs de chaque langue), avec en-tête. Avec
 * `povHeaders` (des points de vue existent), trois colonnes de plus : scènes racontées, leurs mots, leur part.
 */
export function reportCsv(rows: CharacterRow[], headers: string[], locale = "fr", povHeaders: string[] = []): string {
  const sep = csvSeparator(locale);
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const percent = (n: number) => (Math.round(n * 1000) / 10).toLocaleString(locale);
  const pov = povHeaders.length > 0;
  // Roman : scènes, mots, part ; scénario (deux en-têtes) : scènes, part.
  const povCells = (r: CharacterRow) => (povHeaders.length >= 3 ? [r.pov?.scenes ?? 0, r.pov?.words ?? 0, percent(r.pov?.share ?? 0)] : [r.pov?.scenes ?? 0, percent(r.pov?.share ?? 0)]);
  const lines = rows.map((r) =>
    [r.name, r.gender, r.scenes, r.lines, r.words, percent(r.share), r.first, r.last, ...(pov ? povCells(r) : [])].map(cell).join(sep),
  );
  return [[...headers, ...(pov ? povHeaders : [])].map(cell).join(sep), ...lines].join("\r\n") + "\r\n";
}
