// Remplace des fichiers de la Release (brouillon compris) par ceux donnés en argument : sert aux installeurs
// Windows signés par SignPath et à leurs nouveaux .sig, qui remplacent ceux que tauri-action a déposés.
// Usage (CI) : GITHUB_TOKEN, GITHUB_REPOSITORY et RELEASE_TAG dans l'environnement,
//   node scripts/release-assets.mjs fichier1 fichier2 …
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

/** Nom d'un fichier dans une Release : GitHub remplace les espaces par des points, comme tauri-action. */
export function assetName(path) {
  return basename(path).replace(/ /g, ".");
}

async function main(files) {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, RELEASE_TAG: tag } = process.env;
  const api = (path, init = {}) =>
    fetch(path.startsWith("http") ? path : `https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", ...(init.headers ?? {}) },
    });
  // Le brouillon n'a pas encore d'étiquette : on le cherche dans la liste (brouillons compris).
  const releases = await (await api("/releases?per_page=30")).json();
  const release = releases.find((r) => r.tag_name === tag);
  if (!release) throw new Error(`Release ${tag} introuvable`);
  for (const file of files) {
    const name = assetName(file);
    const old = release.assets.find((a) => a.name === name);
    if (old) {
      const del = await api(`/releases/assets/${old.id}`, { method: "DELETE" });
      if (!del.ok) throw new Error(`Suppression de ${name} refusée : ${del.status}`);
    }
    const upload = release.upload_url.replace(/\{.*\}$/, `?name=${encodeURIComponent(name)}`);
    const res = await api(upload, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: await readFile(file) });
    if (!res.ok) throw new Error(`Envoi de ${name} refusé : ${res.status}`);
    console.log(`::notice::${name} remplacé`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main(process.argv.slice(2)).catch((err) => {
    console.log(`::error::${err.message}`);
    process.exit(1);
  });
}
