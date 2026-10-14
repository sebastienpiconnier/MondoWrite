// Modifications faites hors de l'app (Obsidian, VS Code, un autre ordinateur par OneDrive) pendant que le
// projet est ouvert. Trois versions d'un même fichier : celle que l'app a lue ou écrite en dernier
// (`known`, lastFiles du store), celle du projet à l'écran (`mine`) et celle du disque (`disk`).
// Règle : ne jamais perdre une version. Fonctions pures.

import { CARDS_DIR, MANUSCRIPT_DIR, META_FILE, SCREENPLAY_FILE, TRASH_DIR, type FileMap } from "./storage/paths";

/** Ce qu'il faut faire de chaque fichier regardé. `null` : le fichier n'existe pas (ou plus). */
export interface DiskDiff {
  /** Changés sur le disque, sans modification ici depuis : on reprend la version du disque. */
  adopt: Record<string, string | null>;
  /** Le disque a déjà la version de l'app (écriture qui vient d'aboutir) : rien à écrire, l'app le note. */
  settled: Record<string, string | null>;
  /** Changés des deux côtés : la version du disque reste en place, celle de l'app est gardée à côté. */
  conflicts: string[];
}

export function diffDisk(paths: Iterable<string>, known: FileMap, mine: FileMap, disk: FileMap): DiskDiff {
  const out: DiskDiff = { adopt: {}, settled: {}, conflicts: [] };
  for (const path of new Set(paths)) {
    const was = known[path] ?? null;
    const now = disk[path] ?? null;
    const ours = mine[path] ?? null;
    if (now === was) continue;
    if (now === ours) out.settled[path] = now;
    else if (ours === was) out.adopt[path] = now;
    else out.conflicts.push(path);
  }
  return out;
}

/** Un conflit en attente du choix de l'auteur. */
export interface FileConflict {
  path: string;
  /** Où la version de l'app a été écrite (null si l'app avait supprimé le fichier). */
  copy: string | null;
  /** Ce qui a été écrit dans la copie, pour la tenir à jour si l'auteur continue d'écrire. */
  mine: string | null;
}

/** De quoi parle un fichier, pour le message : une carte, le texte d'une scène, le scénario, le projet. */
export type ConflictSubject =
  | { kind: "card"; id: string }
  | { kind: "manuscript"; id: string }
  | { kind: "screenplay" }
  | { kind: "project" }
  | { kind: "other" };

export function conflictSubject(path: string): ConflictSubject {
  if (path === META_FILE) return { kind: "project" };
  if (path === SCREENPLAY_FILE) return { kind: "screenplay" };
  const m = /^([^/]+)\/([^/]+)\.md$/.exec(path);
  if (m && (m[1] === CARDS_DIR || m[1] === TRASH_DIR)) return { kind: "card", id: m[2] };
  if (m && m[1] === MANUSCRIPT_DIR) return { kind: "manuscript", id: m[2] };
  return { kind: "other" };
}

/** Applique des changements (null = supprimé) à une liste de fichiers, sans la modifier. */
export function patchFiles(files: FileMap, patch: Record<string, string | null>): FileMap {
  const out = { ...files };
  for (const [path, content] of Object.entries(patch)) {
    if (content === null) delete out[path];
    else out[path] = content;
  }
  return out;
}
