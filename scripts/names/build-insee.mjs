// Fabrique le registre des prénoms français (src/assets/names/registers/FR.json) d'après le fichier des prénoms de
// l'INSEE (naissances par sexe, prénom et année depuis 1900, Licence Ouverte Etalab 2.0).
// Usage : node scripts/names/build-insee.mjs <prénoms.csv> [noms.txt] [seuil des prénoms, 300 par défaut] [seuil des noms, 2000]
// Colonnes lues par leur en-tête : sexe (1 garçon, 2 fille), preusuel, annais, nombre ; séparateur « ; » ou tabulation.
// Les prénoms rares et les années inconnues (XXXX) ne sont pas repris.
// Noms de famille (facultatif, 2e argument) : fichier « noms de famille 1891-2000 » (noms2008nat_txt, tabulations, NOM puis
// onze tranches de dix ans). Chaque tranche 1901-1910 … 1991-2000 prend la décennie 1900-1909 … 1990-1999 (décalage d'un an
// assumé), 1891-1900 est écartée, et les décennies 2000 à 2020 reprennent la dernière tranche.
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

/** Lit le fichier des noms de famille de l'INSEE : [[Nom, [porteurs par décennie]]], noms de moins de `min` porteurs écartés. */
export function parseInseeNames(text, min = 2000) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error("fichier vide");
  const map = new Map();
  for (const line of lines.slice(1)) {
    const c = line.split("\t");
    if (c.length < 12 || c[0].startsWith("_")) continue;
    const v = c.slice(1, 12).map((x) => Number(x) || 0);
    if (v.reduce((a, b) => a + b, 0) < min) continue;
    const row = new Array(ERAS).fill(0);
    for (let t = 1; t < 11; t++) row[t - 1] = v[t];
    row[10] = row[11] = row[12] = row[9];
    map.set(titleCase(c[0]), row);
  }
  return [...map].sort((a, b) => a[0].localeCompare(b[0], "fr"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage : node scripts/names/build-insee.mjs <nat2023.csv> [seuil]");
    process.exit(1);
  }
  const namesFile = process.argv[3] && !/^\d+$/.test(process.argv[3]) ? process.argv[3] : null;
  const nums = process.argv.slice(3).filter((a) => /^\d+$/.test(a)).map(Number);
  const reg = parseInsee(readFileSync(file, "utf8"), nums[0] || 300);
  if (namesFile) reg.l = parseInseeNames(readFileSync(namesFile, "utf8"), nums[1] || 2000);
  const dir = join(import.meta.dirname, "..", "..", "src", "assets", "names", "registers");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "FR.json");
  writeFileSync(out, JSON.stringify({ from: FROM, step: STEP, f: reg.f, m: reg.m, ...(reg.l ? { l: reg.l } : {}) }));
  console.log(`${out} : ${reg.f.length} prénoms féminins, ${reg.m.length} masculins${reg.l ? `, ${reg.l.length} noms` : ""}`);
}
