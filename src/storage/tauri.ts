// Stockage sur disque via Tauri.
// - Ordinateur : chaque projet est un dossier choisi par l'auteur (la liste des projets ouverts est mémorisée).
// - Mobile : iOS et Android n'offrent pas de vrai sélecteur de dossier, chaque projet a son dossier
//   dans l'espace privé de l'app ($APPDATA/projets/). La synchronisation entre appareils viendra plus tard.
// Dans les deux cas : cosmos.json + cartes/*.md (+ scenario.fountain), exactement le même format.

import { open, save } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readDir, readFile, readTextFile, remove, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import type { Storage } from "./index";
import { COPIES_DIR, MEDIA_DIR, META_FILE, SCREENPLAY_FILE, TEXT_DIRS, VERSIONS_DIR, type FileMap } from "./paths";
import { IMAGE_EXTENSIONS, mimeOf } from "../media";
import { isMobileOS } from "../platform";
import { getT } from "../i18n";
import { byRecency, dropRecent, readRecents, touchRecent } from "./recents";

/** D'avant l'écran d'accueil : le seul dossier mémorisé. Il rejoint la liste des projets. */
const LAST_FOLDER_KEY = "cosmos:dernier-dossier";
const MOBILE_DIR = "projets";
const mobile = isMobileOS();

/** Projet sélectionné : chemin du dossier (ordinateur) ou nom du dossier privé (mobile). */
let current: string | null = null;

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

async function projectFolder(): Promise<string | null> {
  if (!current) return null;
  return mobile ? join(await appDataDir(), MOBILE_DIR, current) : current;
}

function adoptLegacyFolder() {
  try {
    const path = localStorage.getItem(LAST_FOLDER_KEY);
    if (!path) return;
    if (!readRecents().some((e) => e.id === path)) touchRecent({ id: path, name: baseName(path), openedAt: 0 });
    localStorage.removeItem(LAST_FOLDER_KEY);
  } catch {
    /* rien à reprendre */
  }
}

/** Chemin d'un fichier de markdown/ (relatif, avec des « / ») dans le dossier du projet. */
async function copyPath(name: string): Promise<string | null> {
  const dir = await projectFolder();
  return dir ? join(dir, COPIES_DIR, ...name.split("/")) : null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const tauriStorage: Storage = {
  copies: {
    key: () => current,
    async read(names) {
      const out: FileMap = {};
      for (const name of names) {
        const path = await copyPath(name);
        if (path && (await exists(path))) out[name] = await readTextFile(path);
      }
      return out;
    },
    async write(files, removed) {
      for (const [name, content] of Object.entries(files)) {
        const path = await copyPath(name);
        if (!path) throw new Error("Aucun dossier projet choisi");
        const parent = await copyPath(name.split("/").slice(0, -1).join("/"));
        if (parent) await mkdir(parent, { recursive: true });
        await writeTextFile(path, content);
      }
      for (const name of removed) {
        const path = await copyPath(name);
        if (path && (await exists(path))) await remove(path);
      }
    },
    async versions() {
      const dir = await copyPath(VERSIONS_DIR);
      if (!dir || !(await exists(dir))) return [];
      return (await readDir(dir)).filter((e) => e.isDirectory && DAY.test(e.name)).map((e) => e.name);
    },
    async removeVersions(days) {
      for (const day of days.filter((d) => DAY.test(d))) {
        const path = await copyPath(`${VERSIONS_DIR}/${day}`);
        if (path && (await exists(path))) await remove(path, { recursive: true });
      }
    },
  },

  kind: "tauri",
  canPickFolder: !mobile,
  location: () => (mobile || !current ? null : baseName(current)),

  async pickFolder() {
    if (mobile) return true;
    // recursive : sans lui, Tauri n'autorise que les fichiers placés directement dans le dossier,
    // et l'écriture des cartes (sous-dossier cartes/) est refusée hors du dossier personnel.
    const chosen = await open({ directory: true, recursive: true, title: getT().dialog.pickFolder });
    if (typeof chosen !== "string") return false;
    current = chosen;
    return true;
  },

  forget() {
    current = null;
  },

  async list() {
    if (!mobile) {
      adoptLegacyFolder();
      return byRecency(readRecents());
    }
    // Mobile : la liste mémorisée, complétée par les dossiers présents (réinstallation, ancien projet unique).
    const list = readRecents();
    const dir = await join(await appDataDir(), MOBILE_DIR);
    if (await exists(dir)) {
      for (const entry of await readDir(dir)) {
        if (entry.isDirectory && !list.some((e) => e.id === entry.name)) list.push({ id: entry.name, name: entry.name, openedAt: 0 });
      }
    }
    return byRecency(list);
  },
  select(id) {
    current = id;
  },
  async create() {
    if (!mobile) return this.pickFolder();
    current = `projet-${Date.now().toString(36)}`;
    return true;
  },
  remember(info) {
    if (!current) return;
    touchRecent({ id: current, name: mobile ? info.title || current : baseName(current), ...info, openedAt: Date.now() });
  },
  unlist: dropRecent,
  async pickTextFile(label, extensions) {
    // Le fichier choisi dans le dialogue du système est autorisé en lecture par Tauri.
    const path = await open({ multiple: false, directory: false, filters: [{ name: label, extensions }] });
    if (typeof path !== "string") return null;
    return { name: baseName(path), text: await readTextFile(path) };
  },

  async writeMedia(name, data) {
    const dir = await projectFolder();
    if (!dir) throw new Error("Aucun dossier projet choisi");
    const media = await join(dir, MEDIA_DIR);
    await mkdir(media, { recursive: true });
    await writeFile(await join(media, name), data);
  },
  async mediaUrl(name) {
    const dir = await projectFolder();
    if (!dir) return null;
    const path = await join(dir, MEDIA_DIR, name);
    if (!(await exists(path))) return null;
    return URL.createObjectURL(new Blob([(await readFile(path)) as BlobPart], { type: mimeOf(name) }));
  },
  async readMedia(name) {
    const dir = await projectFolder();
    if (!dir) return null;
    const path = await join(dir, MEDIA_DIR, name);
    return (await exists(path)) ? readFile(path) : null;
  },
  async pickFile(label, extensions) {
    // Comme pour une image : le fichier choisi dans le dialogue est autorisé en lecture par Tauri.
    const path = await open({ multiple: false, directory: false, filters: [{ name: label, extensions }] });
    if (typeof path !== "string") return null;
    return { name: baseName(path), data: await readFile(path) };
  },
  async pickImage(label) {
    const path = await open({ multiple: false, directory: false, filters: [{ name: label, extensions: IMAGE_EXTENSIONS }] });
    if (typeof path !== "string") return null;
    return { name: baseName(path), data: await readFile(path) };
  },

  async pickImages(label) {
    const picked = await open({ multiple: true, directory: false, filters: [{ name: label, extensions: IMAGE_EXTENSIONS }] });
    const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    return Promise.all(paths.map(async (path) => ({ name: baseName(path), data: await readFile(path) })));
  },

  async readAll() {
    const dir = await projectFolder();
    if (!dir) return null;
    const metaPath = await join(dir, META_FILE);
    if (!(await exists(metaPath))) return null;
    const files: FileMap = { [META_FILE]: await readTextFile(metaPath) };
    // Cartes et manuscrit : un fichier Markdown par carte, dans chacun de ces dossiers.
    for (const name of TEXT_DIRS) {
      const folder = await join(dir, name);
      if (!(await exists(folder))) continue;
      for (const entry of await readDir(folder)) {
        if (entry.isFile && entry.name.endsWith(".md")) {
          files[`${name}/${entry.name}`] = await readTextFile(await join(folder, entry.name));
        }
      }
    }
    const screenplayPath = await join(dir, SCREENPLAY_FILE);
    if (await exists(screenplayPath)) files[SCREENPLAY_FILE] = await readTextFile(screenplayPath);
    return files;
  },

  async write(files, removed) {
    const dir = await projectFolder();
    if (!dir) throw new Error("Aucun dossier projet choisi");
    for (const name of TEXT_DIRS) {
      // Le dossier du manuscrit n'est créé que s'il y a un texte à y écrire.
      if (name === TEXT_DIRS[0] || Object.keys(files).some((path) => path.startsWith(`${name}/`))) await mkdir(await join(dir, name), { recursive: true });
    }
    for (const [path, content] of Object.entries(files)) {
      await writeTextFile(await join(dir, ...path.split("/")), content);
    }
    for (const path of removed) {
      const full = await join(dir, ...path.split("/"));
      if (await exists(full)) await remove(full);
    }
  },

  async saveAs(file, label) {
    // Dialogue « Enregistrer sous » du système : le chemin choisi est autorisé en écriture par Tauri.
    const path = await save({ defaultPath: file.name, filters: [{ name: label, extensions: [file.extension] }] });
    if (!path) return false;
    await writeFile(path, file.data);
    return true;
  },
};
