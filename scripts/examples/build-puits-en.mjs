// Version anglaise de l'exemple « Le Puits » : part de src/assets/examples/puits.fr.json (fabriqué par
// build-puits.mjs) et remplace textes, titres et faits par la traduction de scripts/examples/puits-en/ :
//   cartes/<id>.md     fiches traduites (fichier entier)
//   manuscrit/<id>.md  texte des scènes, blocs de choix compris (destinations et faits en anglais)
//   scenes.json        titre et synopsis de chaque carte Scène
//   meta.json          titre du projet, libellés des faits, des cadres et des fils
//
//   node scripts/examples/build-puits-en.mjs
//
// Une carte ou une scène sans traduction fait échouer le script : l'exemple anglais ne mélange jamais les langues.

import fs from "node:fs";
import path from "node:path";
import { withImages } from "./puits-images.mjs";

const src = path.join("scripts", "examples", "puits-en");
const fr = JSON.parse(fs.readFileSync(path.join("src", "assets", "examples", "puits.fr.json"), "utf8"));
const scenes = JSON.parse(fs.readFileSync(path.join(src, "scenes.json"), "utf8"));
const meta = JSON.parse(fs.readFileSync(path.join(src, "meta.json"), "utf8"));
const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").replace(/\r\n?/g, "\n") : null);

const files = {};
const missing = [];
for (const [p, text] of Object.entries(fr.files)) {
  if (p === "cosmos.json") continue;
  const id = path.basename(p, ".md");
  if (p.startsWith("manuscrit/")) {
    const en = readIf(path.join(src, "manuscrit", `${id}.md`));
    if (en === null) missing.push(p);
    else files[p] = en;
    continue;
  }
  if (scenes[id]) {
    const [title, synopsis] = scenes[id];
    files[p] = `---\nid: ${id}\ntype: scene\ntitle: ${JSON.stringify(title)}\nfiche: ${JSON.stringify({ synopsis })}\n---\n`;
    continue;
  }
  const en = readIf(path.join(src, "cartes", `${id}.md`));
  // Une carte sans titre ni texte (Idée vide) n'a rien à traduire.
  if (en !== null) files[p] = en;
  else if (/^title: ""$/m.test(text) && !text.split(/^---$/m)[2]?.trim()) files[p] = text;
  else missing.push(p);
}
if (missing.length) throw new Error(`Sans traduction : ${missing.join(", ")}`);

const cosmos = JSON.parse(fr.files["cosmos.json"]);
cosmos.title = meta.title;
cosmos.storyFacts = meta.storyFacts;
cosmos.pitch = JSON.parse(fs.readFileSync(path.join("scripts", "examples", "puits-pitch.en.json"), "utf8"));
for (const frame of cosmos.frames ?? []) {
  if (!(frame.title in meta.frames)) throw new Error(`Cadre sans traduction : ${frame.title}`);
  frame.title = meta.frames[frame.title];
}
for (const link of cosmos.links ?? []) {
  if (!link.label) continue;
  if (!(link.label in meta.links)) throw new Error(`Fil sans traduction : ${link.label}`);
  link.label = meta.links[link.label];
}
files["cosmos.json"] = `${JSON.stringify(cosmos, null, 2)}\n`;
Object.assign(files, withImages(files, "en"));

const out = path.join("src", "assets", "examples", "puits.en.json");
fs.writeFileSync(out, `${JSON.stringify({ title: meta.title, files })}\n`);
console.log(`${out} : ${Object.keys(files).length} fichiers, ${(fs.statSync(out).size / 1024).toFixed(0)} Ko`);
