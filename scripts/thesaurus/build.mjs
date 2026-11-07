// Fabrique le thésaurus français à héberger sur mondowrite.app (option 2 de docs/plan-synonymes.md : l'app ne
// l'embarque pas, elle le télécharge au premier usage, vérifie son empreinte SHA-256, puis le garde hors ligne).
// Source : thesaurus de Dicollecte / Grammalecte (`thes_fr.dat`, format MyThes), LGPL 2.1 ou ultérieure,
// voir THIRD-PARTY-NOTICES.md. Le fichier de données reste à part du code, remplaçable.
//
// Usage : node scripts/thesaurus/build.mjs <thes_fr.dat> [dossier de sortie, défaut dist-thesaurus]
// Écrit : <sortie>/fr.json         { "<mot>": [ ["synonyme", …], … ] } un tableau par sens
//         <sortie>/thesaurus.json  { "thesaurus": [ { lang, file, size, sha256, entries } ] } à publier avec lui
//         <sortie>/LICENSE-thes_fr.txt  le README de la source (licence, auteurs)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("Usage : node scripts/thesaurus/build.mjs <thes_fr.dat> [dossier de sortie]");
  process.exit(1);
}
const outDir = process.argv[3] ?? join(import.meta.dirname, "..", "..", "dist-thesaurus");
mkdirSync(outDir, { recursive: true });

const MAX_SENSES = 6;
const MAX_SYNONYMS = 14;

/** Entrées d'un fichier MyThes : « mot|N » puis N lignes « (Catégorie)|syn|syn… ». */
export function parseMyThes(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const result = {};
  let i = 1; // la première ligne est l'encodage
  while (i < lines.length) {
    const head = lines[i++];
    if (!head) continue;
    const bar = head.lastIndexOf("|");
    const count = parseInt(head.slice(bar + 1), 10);
    if (bar < 0 || !Number.isFinite(count)) continue;
    const word = head.slice(0, bar).trim().toLowerCase();
    const senses = [];
    for (let k = 0; k < count && i < lines.length; k++) {
      const parts = lines[i++].split("|").slice(1); // sans la catégorie grammaticale
      const group = [...new Set(parts.map((w) => w.replace(/\s*\(.*?\)\s*$/, "").trim()).filter((w) => w && w.toLowerCase() !== word))].slice(0, MAX_SYNONYMS);
      if (group.length) senses.push(group);
    }
    if (senses.length && word) (result[word] ??= []).push(...senses);
  }
  for (const k of Object.keys(result)) result[k] = result[k].slice(0, MAX_SENSES);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = parseMyThes(readFileSync(source, "utf8"));
  const json = JSON.stringify(data);
  writeFileSync(join(outDir, "fr.json"), json);
  const bytes = Buffer.from(json);
  const entry = { lang: "fr", file: "fr.json", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), entries: Object.keys(data).length };
  writeFileSync(join(outDir, "thesaurus.json"), JSON.stringify({ thesaurus: [entry] }, null, 2) + "\n");
  const readme = join(dirname(source), "README_thes_fr.txt");
  if (existsSync(readme)) copyFileSync(readme, join(outDir, "LICENSE-thes_fr.txt"));
  console.log(entry);
}
