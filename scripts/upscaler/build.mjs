// Agrandisseur (#78, lot 4) : prépare dist-upscaler/, à publier tel quel dans https://mondowrite.app/upscaler/.
//   node scripts/upscaler/build.mjs realesr-general-x4v3.onnx
// Copie le modèle (fait par convert.py), le moteur WebAssembly d'onnxruntime-web de la version installée (nommé
// avec sa version : chaque version de MondoWrite demande le sien, et les anciens restent publiés pour les
// installations pas encore mises à jour), les licences, et écrit upscaler.json (tailles, SHA-256). Si un
// upscaler.json déjà publié est passé en second argument, ses moteurs sont gardés dans la liste.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const [model, previous] = process.argv.slice(2);
if (!model) {
  console.error("usage : node scripts/upscaler/build.mjs <modèle.onnx> [upscaler.json publié]");
  process.exit(1);
}
const out = "dist-upscaler";
mkdirSync(out, { recursive: true });
const version = JSON.parse(readFileSync("node_modules/onnxruntime-web/package.json", "utf8")).version;
const app = readFileSync("src/upscaler.ts", "utf8").match(/ORT_VERSION = "([^"]+)"/)?.[1];
if (app !== version) {
  console.error(`ORT_VERSION de src/upscaler.ts (${app}) n'est pas la version installée d'onnxruntime-web (${version}).`);
  process.exit(1);
}
const entry = (file) => {
  const data = readFileSync(join(out, file));
  return { file, size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
};
copyFileSync(model, join(out, basename(model)));
const wasm = `ort-${version}.asyncify.wasm`;
copyFileSync("node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm", join(out, wasm));
copyFileSync(new URL("./LICENSE-onnxruntime.txt", import.meta.url), join(out, "LICENSE-onnxruntime.txt"));
writeFileSync(
  join(out, "LICENSE-Real-ESRGAN.txt"),
  readFileSync(new URL("./LICENSE-Real-ESRGAN.txt", import.meta.url), "utf8"),
);
const runtime = previous && existsSync(previous) ? (JSON.parse(readFileSync(previous, "utf8")).runtime ?? {}) : {};
runtime[version] = entry(wasm);
const manifest = { model: { ...entry(basename(model)), scale: 4 }, runtime };
writeFileSync(join(out, "upscaler.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
