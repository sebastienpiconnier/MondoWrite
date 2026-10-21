// Stockage sur disque via Tauri.
// - Ordinateur : chaque projet est un dossier choisi par l'auteur (la liste des projets ouverts est mémorisée).
// - Mobile : iOS et Android n'offrent pas de vrai sélecteur de dossier, chaque projet a son dossier dans
//   projets/ : le conteneur iCloud de l'app sur iPhone et iPad (synchronisé avec le Mac), sinon Documents.
// Dans les deux cas : cosmos.json + cartes/*.md (+ scenario.fountain), exactement le même format.

import { open, save } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, readDir, readFile, readTextFile, remove, rename, watch, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { appDataDir, documentDir, homeDir, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import type { Storage } from "./index";
import { COPIES_DIR, MEDIA_DIR, META_FILE, SCREENPLAY_FILE, TEXT_DIRS, VERSIONS_DIR, isConflictCopy, type FileMap } from "./paths";
import { IMAGE_EXTENSIONS, mimeOf } from "../media";
import { isMobileOS } from "../platform";
import { getT } from "../i18n";
import { MISSING_FOLDER } from "../saveErrors";
import { byRecency, dropRecent, readRecents, touchRecent } from "./recents";
import { LOCK_DIR } from "../lock";

/** D'avant l'écran d'accueil : le seul dossier mémorisé. Il rejoint la liste des projets. */
const LAST_FOLDER_KEY = "cosmos:dernier-dossier";
const MOBILE_DIR = "projets";
const mobile = isMobileOS();

/** Projet sélectionné : chemin du dossier (ordinateur) ou nom du dossier privé (mobile). */
let current: string | null = null;

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** iCloud Drive (iPhone et iPad) : le choix de l'auteur, activé par défaut dès que le conteneur iCloud existe. */
const ICLOUD_KEY = "cosmos:icloud";
let icloudDocs: string | null | undefined;

/** Dossier Documents du conteneur iCloud de l'app, ou null (hors iOS, session iCloud absente, droit non accordé). */
async function icloudDir(): Promise<string | null> {
  if (!mobile) return null;
  if (icloudDocs === undefined) {
    try {
      icloudDocs = await invoke<string | null>("icloud_container");
    } catch {
      icloudDocs = null;
    }
  }
  return icloudDocs;
}

function icloudWanted() {
  try {
    return localStorage.getItem(ICLOUD_KEY) !== "0";
  } catch {
    return true;
  }
}

async function activeIcloud() {
  return icloudWanted() ? icloudDir() : null;
}

/**
 * Dossier cloud (iPhone et iPad) : l'auteur choisit dans l'app Fichiers un dossier de OneDrive, Dropbox, Drive ou iCloud Drive.
 * On garde son nom et un signet (accès durable accordé par iOS) ; ses sous-dossiers sont les projets.
 */
const CLOUD_KEY = "cosmos:dossier-cloud";
/** Identifiant du projet quand le dossier cloud choisi est lui-même un projet (il contient cosmos.json). */
const CLOUD_SELF = "@dossier";
interface CloudFolder {
  path: string;
  bookmark: string;
}
let cloudCache: { path: string; name: string } | null | undefined;

function savedCloud(): { name: string; bookmark: string } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOUD_KEY) ?? "null") as { name?: unknown; bookmark?: unknown } | null;
    return raw && typeof raw.name === "string" && typeof raw.bookmark === "string" ? { name: raw.name, bookmark: raw.bookmark } : null;
  } catch {
    return null;
  }
}

/** Chemin du dossier cloud choisi (accès rouvert par son signet), ou null s'il n'y en a pas ou s'il n'est plus accessible. */
async function cloudRoot(): Promise<string | null> {
  if (!mobile) return null;
  if (cloudCache === undefined) {
    const saved = savedCloud();
    cloudCache = null;
    if (saved) {
      try {
        const folder = await invoke<CloudFolder | null>("cloud_restore", { bookmark: saved.bookmark });
        if (folder) {
          cloudCache = { path: folder.path, name: saved.name };
          localStorage.setItem(CLOUD_KEY, JSON.stringify({ name: saved.name, bookmark: folder.bookmark }));
        }
      } catch {
        cloudCache = null;
      }
    }
  }
  return cloudCache?.path ?? null;
}

/**
 * Mobile : les projets vivent dans le conteneur iCloud de l'app (synchronisés, visibles dans Fichiers sous
 * iCloud Drive > MondoWrite) ou, sans iCloud, dans Documents/projets (Fichiers, « Sur mon iPad »).
 */
async function mobileRoot() {
  const chosen = await cloudRoot();
  if (chosen) return chosen;
  const cloud = await activeIcloud();
  return join(cloud ?? (await documentDir()), MOBILE_DIR);
}

/** Les fichiers iCloud pas encore téléchargés sont des repères « .nom.icloud » : on demande leur téléchargement. */
async function ensureDownloaded(dir: string) {
  if ((await cloudRoot()) || !(await activeIcloud())) return;
  try {
    for (let i = 0; i < 12; i++) {
      const pending = await invoke<number>("icloud_download", { dir });
      if (!pending) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch {
    // Le téléchargement continue en arrière-plan : on lit ce qui est déjà là.
  }
}

/** Anciens emplacements (espace privé, Documents quand iCloud est actif) : on déplace les projets vers le dossier actuel. */
async function migratePrivateProjects() {
  try {
    if (await cloudRoot()) return;
    const root = await mobileRoot();
    const sources = [await join(await appDataDir(), MOBILE_DIR), await join(await documentDir(), MOBILE_DIR)];
    for (const old of sources) {
      if (old === root || !(await exists(old))) continue;
      await mkdir(root, { recursive: true });
      for (const entry of await readDir(old)) {
        if (!entry.isDirectory) continue;
        const target = await join(root, entry.name);
        if (!(await exists(target))) await rename(await join(old, entry.name), target);
      }
    }
  } catch {
    // Impossible de déplacer : les projets restent à leur place d'origine.
  }
}

async function projectFolder(): Promise<string | null> {
  if (!current) return null;
  if (!mobile) return current;
  return current === CLOUD_SELF ? mobileRoot() : join(await mobileRoot(), current);
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

/**
 * Mac : le conteneur iCloud de l'app (le même que sur iPhone et iPad) est proposé en premier dans le sélecteur de dossier,
 * puis un dossier Dropbox. Un projet placé là se synchronise avec les autres appareils. Sans l'un ni l'autre : le choix du système.
 */
async function syncFolderHint(): Promise<string | undefined> {
  try {
    const home = await homeDir();
    for (const rel of [`${MAC_ICLOUD}/${MOBILE_DIR}`, MAC_ICLOUD, "Library/CloudStorage/Dropbox", "Dropbox"]) {
      const path = await join(home, ...rel.split("/"));
      if (await exists(path)) return path;
    }
  } catch {
    /* pas de dossier proposé */
  }
  return undefined;
}

/**
 * Ordinateur : un dossier cloud (iCloud Drive, Dropbox, OneDrive…) choisi une fois. Un nouveau projet y est créé tout seul,
 * dans un sous-dossier, et ses sous-dossiers qui contiennent un projet apparaissent à l'accueil. Le service de synchronisation
 * du système fait le reste. (Le choix du dossier reste autorisé d'un lancement à l'autre par le plugin persisted-scope.)
 */
const DESKTOP_CLOUD_KEY = "cosmos:dossier-cloud-pc";

/** Projets iCloud vus du Mac : le dossier où l'iPhone et l'iPad les rangent (conteneur de l'app, Documents/projets). */
const MAC_ICLOUD = "Library/Mobile Documents/iCloud~app~cosmos~ecriture/Documents";
const MAC_ICLOUD_OFF = "cosmos:icloud-pc-off";
const MAC_ICLOUD_NAME = "iCloud Drive";

async function macIcloudDocs() {
  return join(await homeDir(), ...MAC_ICLOUD.split("/"));
}

async function macIcloudProjects() {
  return join(await macIcloudDocs(), MOBILE_DIR);
}

/** Chemin sans « \\ » ni « / » final, pour comparer deux chemins. */
const plainPath = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");

/** Le dossier cloud de l'ordinateur est celui des projets iCloud (case cochée, ou dossier choisi à la main). */
function macIcloudOn() {
  const path = desktopCloud()?.path;
  if (!path) return false;
  const plain = plainPath(path);
  return plain.endsWith(MAC_ICLOUD) || plain.endsWith(`${MAC_ICLOUD}/${MOBILE_DIR}`);
}

function setDesktopCloud(path: string, name: string) {
  localStorage.setItem(DESKTOP_CLOUD_KEY, JSON.stringify({ path, name }));
}

/**
 * Mac : si le conteneur iCloud de l'app existe (iCloud Drive actif, un autre appareil l'a créé) et que l'auteur n'a pas
 * choisi autre chose ni quitté la synchronisation, ses projets deviennent le dossier cloud par défaut : ceux de l'iPhone
 * et de l'iPad apparaissent à l'accueil, et un nouveau projet y est créé.
 */
async function adoptMacIcloud() {
  if (mobile) return;
  try {
    const projects = await macIcloudProjects();
    // Dossier Documents du conteneur (premier essai, ou choisi à la main) : les projets de l’iPhone sont dans projets/.
    const chosen = desktopCloud()?.path;
    if (chosen && plainPath(chosen).endsWith(MAC_ICLOUD)) setDesktopCloud(projects, MAC_ICLOUD_NAME);
    if (desktopCloud() || localStorage.getItem(MAC_ICLOUD_OFF) === "1") return;
    if (!(await exists(await macIcloudDocs()))) return;
    await mkdir(projects, { recursive: true });
    setDesktopCloud(projects, MAC_ICLOUD_NAME);
  } catch {
    /* pas de conteneur iCloud sur cet ordinateur */
  }
}

function desktopCloud(): { path: string; name: string } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DESKTOP_CLOUD_KEY) ?? "null") as { path?: unknown; name?: unknown } | null;
    return raw && typeof raw.path === "string" && typeof raw.name === "string" ? { path: raw.path, name: raw.name } : null;
  } catch {
    return null;
  }
}

/** Noms que Windows refuse pour un dossier (CON, NUL, COM1…), quelle que soit la casse. */
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Nom de dossier sûr, tiré d'un titre : ni séparateur, ni point, ni nom réservé de Windows. */
const folderSlug = (title: string) => {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 _-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
    .trim();
  return RESERVED.test(slug) ? `${slug} projet` : slug;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const tauriStorage: Storage = {
  locks: {
    async read() {
      const dir = await projectFolder();
      const out: FileMap = {};
      if (!dir) return out;
      const folder = await join(dir, LOCK_DIR);
      if (!(await exists(folder))) return out;
      for (const entry of await readDir(folder)) {
        if (entry.isFile && entry.name.endsWith(".json")) out[entry.name] = await readTextFile(await join(folder, entry.name));
      }
      return out;
    },
    async write(path, text) {
      const dir = await projectFolder();
      if (!dir || !(await exists(dir))) return;
      await mkdir(await join(dir, LOCK_DIR), { recursive: true });
      await writeTextFile(await join(dir, ...path.split("/")), text);
    },
    async remove(path) {
      const dir = await projectFolder();
      if (!dir) return;
      const full = await join(dir, ...path.split("/"));
      if (await exists(full)) await remove(full);
    },
  },
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
  icloud: !mobile
    ? {
        // Mac : la case des Réglages pointe le dossier cloud sur les projets iCloud (ou le quitte).
        available: async () => {
          try {
            return await exists(await macIcloudDocs());
          } catch {
            return false;
          }
        },
        enabled: () => macIcloudOn(),
        async set(on) {
          try {
            if (on) {
              const projects = await macIcloudProjects();
              await mkdir(projects, { recursive: true });
              setDesktopCloud(projects, MAC_ICLOUD_NAME);
              localStorage.removeItem(MAC_ICLOUD_OFF);
            } else {
              if (macIcloudOn()) localStorage.removeItem(DESKTOP_CLOUD_KEY);
              localStorage.setItem(MAC_ICLOUD_OFF, "1");
            }
          } catch {
            /* le choix vaut pour la session */
          }
        },
      }
    : {
        available: async () => (await icloudDir()) !== null,
        enabled: () => icloudWanted(),
        async set(on) {
          try {
            localStorage.setItem(ICLOUD_KEY, on ? "1" : "0");
          } catch {
            /* le choix vaut pour la session */
          }
          if (on) await migratePrivateProjects();
        },
      },
  canPickFolder: !mobile,
  canImportZip: true,
  cloud: !mobile
    ? {
        // Le dossier des projets iCloud s'appelle « projets » : on l'annonce comme iCloud Drive.
        name: () => (macIcloudOn() ? MAC_ICLOUD_NAME : (desktopCloud()?.name ?? null)),
        async pick() {
          const chosen = await open({ directory: true, recursive: true, title: getT().dialog.pickCloudFolder, defaultPath: await syncFolderHint() });
          if (typeof chosen !== "string") return false;
          localStorage.setItem(DESKTOP_CLOUD_KEY, JSON.stringify({ path: chosen, name: baseName(chosen) }));
          try {
            localStorage.removeItem(MAC_ICLOUD_OFF);
          } catch {
            /* sans effet */
          }
          return true;
        },
        clear() {
          try {
            localStorage.removeItem(DESKTOP_CLOUD_KEY);
            localStorage.setItem(MAC_ICLOUD_OFF, "1");
          } catch {
            /* rien à effacer */
          }
        },
      }
    : {
        name: () => cloudCache?.name ?? savedCloud()?.name ?? null,
        async pick() {
          let folder: CloudFolder | null = null;
          try {
            folder = await invoke<CloudFolder | null>("cloud_pick_folder");
          } catch (err) {
            console.error(err);
          }
          if (!folder) return false;
          const name = baseName(folder.path);
          localStorage.setItem(CLOUD_KEY, JSON.stringify({ name, bookmark: folder.bookmark }));
          cloudCache = { path: folder.path, name };
          current = null;
          return true;
        },
        clear() {
          try {
            localStorage.removeItem(CLOUD_KEY);
          } catch {
            /* rien à effacer */
          }
          cloudCache = null;
          current = null;
        },
      },
  location: () => (mobile || !current ? null : baseName(current)),

  async pickFolder() {
    if (mobile) return true;
    // recursive : sans lui, Tauri n'autorise que les fichiers placés directement dans le dossier,
    // et l'écriture des cartes (sous-dossier cartes/) est refusée hors du dossier personnel.
    const chosen = await open({ directory: true, recursive: true, title: getT().dialog.pickFolder, defaultPath: await syncFolderHint() });
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
      await adoptMacIcloud();
      const list = readRecents();
      // Dossier cloud : ses sous-dossiers qui contiennent un projet sont proposés, même jamais ouverts ici.
      const cloud = desktopCloud();
      if (cloud) {
        try {
          for (const entry of await readDir(cloud.path)) {
            if (!entry.isDirectory || entry.name.startsWith(".")) continue;
            const path = await join(cloud.path, entry.name);
            if (list.some((e) => e.id === path)) continue;
            if (await exists(await join(path, META_FILE))) list.push({ id: path, name: entry.name, openedAt: 0 });
          }
          // Un projet du dossier cloud supprimé sur un autre appareil quitte la liste (pas ceux d'un disque débranché ailleurs).
          const root = plainPath(cloud.path);
          for (const e of [...list]) {
            if (plainPath(e.id).startsWith(`${root}/`) && !(await exists(e.id).catch(() => true))) {
              dropRecent(e.id);
              list.splice(list.indexOf(e), 1);
            }
          }
        } catch {
          // Dossier cloud absent ou pas encore synchronisé : on garde la liste mémorisée.
        }
      }
      return byRecency(list);
    }
    // Mobile : la liste mémorisée, complétée par les dossiers présents (réinstallation, ancien projet unique).
    const list = readRecents();
    await migratePrivateProjects();
    const dir = await mobileRoot();
    // Dossier cloud choisi : seuls ses projets comptent, pas les anciens projets de l'app.
    const cloud = await cloudRoot();
    if (cloud) {
      list.splice(0, list.length, ...list.filter((e) => e.id === CLOUD_SELF || (e.cloud ?? false)));
      if (await exists(await join(dir, META_FILE))) {
        if (!list.some((e) => e.id === CLOUD_SELF)) list.push({ id: CLOUD_SELF, name: cloudCache?.name ?? CLOUD_SELF, openedAt: 0, cloud: true });
      }
    } else {
      list.splice(0, list.length, ...list.filter((e) => e.id !== CLOUD_SELF && !e.cloud));
    }
    if (await exists(dir)) {
      for (const entry of await readDir(dir)) {
        if (entry.isDirectory && !entry.name.startsWith(".") && !list.some((e) => e.id === entry.name)) list.push({ id: entry.name, name: entry.name, openedAt: 0, ...(cloud ? { cloud: true } : {}) });
      }
    }
    // Un projet mémorisé dont le dossier a disparu (supprimé sur un autre appareil, ancien emplacement) quitte la liste.
    const present: typeof list = [];
    for (const e of list) {
      const path = e.id === CLOUD_SELF ? dir : await join(dir, e.id);
      if (await exists(path).catch(() => true)) present.push(e);
      else dropRecent(e.id);
    }
    return byRecency(present);
  },
  select(id) {
    current = id;
  },
  async create(name, options) {
    if (!mobile) {
      await adoptMacIcloud();
      const cloud = desktopCloud();
      let root = cloud && (await exists(cloud.path)) ? cloud.path : null;
      // Sans dossier cloud, un projet créé d'office (projet d'exemple) va dans Documents/MondoWrite, sans dialogue.
      if (!root && options?.auto) root = await join(await documentDir(), "MondoWrite");
      if (!root) return this.pickFolder();
      // Le projet y naît dans un sous-dossier qui porte son titre.
      const base = folderSlug(name ?? "") || "Projet";
      let path = await join(root, base);
      for (let i = 2; await exists(path); i++) path = await join(root, `${base} ${i}`);
      await mkdir(path, { recursive: true });
      current = path;
      return true;
    }
    // Le dossier porte le titre du roman ou du scénario ; un doublon reçoit un numéro.
    const root = await mobileRoot();
    const base = folderSlug(name ?? "");
    if (!base) {
      current = `projet-${Date.now().toString(36)}`;
      return true;
    }
    let id = base;
    for (let i = 2; await exists(await join(root, id)); i++) id = `${base} ${i}`;
    current = id;
    return true;
  },
  remember(info) {
    if (!current) return;
    touchRecent({ id: current, name: mobile ? info.title || current : baseName(current), ...info, openedAt: Date.now(), ...(mobile && cloudCache ? { cloud: true } : {}) });
  },
  unlist: dropRecent,
  deleteProject: mobile
    ? async (id) => {
        // Le dossier cloud choisi lui-même n'est jamais effacé : on le quitte depuis l'accueil.
        if (id === CLOUD_SELF || id.includes("/") || id.includes("\\") || id.startsWith(".")) return;
        const path = await join(await mobileRoot(), id);
        if (await exists(path)) await remove(path, { recursive: true });
        dropRecent(id);
        if (current === id) current = null;
      }
    : undefined,
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
    await ensureDownloaded(dir);
    const metaPath = await join(dir, META_FILE);
    if (!(await exists(metaPath))) return null;
    const files: FileMap = { [META_FILE]: await readTextFile(metaPath) };
    // Cartes et manuscrit : un fichier Markdown par carte, dans chacun de ces dossiers.
    for (const name of TEXT_DIRS) {
      const folder = await join(dir, name);
      if (!(await exists(folder))) continue;
      for (const entry of await readDir(folder)) {
        if (entry.isFile && entry.name.endsWith(".md") && !isConflictCopy(entry.name)) {
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
    // Dossier déplacé, renommé ou disque débranché : on ne le recrée pas à moitié (mkdir le ferait), on le signale.
    // Sur mobile, le dossier privé d'un nouveau projet est créé ici.
    if (mobile) await mkdir(dir, { recursive: true });
    else if (!(await exists(dir))) throw new Error(MISSING_FOLDER);
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

  async readFiles(paths) {
    const dir = await projectFolder();
    if (!dir) return {};
    const out: FileMap = {};
    for (const path of paths) {
      const full = await join(dir, ...path.split("/"));
      if (await exists(full)) out[path] = await readTextFile(full);
    }
    return out;
  },

  async watch(onChange) {
    const dir = await projectFolder();
    if (!dir) return () => {};
    // Mobile : pas de surveillance du système de fichiers ; avec iCloud, on relit régulièrement les changements venus d'un autre appareil.
    if (mobile) {
      if (!(await cloudRoot()) && !(await activeIcloud())) return () => {};
      const timer = setInterval(() => {
        if (document.visibilityState === "visible") onChange();
      }, 20000);
      return () => clearInterval(timer);
    }
    // Délai anti-rebond : un enregistrement (ou une synchronisation OneDrive) écrit plusieurs fichiers d'affilée.
    return watch(
      dir,
      (event) => {
        // markdown/ (copies réécrites à chaque enregistrement), medias/ et verrous/ (battement) ne sont jamais relus.
        const paths = event.paths ?? [];
        const relevant = paths.length === 0 || paths.some((p) => !/[\\/](markdown|medias|verrous)([\\/]|$)/.test(p.slice(dir.length)));
        if (relevant) onChange();
      },
      { recursive: true, delayMs: 600 },
    );
  },

  async saveAs(file, label) {
    // Dialogue « Enregistrer sous » du système : le chemin choisi est autorisé en écriture par Tauri.
    const path = await save({ defaultPath: file.name, filters: [{ name: label, extensions: [file.extension] }] });
    if (!path) return false;
    await writeFile(path, file.data);
    return true;
  },
};
