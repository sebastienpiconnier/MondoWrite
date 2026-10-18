// Stockage de secours pour le navigateur (npm run dev sans Tauri).
// Simule les dossiers projet : une clé localStorage par projet, contenant { chemin: contenu }.

import type { Storage } from "./index";
import type { FileMap } from "./paths";
import { IMAGE_EXTENSIONS, mimeOf } from "../media";
import { byRecency, dropRecent, readRecents, touchRecent, type ProjectEntry } from "./recents";

/** Premier projet du navigateur, d'avant l'écran d'accueil : sa clé n'a pas changé. */
const LEGACY_ID = "demo";
const keyOf = (id: string) => (id === LEGACY_ID ? "cosmos:projet-demo" : `cosmos:projet:${id}`);

let current = LEGACY_ID;

/** Images du projet courant : { nom: adresse data: }, dans une clé à part des fichiers texte. */
const mediaKey = () => `cosmos:medias:${current}`;
function loadMedia(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(mediaKey()) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function load(): FileMap {
  try {
    return JSON.parse(localStorage.getItem(keyOf(current)) ?? "{}") as FileMap;
  } catch {
    return {};
  }
}

export const browserStorage: Storage = {
  kind: "browser",
  canPickFolder: false,
  canImportZip: false,
  location: () => null,
  pickFolder: async () => true,
  forget: () => {},

  async list() {
    const list = readRecents();
    // Projet créé avant l'écran d'accueil : il rejoint la liste.
    if (!list.some((e) => e.id === LEGACY_ID) && localStorage.getItem(keyOf(LEGACY_ID))) {
      list.push({ id: LEGACY_ID, name: "", openedAt: 0 });
    }
    return byRecency(list);
  },
  select(id) {
    current = id;
  },
  async create() {
    current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return true;
  },
  remember(info) {
    const entry: ProjectEntry = { id: current, name: info.title, ...info, openedAt: Date.now() };
    touchRecent(entry);
  },
  unlist: dropRecent,
  pickTextFile(_label, extensions) {
    // Sélecteur de fichier du navigateur, ouvert par un champ invisible.
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = extensions.map((ext) => `.${ext}`).join(",");
      input.addEventListener("cancel", () => resolve(null));
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, text: await file.text() } : null);
      });
      input.click();
    });
  },

  async readFiles(paths) {
    const all = load();
    return Object.fromEntries(paths.filter((p) => p in all).map((p) => [p, all[p]]));
  },

  async writeMedia(name, data) {
    let binary = "";
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    // Peut dépasser le quota du navigateur pour une grande image : l'erreur remonte, la carte reste sans image.
    localStorage.setItem(mediaKey(), JSON.stringify({ ...loadMedia(), [name]: `data:${mimeOf(name)};base64,${btoa(binary)}` }));
  },
  async mediaUrl(name) {
    return loadMedia()[name] ?? null;
  },
  async readMedia(name) {
    const url = loadMedia()[name];
    if (!url) return null;
    const binary = atob(url.slice(url.indexOf(",") + 1));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  },
  pickFile(_label, extensions) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = extensions.map((ext) => `.${ext}`).join(",");
      input.addEventListener("cancel", () => resolve(null));
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, data: new Uint8Array(await file.arrayBuffer()) } : null);
      });
      input.click();
    });
  },
  pickImage() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
      input.addEventListener("cancel", () => resolve(null));
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        resolve(file ? { name: file.name, data: new Uint8Array(await file.arrayBuffer()) } : null);
      });
      input.click();
    });
  },

  pickImages() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
      input.addEventListener("cancel", () => resolve([]));
      input.addEventListener("change", async () => {
        const files = [...(input.files ?? [])];
        resolve(await Promise.all(files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }))));
      });
      input.click();
    });
  },

  async readAll() {
    const files = load();
    return Object.keys(files).length ? files : null;
  },
  async write(files, removed) {
    const all = { ...load(), ...files };
    for (const path of removed) delete all[path];
    try {
      localStorage.setItem(keyOf(current), JSON.stringify(all));
    } catch (err) {
      console.warn("Sauvegarde navigateur impossible", err);
    }
  },
  async saveAs(file) {
    // Pas d'accès au disque dans un navigateur : le fichier est téléchargé.
    const url = URL.createObjectURL(new Blob([file.data as BlobPart], { type: file.mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
};
