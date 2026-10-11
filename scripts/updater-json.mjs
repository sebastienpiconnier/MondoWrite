// latest.json de la Release (mises à jour dans l'app), écrit une seule fois quand toutes les fabrications
// sont finies : chaque tâche de tauri-action écrivait le sien en même temps et la dernière effaçait les autres
// plateformes. Lit les fichiers .sig de la Release, écrit latest.json et le dépose à la place de l'ancien.
// Usage (CI) : GITHUB_TOKEN, GITHUB_REPOSITORY et RELEASE_TAG dans l'environnement.

/** Plateformes de latest.json et fichier de mise à jour de chacune (comme tauri-action, NSIS pour Windows). */
const PLATFORMS = [
  ["darwin-aarch64", (n) => n === "Cosmos_aarch64.app.tar.gz"],
  ["darwin-aarch64-app", (n) => n === "Cosmos_aarch64.app.tar.gz"],
  ["darwin-x86_64", (n) => n === "Cosmos_x64.app.tar.gz"],
  ["darwin-x86_64-app", (n) => n === "Cosmos_x64.app.tar.gz"],
  ["linux-x86_64", (n) => n.endsWith(".AppImage")],
  ["linux-x86_64-appimage", (n) => n.endsWith(".AppImage")],
  ["linux-x86_64-deb", (n) => n.endsWith(".deb")],
  ["linux-x86_64-rpm", (n) => n.endsWith(".rpm")],
  ["windows-x86_64", (n) => n.endsWith("-setup.exe")],
  ["windows-x86_64-nsis", (n) => n.endsWith("-setup.exe")],
  ["windows-x86_64-msi", (n) => n.endsWith(".msi")],
];

/**
 * Contenu de latest.json. `files` : noms des fichiers de la Release ; `signatures` : contenu de chaque
 * `<nom>.sig`. Une plateforme sans fichier signé est laissée de côté.
 */
export function buildLatest({ version, notes, date, repo, tag, files, signatures }) {
  const platforms = {};
  for (const [platform, match] of PLATFORMS) {
    const name = files.find((f) => match(f) && signatures[f]);
    if (name) platforms[platform] = { signature: signatures[name].trim(), url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}` };
  }
  return { version: version.replace(/^v/, ""), notes, pub_date: date, platforms };
}

async function main() {
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
  const assets = release.assets;
  const signatures = {};
  for (const sig of assets.filter((a) => a.name.endsWith(".sig"))) {
    const res = await api(sig.url, { headers: { accept: "application/octet-stream" } });
    if (res.ok) signatures[sig.name.slice(0, -4)] = await res.text();
  }
  if (Object.keys(signatures).length === 0) {
    console.log("::notice::Aucun fichier signé : pas de latest.json (clé de mise à jour absente).");
    return;
  }
  const latest = buildLatest({ version: tag, notes: release.body ?? "", date: new Date().toISOString(), repo, tag, files: assets.map((a) => a.name), signatures });
  const old = assets.find((a) => a.name === "latest.json");
  if (old) await api(`/releases/assets/${old.id}`, { method: "DELETE" });
  const upload = release.upload_url.replace(/\{.*\}$/, "?name=latest.json");
  const res = await api(upload, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(latest, null, 2) });
  if (!res.ok) throw new Error(`Envoi de latest.json refusé : ${res.status}`);
  console.log(`::notice::latest.json : ${Object.keys(latest.platforms).join(", ")}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((err) => {
    console.log(`::error::${err.message}`);
    process.exit(1);
  });
}
