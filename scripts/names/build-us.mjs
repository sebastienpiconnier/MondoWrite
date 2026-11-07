// Fabrique le registre des États-Unis (src/assets/names/registers/US.json) : prénoms de la Social Security Administration
// (fichiers yobAAAA.txt de names.zip, « Nom,F|M,naissances », domaine public) et noms de famille du Census 2010
// (Names_2010Census.csv, domaine public). Usage : node scripts/names/build-us.mjs <dossier des yobAAAA.txt> <Names_2010Census.csv> [seuil prénoms 2000] [seuil noms 20000]
// Les noms de famille n'ont pas d'époque : le même nombre est repris dans chaque décennie. Rien ne relie un nom à une origine.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const FROM = 1900;
export const STEP = 10;
export const ERAS = 13;

/** Un fichier par année : { année: texte }. Rend { f, m } : [[prénom, [naissances par décennie]]], prénoms de moins de `min` naissances écartés. */
export function parseSsa(byYear, min = 2000) {
  const tables = { F: new Map(), M: new Map() };
  for (const [year, text] of Object.entries(byYear)) {
    const era = Math.floor((Number(year) - FROM) / STEP);
    if (era < 0 || era >= ERAS) continue;
    for (const line of text.split(/\r?\n/)) {
      const [name, sex, count] = line.split(",");
      const n = Number(count);
      if (!tables[sex] || !name || !(n > 0)) continue;
      const row = tables[sex].get(name) ?? new Array(ERAS).fill(0);
      row[era] += n;
      tables[sex].set(name, row);
    }
  }
  const rows = (map) =>
    [...map].filter(([, c]) => c.reduce((a, b) => a + b, 0) >= min).sort((a, b) => a[0].localeCompare(b[0], "en"));
  return { f: rows(tables.F), m: rows(tables.M) };
}

/** « MCDONALD » → « McDonald », « O'BRIEN » → « O'Brien ». */
export function usTitleCase(raw) {
  return raw
    .toLocaleLowerCase("en")
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, c) => sep + c.toLocaleUpperCase("en"))
    .replace(/^Mc(\p{L})/u, (_, c) => "Mc" + c.toLocaleUpperCase("en"));
}

/** Names_2010Census.csv (name, rank, count…) → [[Nom, [porteurs, répétés dans chaque décennie]]]. Seules les colonnes name et count sont lues. */
export function parseCensus(text, min = 20000) {
  const out = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    const c = line.split(",");
    const n = Number(c[2]);
    if (c[0] && n >= min) out.push([usTitleCase(c[0]), new Array(ERAS).fill(n)]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0], "en"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, census, minF, minL] = process.argv.slice(2);
  if (!dir || !census) {
    console.error("Usage : node scripts/names/build-us.mjs <dossier yobAAAA.txt> <Names_2010Census.csv> [seuil prénoms] [seuil noms]");
    process.exit(1);
  }
  const byYear = {};
  for (const f of readdirSync(dir)) {
    const m = /^yob(\d{4})\.txt$/.exec(f);
    if (m) byYear[m[1]] = readFileSync(join(dir, f), "utf8");
  }
  const reg = parseSsa(byYear, Number(minF) || 2000);
  const l = parseCensus(readFileSync(census, "utf8"), Number(minL) || 20000);
  const out = join(import.meta.dirname, "..", "..", "src", "assets", "names", "registers");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "US.json"), JSON.stringify({ from: FROM, step: STEP, f: reg.f, m: reg.m, l }));
  console.log(`US.json : ${reg.f.length} prénoms féminins, ${reg.m.length} masculins, ${l.length} noms`);
}
