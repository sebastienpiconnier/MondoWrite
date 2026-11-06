// Sauvegardes automatiques hors du projet (#14) et retour au projet d'un jour donné (#15) : fonctions pures.
//
// Une copie .zip datée du projet (textes, corbeille, versions des scènes) est écrite dans le dossier privé de l'app
// (`$APPDATA/sauvegardes/<clé>/`), jamais dans le dossier du projet : un dossier abîmé, effacé ou mal synchronisé
// n'emporte pas ses sauvegardes. Les images (medias/) n'y sont pas : l'app ne supprime jamais un fichier de medias/,
// on les copie donc une seule fois dans `sauvegardes/<clé>/medias/`, pour toutes les sauvegardes du projet.
// Une sauvegarde ne s'ouvre jamais par-dessus le projet : elle devient un nouveau projet (store, `openBackup`).

import type { ProjectKind } from "./types";

/** Dossier des sauvegardes, dans le dossier privé de l'app. */
export const BACKUPS_DIR = "sauvegardes";
/** Fiche du projet sauvegardé, à côté de ses .zip : de quoi le nommer même si son dossier a disparu. */
export const BACKUP_INFO_FILE = "projet.json";
export const BACKUP_MEDIA_DIR = "medias";

/** Au plus une sauvegarde automatique par tranche de 30 minutes, après un enregistrement réussi. */
export const BACKUP_EVERY_MS = 30 * 60 * 1000;
/** Rotation : les dernières sauvegardes, toutes… */
export const KEEP_LATEST = 5;
/** … puis la dernière de chaque jour, sur ce nombre de jours. */
export const KEEP_DAYS = 30;

/** Clé du dossier de sauvegardes d'un projet : stable, sûre comme nom de dossier, quel que soit son identifiant (chemin). */
export function backupKey(projectId: string): string {
  // FNV-1a sur 2 × 32 bits (deux graines) : assez pour ne jamais confondre deux projets d'un même appareil.
  const hash = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < projectId.length; i++) {
      h ^= projectId.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36).padStart(7, "0");
  };
  return `p${hash(0x811c9dc5)}${hash(0x2b992ddf)}`;
}

export const isBackupKey = (key: string) => /^p[0-9a-z]{14}$/.test(key);

const NAME = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.zip$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** Nom daté d'une sauvegarde, à l'heure de l'appareil : « 2026-11-06-143005.zip ». */
export function backupName(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.zip`;
}

export const isBackupName = (name: string) => NAME.test(name) && backupDate(name) !== null;

/** Date d'une sauvegarde lue dans son nom, ou null. */
export function backupDate(name: string): Date | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  return date.getMonth() === mo - 1 && date.getDate() === d && h < 24 && mi < 60 && s < 60 ? date : null;
}

/** Les sauvegardes, la plus récente d'abord (les noms datés se trient comme les dates). */
export const sortBackups = (names: string[]) => names.filter(isBackupName).sort().reverse();

/**
 * Sauvegardes à supprimer : on garde les `KEEP_LATEST` dernières, puis la dernière de chaque jour des `KEEP_DAYS`
 * derniers jours. Un nom qui n'est pas une sauvegarde n'est jamais rendu (il n'est pas à nous).
 */
export function backupsToRemove(names: string[], now: Date): string[] {
  const sorted = sortBackups(names);
  const keep = new Set(sorted.slice(0, KEEP_LATEST));
  const oldest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (KEEP_DAYS - 1)).getTime();
  const days = new Set<string>();
  for (const name of sorted) {
    const day = name.slice(0, 10);
    if (days.has(day)) continue;
    days.add(day);
    if ((backupDate(name)?.getTime() ?? 0) >= oldest) keep.add(name);
  }
  return sorted.filter((name) => !keep.has(name));
}

/** Faut-il une nouvelle sauvegarde automatique ? (dernière sauvegarde connue, ou aucune) */
export function backupDue(last: Date | null, now: Date): boolean {
  return !last || now.getTime() - last.getTime() >= BACKUP_EVERY_MS || now.getTime() < last.getTime();
}

/** Ce qu'on sait du projet sauvegardé (fichier projet.json). */
export interface BackupInfo {
  title: string;
  kind: ProjectKind;
}

export function readBackupInfo(text: string | null | undefined): BackupInfo | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { title?: unknown; kind?: unknown };
    return { title: typeof raw.title === "string" ? raw.title.slice(0, 200) : "", kind: raw.kind === "scenario" ? "scenario" : "roman" };
  } catch {
    return null;
  }
}

export const backupInfoFile = (info: BackupInfo) => `${JSON.stringify({ title: info.title, kind: info.kind }, null, 2)}\n`;

/** Images citées par les cartes d'un projet (image, PDF d'une carte Document, galerie) : celles à reprendre d'une sauvegarde. */
export function mediaNamesOf(cards: { image?: string; fichier?: string; images?: string[] }[]): string[] {
  const names = new Set<string>();
  for (const c of cards) for (const name of [c.image, c.fichier, ...(c.images ?? [])]) if (name) names.add(name);
  return [...names];
}
