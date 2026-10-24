// Chiffres des personnages (Bible, Personnages › Chiffres) : scènes, répliques, mots dits, temps de parole,
// apparitions, et répartition par genre d'après le champ « Genre » des fiches (valeurs de l'auteur, regroupées
// telles quelles). Rien n'est enregistré : tout est relu dans le texte. Fonctions pures.

import type { ScreenplayElement } from "../screenplay/model";
import { characterName, listScenes } from "../screenplay/scenes";
import type { CardData } from "../types";
import { countWords, detectCards } from "../manuscript";
import { foldName } from "./names";
import { scenesWith } from "./filter";

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
}

/** Mots d'une réplique (la ponctuation seule, « ? » ou « — », n'en est pas un). */
const spokenWords = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Noms par lesquels une carte Personnage est désignée : titre et surnoms. */
const cardNames = (card: CardData) => [card.title, ...(card.fiche?.surnoms ?? "").split(/[,;]/)].map((n) => n.trim()).filter(Boolean);

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
    const names = cardNames(card);
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

export type SortKey = "name" | "gender" | "scenes" | "lines" | "words" | "share" | "first";

/** Tri d'une colonne (nombres décroissants d'abord, textes dans l'ordre alphabétique de la langue). */
export function sortRows(rows: CharacterRow[], key: SortKey, desc: boolean, locale = "fr"): CharacterRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (key === "name" || key === "gender") return a[key].localeCompare(b[key], locale);
    return (a[key] ?? Infinity) - (b[key] ?? Infinity);
  });
  return desc ? sorted.reverse() : sorted;
}

/** CSV (séparateur « ; » en français, « , » ailleurs, comme les tableurs de chaque langue), avec en-tête. */
export function reportCsv(rows: CharacterRow[], headers: string[], locale = "fr"): string {
  const sep = locale.startsWith("fr") ? ";" : ",";
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const percent = (n: number) => (Math.round(n * 1000) / 10).toLocaleString(locale);
  const lines = rows.map((r) => [r.name, r.gender, r.scenes, r.lines, r.words, percent(r.share), r.first, r.last].map(cell).join(sep));
  return [headers.map(cell).join(sep), ...lines].join("\r\n") + "\r\n";
}
