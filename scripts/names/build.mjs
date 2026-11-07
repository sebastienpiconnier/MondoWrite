// Fabrique les listes de prénoms et de noms par pays (src/assets/names/<pays>.json) à partir des fichiers de
// données de @faker-js/faker (MIT). Seules les données sont reprises, pas la bibliothèque.
// Usage : node scripts/names/build.mjs <dossier du paquet @faker-js/faker décompressé> (celui qui contient dist/)
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("Usage : node scripts/names/build.mjs <dossier @faker-js/faker>");
  process.exit(1);
}
const out = join(import.meta.dirname, "..", "..", "src", "assets", "names");
mkdirSync(out, { recursive: true });

// Fichier Faker -> code du pays écrit dans le fichier (jamais traduit)
const COUNTRIES = {
  fr: "FR", fr_BE: "BE", fr_CH: "CH", fr_CA: "CA", en_US: "US", en_GB: "GB", en_IE: "IE", en_AU: "AU", es: "ES",
  es_MX: "MX", it: "IT", de: "DE", de_AT: "AT", pt_BR: "BR", pt_PT: "PT", nl: "NL", pl: "PL", sv: "SE", da: "DK",
  nb_NO: "NO", fi: "FI", cs_CZ: "CZ", hu: "HU", ro: "RO", tr: "TR", el: "GR", ru: "RU", uk: "UA", ja: "JP",
  ko: "KR", zh_CN: "CN", ar: "SA", he: "IL", fa: "IR", hi: "IN", vi: "VN", id_ID: "ID",
};

const clean = (list) =>
  [...new Set((list ?? []).filter((x) => typeof x === "string").map((x) => x.trim()).filter((x) => x && x.length <= 24 && !/[0-9{}()]/.test(x)))].sort((a, b) => a.localeCompare(b));

for (const f of readdirSync(out)) if (f.endsWith(".json")) rmSync(join(out, f));
const seen = new Set();
const index = {};
for (const [file, code] of Object.entries(COUNTRIES)) {
  let mod;
  try {
    mod = await import(pathToFileURL(resolve(src, "dist", "locale", `${file}.js`)).href);
  } catch {
    continue;
  }
  const person = mod.faker?.rawDefinitions?.person ?? mod.faker?.definitions?.person;
  if (!person) continue;
  const first = person.first_name ?? {};
  const f = clean(Array.isArray(first) ? [] : [...(first.female ?? []), ...(person.female_first_name ?? [])]);
  const m = clean(Array.isArray(first) ? [] : [...(first.male ?? []), ...(person.male_first_name ?? [])]);
  const x = clean(Array.isArray(first) ? first : first.generic ?? []);
  const lastRaw = person.last_name ?? {};
  const l = clean(Array.isArray(lastRaw) ? lastRaw : [...(lastRaw.generic ?? []), ...(lastRaw.female ?? []), ...(lastRaw.male ?? [])]);
  const lastNames = l.length ? l : clean(person.last_name_pattern ? [] : []);
  // Trop peu de prénoms pour un tirage utile, ou mêmes données qu'un pays déjà écrit (fr = fr_CA, en_US = en_GB).
  if (f.length < 30 || m.length < 30 || lastNames.length < 30) continue;
  const hash = createHash("sha1").update(JSON.stringify([f, m, x, lastNames])).digest("hex");
  if (seen.has(hash)) continue;
  seen.add(hash);
  // Dans un même fichier, les prénoms sans genre vont dans « x » ; un prénom présent des deux côtés est unisexe.
  writeFileSync(join(out, `${code}.json`), JSON.stringify({ f, m, x, l: lastNames }));
  index[code] = { file, f: f.length, m: m.length, x: x.length, l: lastNames.length };
}
console.log(index);
