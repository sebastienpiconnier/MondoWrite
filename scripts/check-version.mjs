// Vérifie que le numéro de version est le même aux six endroits (CLAUDE.md, « Numéros de version ») et, si une
// étiquette est donnée (« v1.7.2 »), qu'elle est bien ce numéro. Lancé en tête de la Release : une étiquette poussée
// avant d'avoir changé les fichiers donnait un latest.json « 1.7.2 » qui installait une 1.7.1, et l'app annonçait
// alors la même mise à jour à chaque lancement.
//   node scripts/check-version.mjs [v1.7.2]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

export function versionsInRepo() {
  const lock = read("src-tauri/Cargo.lock").match(/\[\[package\]\]\nname = "cosmos"\nversion = "([^"]+)"/);
  return {
    "package.json": JSON.parse(read("package.json")).version,
    "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
    "src-tauri/Cargo.toml (ligne 3)": read("src-tauri/Cargo.toml").split("\n")[2].match(/^version = "([^"]+)"/)?.[1] ?? null,
    "src-tauri/Cargo.lock (cosmos)": lock?.[1] ?? null,
    "README.md": read("README.md").match(/\(version ([0-9][^)]*)\)/)?.[1] ?? null,
    "README.en.md": read("README.en.md").match(/\(version ([0-9][^)]*)\)/)?.[1] ?? null,
  };
}

export function versionProblems(versions, tag) {
  const expected = versions["package.json"];
  const problems = Object.entries(versions)
    .filter(([, v]) => v !== expected)
    .map(([where, v]) => `${where} : ${v ?? "introuvable"} (package.json : ${expected})`);
  if (tag && tag.replace(/^v/, "") !== expected) problems.push(`étiquette ${tag} : l'app est en ${expected}`);
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = versionProblems(versionsInRepo(), process.argv[2]);
  if (problems.length > 0) {
    console.error("Numéros de version incohérents :\n- " + problems.join("\n- "));
    process.exit(1);
  }
  console.log(`Version ${versionsInRepo()["package.json"]} partout.`);
}
