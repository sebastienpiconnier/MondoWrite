// Fabrique le registre des prénoms français (src/assets/names/registers/FR.json) d'après le fichier des prénoms de
// l'INSEE (naissances par sexe, prénom et année depuis 1900, Licence Ouverte Etalab 2.0).
// Usage : node scripts/names/build-insee.mjs <nat2023.csv> [seuil de naissances, 300 par défaut]
// Colonnes lues par leur en-tête : sexe (1 garçon, 2 fille), preusuel, annais, nombre ; séparateur « ; » ou tabulation.
// Les prénoms rares et les années inconnues (XXXX) ne sont pas repris. Les noms de famille viendront du fichier
// « noms de famille 1891-2000 » (même principe, tranches de dix ans), dès qu'on l'aura sous les yeux.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const FROM = 1900;
export const STEP = 10;
export const ERAS = 13; // 1900-1909 … 2020-2029

/** « JEAN-PIERRE » → « Jean-Pierre », « MARIE HÉLÈNE » → « Marie Hélène ». */
export function titleCase(raw) {
  return raw
    .toLocaleLowerCase("fr")
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, c) => sep + c.toLocaleUpperCase("fr"));
}

/** Lit le CSV de l'INSEE et rend { f: [[prénom, [naissances par décennie]]], m: [...] }, prénoms de moins de `min` naissances écartés. */
export function parseInsee(text, min = 300) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error("fichier vide");
  const sep = lines[0].includes(";") ? ";" : "\t";
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const [iSex, iName, iYear, iCount] = ["sexe", "preusuel", "annais", "nombre"].map(col);
  if ([iSex, iName, iYear, iCount].some((i) => i < 0)) throw new Error(`en-tête inattendu : ${lines[0]}`);
  const tables = { 1: new Map(), 2: new Map() };
  for (const line of lines.slice(1)) {
    const c = line.split(sep);
    const sex = c[iSex]?.trim();
    const name = c[iName]?.trim();
    const year = Number(c[iYear]);
    const n = Number(c[iCount]);
    if (!tables[sex] || !name || name.startsWith("_") || !Number.isInteger(year) || !(n > 0)) continue;
    const era = Math.floor((year - FROM) / STEP);
    if (era < 0 || era >= ERAS) continue;
    const key = titleCase(name);
    const row = tables[sex].get(key) ?? new Array(ERAS).fill(0);
    row[era] += n;
    tables[sex].set(key, row);
  }
  const rows = (map) =>
    [...map]
      .filter(([, counts]) => counts.reduce((a, b) => a + b, 0) >= min)
      .sort((a, b) => a[0].localeCompare(b[0], "fr"));
  return { f: rows(tables[2]), m: rows(tables[1]) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage : node scripts/names/build-insee.mjs <nat2023.csv> [seuil]");
    process.exit(1);
  }
  const reg = parseInsee(readFileSync(file, "utf8"), Number(process.argv[3]) || 300);
  const dir = join(import.meta.dirname, "..", "..", "src", "assets", "names", "registers");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "FR.json");
  writeFileSync(out, JSON.stringify({ from: FROM, step: STEP, f: reg.f, m: reg.m }));
  console.log(`${out} : ${reg.f.length} prénoms féminins, ${reg.m.length} masculins`);
}
