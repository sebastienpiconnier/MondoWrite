// Fabrique l'exemple intégré « Le Puits » (roman interactif) à partir d'un projet MondoWrite décompressé.
//
//   node scripts/examples/build-puits.mjs <dossier du projet> <langue>
//
// Écrit src/assets/examples/puits.<langue>.json : { title, files } où files associe le chemin d'un fichier du projet
// à son texte (cosmos.json, cartes/, manuscrit/). Ce que l'exemple ne garde pas :
// - les marques de l'assistant IA (`<span data-ia>`, lignes `ia:` et `iaImages:`) : l'auteur a repris le texte ;
// - le journal de l'IA, la corbeille, les versions des scènes, les textes sans carte ;
// - l'ancienne carte des choix (`choiceMap`), les mots écrits par jour (`progress`), l'image de couverture absente.
// Il pose les types de fin (lot 14) et corrige une mention fausse de la fiche du lecteur.

import fs from "node:fs";
import path from "node:path";
import { withImages } from "./puits-images.mjs";

const [dir, lang = "fr"] = process.argv.slice(2);
if (!dir) {
  console.error("Usage : node scripts/examples/build-puits.mjs <dossier du projet> <langue>");
  process.exit(1);
}

const read = (p) => fs.readFileSync(path.join(dir, p), "utf8").replace(/\r\n?/g, "\n");
const list = (d) => (fs.existsSync(path.join(dir, d)) ? fs.readdirSync(path.join(dir, d)).filter((f) => f.endsWith(".md")) : []);

/** Retire les marques de l'IA (le texte reste) ; une balise fermante n'est retirée que si elle ferme une marque. */
function stripIa(text) {
  let out = "";
  const stack = [];
  const re = /<span data-ia="[^"]*">|<span\b[^>]*>|<\/span>/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out += text.slice(last, m.index);
    last = re.lastIndex;
    if (m[0].startsWith("<span data-ia=")) stack.push(true);
    else if (m[0] === "</span>") {
      if (!stack.pop()) out += m[0];
    } else {
      stack.push(false);
      out += m[0];
    }
  }
  return out + text.slice(last);
}

const meta = JSON.parse(read("cosmos.json"));
const cardIds = new Set(list("cartes").map((f) => f.slice(0, -3)));
const titleOf = (id) => /^title: "(.*)"$/m.exec(read(`cartes/${id}.md`))?.[1];

// Types de fin (lot 14), par titre de scène.
const ENDINGS = { "Le matin": "good", "L'eau noire": "bad", "La voix volée": "bad", "La maison": "bad" };

const typeOf = (id) => /^type: (\S+)$/m.exec(read(`cartes/${id}.md`))?.[1];
// Une mention de fiche qui vise une carte Scène alors qu'une autre carte porte le même titre (le personnage Paul, le
// lieu Le puits) vise cette autre carte : la fiche parle du personnage ou du lieu, pas de la scène.
const byTitle = new Map();
for (const id of cardIds) if (typeOf(id) !== "scene") byTitle.set(titleOf(id), id);
const retarget = (text) =>
  text.replace(/\[@([^\]]+)\]\(cosmos:([^)]+)\)/g, (all, label, id) => (typeOf(id) === "scene" && byTitle.has(label) ? `[@${label}](cosmos:${byTitle.get(label)})` : all));
// Les numéros de section cités dans les fiches (« 14 · La niche ») ne suivent pas la renumérotation : retirés.
const unnumber = (text) => text.replace(/révélé au \d+ · /g, "révélé dans ").replace(/La fin \d+ · ([^;]+?) rejoue/g, "La fin « $1 » rejoue").replace(/la fin \d+ · (.+?) la répare/g, "la fin « $1 » la répare").replace(/\b\d+ · /g, "");

const files = {};
for (const f of list("cartes")) {
  let text = stripIa(read(`cartes/${f}`))
    .split("\n")
    .filter((l) => !/^(ia|iaImages):/.test(l))
    .join("\n");
  // Fiche du lecteur : l'enterrement est celui d'Odile, pas de sa lettre.
  const odile = [...cardIds].find((id) => titleOf(id) === "Odile");
  const lettre = [...cardIds].find((id) => titleOf(id) === "La lettre d'Odile");
  if (odile && lettre) text = text.replace(`l'enterrement d'[@La lettre d'Odile](cosmos:${lettre})`, `l'enterrement d'[@Odile](cosmos:${odile})`);
  if (typeOf(f.slice(0, -3)) !== "scene") text = unnumber(retarget(text));
  files[`cartes/${f}`] = text;
}
for (const f of list("manuscrit")) {
  const id = f.slice(0, -3);
  if (!cardIds.has(id)) continue; // texte sans carte : pas dans l'exemple
  let text = stripIa(read(`manuscrit/${f}`));
  const kind = ENDINGS[titleOf(id)];
  if (kind) text = text.replace(/^-> END$/m, `-> END #${kind}`);
  files[`manuscrit/${f}`] = text;
}

delete meta.choiceMap;
delete meta.progress;
if (meta.pitch?.visuel) delete meta.pitch.visuel;
if (meta.pitch && Object.keys(meta.pitch).length === 0) delete meta.pitch;
files["cosmos.json"] = `${JSON.stringify(meta, null, 2)}\n`;
Object.assign(files, withImages(files, lang));

const left = Object.values(files).filter((t) => t.includes("data-ia")).length;
if (left) throw new Error(`${left} fichier(s) gardent une marque de l'IA`);
const missing = Object.entries(ENDINGS).filter(([title]) => !Object.entries(files).some(([p, t]) => p.startsWith("manuscrit/") && titleOf(path.basename(p, ".md")) === title && /-> END #/.test(t)));
if (missing.length) throw new Error(`Fin non marquée : ${missing.map(([t]) => t).join(", ")}`);

const out = path.join("src", "assets", "examples", `puits.${lang}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify({ title: meta.title, files })}\n`);
console.log(`${out} : ${Object.keys(files).length} fichiers, ${(fs.statSync(out).size / 1024).toFixed(0)} Ko`);
