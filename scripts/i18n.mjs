// Outil des traducteurs (TRANSLATING.md). Lancé par `npm run i18n -- <commande>` :
//   npm run i18n                 état de chaque langue (part traduite, chaînes restantes)
//   npm run i18n -- new de       crée src/i18n/de.ts (tous les textes anglais à traduire) et l'inscrit dans langs.ts
//   npm run i18n -- missing de   liste ce qui reste à traduire en allemand, avec le texte anglais
// Les fichiers .ts des langues n'ont que des imports de types : Node les lit tels quels
// (`--experimental-strip-types`, Node 22.6 et après), sans Vite. Marche dans PowerShell comme dans zsh.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src", "i18n");
const load = (file) => import(pathToFileURL(join(dir, file)).href);
const rel = (file) => `src/i18n/${file}`;

/** Fichiers qui ne sont pas des langues. */
const NOT_LANGS = new Set(["fr.ts", "en.ts", "langs.ts", "index.ts", "coverage.ts"]);

/** Nom d'export d'une étiquette : `pt-BR` → `ptBR`. */
export const identifier = (code) => code.replace(/-(\w)/g, (_, c) => c.toUpperCase());

/** Étiquette BCP 47 écrite comme l'usage : langue en minuscules, région en capitales (`pt-BR`). */
export function canonical(code) {
  const [lang, ...rest] = code.replace(/_/g, "-").split("-");
  return [lang.toLowerCase(), ...rest.map((p) => (p.length === 2 ? p.toUpperCase() : p))].join("-");
}

const isKey = (k) => /^[A-Za-z_$][\w$]*$/.test(k);

/** Objet de textes en TypeScript lisible : clés sans guillemets quand c'est possible, deux espaces. */
export function toSource(value, indent = "") {
  const next = `${indent}  `;
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string") && JSON.stringify(value).length < 100) return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
    return `[\n${value.map((v) => `${next}${toSource(v, next)},`).join("\n")}\n${indent}]`;
  }
  const entries = Object.entries(value).map(([k, v]) => `${next}${isKey(k) ? k : JSON.stringify(k)}: ${toSource(v, next)},`);
  return `{\n${entries.join("\n")}\n${indent}}`;
}

async function communityFiles() {
  return readdirSync(dir).filter((f) => f.endsWith(".ts") && !NOT_LANGS.has(f) && !f.endsWith(".d.ts"));
}

async function context() {
  const { fr } = await load("fr.ts");
  const { en } = await load("en.ts");
  const cov = await load("coverage.ts");
  return { fr, en, cov };
}

async function readLang(file) {
  const mod = await load(file);
  const value = Object.values(mod).find((v) => v && typeof v === "object" && "meta" in v);
  if (!value) throw new Error(`${rel(file)} : aucun objet exporté avec « meta » / no exported object with “meta”`);
  return value;
}

async function status() {
  const { fr, en, cov } = await context();
  const total = cov.translatableCount(en, fr);
  const rows = [
    ["fr", fr.meta.name, "100 %", "0", "référence / reference"],
    ["en", en.meta.name, "100 %", "0", ""],
  ];
  for (const file of await communityFiles()) {
    const code = file.replace(/\.ts$/, "");
    const t = await readLang(file);
    const missing = cov.missingPaths(t, en, fr).length;
    const share = Math.floor(cov.translatedShare(t, en, fr) * 100);
    rows.push([code, t.meta.name, `${share} %`, String(missing), registered(code) ? "" : "pas inscrite dans langs.ts / not registered in langs.ts"]);
  }
  console.log(`${total} chaînes à traduire / strings to translate\n`);
  const widths = [6, 22, 6, 8];
  for (const r of [["code", "langue / language", "fait", "reste"], ...rows]) {
    console.log(r.map((c, i) => (i < widths.length ? c.padEnd(widths[i]) : c)).join(" "));
  }
}

async function missing(code) {
  const file = `${canonical(code)}.ts`;
  if (!existsSync(join(dir, file))) return fail(`${rel(file)} n'existe pas / does not exist. npm run i18n -- new ${code}`);
  const { fr, en, cov } = await context();
  const flat = cov.allStrings(en);
  const paths = cov.missingPaths(await readLang(file), en, fr);
  for (const path of paths) console.log(`${path}\n    ${flat.get(path)}`);
  console.log(`\n${paths.length} chaîne(s) à traduire / string(s) to translate`);
}

function registered(code) {
  const langs = readFileSync(join(dir, "langs.ts"), "utf8");
  return langs.includes(`from "./${code}";`);
}

/** Inscrit la langue dans langs.ts, aux lignes repères. */
export function register(langsSource, code) {
  const id = identifier(code);
  const key = isKey(code) ? id : `${JSON.stringify(code)}: ${id}`;
  if (langsSource.includes(`from "./${code}";`)) return langsSource;
  const lines = langsSource.split("\n");
  const imp = lines.findIndex((l) => l.includes("// i18n:imports"));
  const com = lines.findIndex((l) => l.includes("// i18n:community"));
  if (imp < 0 || com < 0) throw new Error("langs.ts : lignes repères i18n:imports et i18n:community introuvables");
  const end = lines.findIndex((l, i) => i > com && l.startsWith("}"));
  lines.splice(end < 0 ? com + 1 : end, 0, `  ${key},`);
  lines.splice(imp, 0, `import { ${id} } from "./${code}";`);
  return lines.join("\n");
}

async function create(raw) {
  if (!raw || !/^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/i.test(raw)) return fail("Indique une étiquette de langue / give a language tag: npm run i18n -- new de");
  const code = canonical(raw);
  if (code === "fr" || code === "en") return fail(`${code} est déjà une langue du projet / is already a project language`);
  const file = `${code}.ts`;
  if (existsSync(join(dir, file))) return fail(`${rel(file)} existe déjà / already exists`);
  const { en } = await context();
  const { typoRules, languageName } = await load("../typoRules.ts");
  const rules = typoRules(code);
  const native = languageName(code, code);
  const english = languageName(code, "en");
  const body = { ...en, meta: { name: native } };
  const quotes = `${rules.quotes[0]}${rules.quoteSpace}…${rules.quoteSpace}${rules.quotes[1]}`;
  const spaces = Object.entries(rules.before)
    .map(([mark, space]) => `${space === " " ? "fine insécable" : "insécable"} avant ${mark}`)
    .join(", ");
  const source = `// ${english} translation of MondoWrite, by the community. See TRANSLATING.md.
// Traduction de MondoWrite (${native}), par la communauté. Voir TRANSLATING.md.
//
// Every text below is still in English: translate it in place. Anything left in English, or removed,
// shows in English in the app. Keep the {variables} as they are.
// Typography (src/typoRules.ts): quotes ${quotes}, inner quotes ${rules.inner[0]}…${rules.inner[1]}, apostrophe ’, dash ${rules.dash}${spaces ? `, ${spaces}` : ""}.
// Check with: npm test (typography) and npm run i18n (progress).

import type { Translation } from "./langs";

export const ${identifier(code)} = ${toSource(body)} satisfies Translation;
`;
  writeFileSync(join(dir, file), source);
  const langsPath = join(dir, "langs.ts");
  writeFileSync(langsPath, register(readFileSync(langsPath, "utf8"), code));
  console.log(`${rel(file)} créé / created (${native}), inscrit dans / registered in src/i18n/langs.ts.`);
  if (!(code.toLowerCase() in (await load("../typoRules.ts")).TYPO_RULES) && !(code.split("-")[0] in (await load("../typoRules.ts")).TYPO_RULES)) {
    console.log(`Aucune règle typographique pour ${code} dans src/typoRules.ts : l'anglais s'applique. Ajoute la ligne de ta langue.`);
    console.log(`No typography rules for ${code} in src/typoRules.ts: English ones apply. Please add a line for your language.`);
  }
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [command, arg] = process.argv.slice(2);
  if (!command || command === "status") await status();
  else if (command === "new") await create(arg);
  else if (command === "missing") await missing(arg ?? "");
  else fail(`Commande inconnue / unknown command: ${command}. Commandes : status, new <code>, missing <code>`);
}
