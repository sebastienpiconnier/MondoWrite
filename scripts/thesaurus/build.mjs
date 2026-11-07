// Fabrique le dictionnaire de synonymes anglais (src/assets/thesaurus/en.json) à partir de WordNet 3.x
// (Princeton, licence WordNet de type BSD, voir THIRD-PARTY-NOTICES.md).
// Usage : node scripts/thesaurus/build.mjs <dossier dict de wordnet-db> (celui qui contient index.noun…)
// Format écrit : { "<mot>": [ ["synonyme", …], … ] } — un tableau par sens, du plus courant au plus rare.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage : node scripts/thesaurus/build.mjs <dossier dict de WordNet>");
  process.exit(1);
}
const outDir = join(import.meta.dirname, "..", "..", "src", "assets", "thesaurus");
mkdirSync(outDir, { recursive: true });

const MAX_SENSES = 5;
const MAX_SYNONYMS = 9;
const POS = ["noun", "verb", "adj", "adv"];
const words = (s) => s.replace(/_/g, " ");

const synsets = {}; // "pos:offset" -> mots
const similar = {}; // "pos:offset" -> synsets voisins (adjectifs : « similaire à »)
for (const pos of POS) {
  for (const line of readFileSync(join(dir, `data.${pos}`), "utf8").split("\n")) {
    if (!line || line.startsWith("  ")) continue;
    const t = line.split(" ");
    const count = parseInt(t[3], 16);
    const list = [];
    for (let i = 0; i < count; i++) list.push(t[4 + i * 2].replace(/\(.*\)$/, "").toLowerCase());
    synsets[`${pos}:${t[0]}`] = list;
    if (pos === "adj") {
      const pc = parseInt(t[4 + count * 2], 10);
      const near = [];
      for (let i = 0; i < pc; i++) {
        const base = 5 + count * 2 + i * 4;
        if (t[base] === "&") near.push(`adj:${t[base + 1]}`);
      }
      similar[`${pos}:${t[0]}`] = near;
    }
  }
}

const result = {};
for (const pos of POS) {
  for (const line of readFileSync(join(dir, `index.${pos}`), "utf8").split("\n")) {
    if (!line || line.startsWith("  ")) continue;
    const t = line.split(" ");
    const lemma = t[0];
    if (!/^[a-z][a-z'-]*$/.test(lemma)) continue; // un seul mot, en minuscules
    const pCnt = parseInt(t[3], 10);
    const tagged = parseInt(t[5 + pCnt], 10); // nombre de sens vus dans un corpus : on garde les mots courants
    if (!tagged) continue;
    const offsets = t.slice(6 + pCnt).filter((x) => /^\d{8}$/.test(x));
    for (const off of offsets) {
      const key = `${pos}:${off}`;
      const own = synsets[key] ?? [];
      // Un adjectif « tête » n'a souvent que lui-même : ses voisins (beau : joli, magnifique…) font ses synonymes.
      const near = own.length < 2 ? (similar[key] ?? []).flatMap((k) => synsets[k] ?? []) : [];
      const group = [...own, ...near].filter((w) => w !== lemma && /^[a-z][a-z' -]*$/.test(w));
      if (!group.length) continue;
      (result[lemma] ??= []).push([...new Set(group.map(words))].slice(0, MAX_SYNONYMS));
    }
  }
}
for (const k of Object.keys(result)) result[k] = result[k].slice(0, MAX_SENSES);
writeFileSync(join(outDir, "en.json"), JSON.stringify(result));
console.log(Object.keys(result).length, "mots");
