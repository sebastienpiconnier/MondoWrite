// Met à jour la taille et l'empreinte SHA-256 de chaque exemple dans `exemples.json`, d'après les zip posés à
// côté. À lancer avant d'envoyer le dossier sur https://mondowrite.app/exemples/ :
//   node scripts/examples-manifest.mjs chemin/vers/exemples
// Sans cela, l'app refuse un zip modifié (empreinte différente de celle de la liste). Voir src/examples.ts.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "exemples.json"))) {
  console.error("Usage : node scripts/examples-manifest.mjs <dossier contenant exemples.json et les zip>");
  process.exit(1);
}
const path = join(dir, "exemples.json");
const manifest = JSON.parse(readFileSync(path, "utf8"));
for (const entry of manifest.examples ?? []) {
  const file = join(dir, entry.file);
  if (!existsSync(file)) {
    console.error(`Manquant : ${entry.file}`);
    process.exitCode = 1;
    continue;
  }
  const data = readFileSync(file);
  entry.size = data.length;
  entry.sha256 = createHash("sha256").update(data).digest("hex");
  console.log(`${entry.id} : ${(data.length / 1e6).toFixed(1)} Mo`);
}
writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
