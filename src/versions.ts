// Versions d'une scène (1.13.0, `docs/plan-versions-scene.md`) : avant de réécrire, l'auteur garde le texte du
// moment ; il peut ensuite le relire, le comparer et y revenir. Une version est un fichier de
// `versions/<id de la carte>/<AAAA-MM-JJ-HHMMSS>.md` : un petit en-tête (titre facultatif, date, mots, type de
// projet) puis le texte, en Markdown pour un roman, en Fountain pour un scénario (synopsis et corps de la scène,
// sans l'en-tête, qui reste le titre de la carte). Un fichier écrit ne change plus, sauf son titre. Fonctions pures.

import { isCardId } from "./mentions";
import type { ProjectKind } from "./types";

export interface SceneVersion {
  /** Nom du fichier (« 2026-11-02-094107.md »), qui sert d'identifiant. */
  name: string;
  /** Titre donné par l'auteur ("" : aucun). */
  title: string;
  /** Date ISO avec fuseau. */
  date: string;
  words: number;
  kind: ProjectKind;
  /** Texte : Markdown (roman) ou Fountain (scénario). */
  text: string;
}

/** Titre d'une version : une ligne, au plus 120 caractères. */
export const TITLE_MAX = 120;
export const cleanTitle = (title: string) => title.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);

const NAME_RE = /^\d{4}-\d{2}-\d{2}-\d{6}(?:-\d{1,3})?\.md$/;
/** Nom de fichier d'une version : daté, sans chemin, sans « .. ». Tout autre nom est refusé (dossier piégé). */
export const isVersionName = (name: string) => NAME_RE.test(name);
/** Dossier des versions d'une carte : seulement un identifiant de carte valide. */
export const isVersionOwner = (id: string) => isCardId(id);

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

/** Date ISO locale avec son fuseau (« 2026-11-02T09:41:07+01:00 »). */
export function localIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Nom d'une nouvelle version, daté à la seconde ; un suffixe s'il est déjà pris (deux versions la même seconde). */
export function versionName(date: Date, taken: Iterable<string> = []): string {
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const used = new Set(taken);
  if (!used.has(`${base}.md`)) return `${base}.md`;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}.md`)) return `${base}-${i}.md`;
}

/** Contenu du fichier d'une version. */
export function versionFile(v: Omit<SceneVersion, "name">): string {
  const head = [
    "---",
    ...(cleanTitle(v.title) ? [`title: ${JSON.stringify(cleanTitle(v.title))}`] : []),
    `date: ${v.date}`,
    `words: ${Math.max(0, Math.round(v.words))}`,
    ...(v.kind === "scenario" ? ["kind: scenario"] : []),
    "---",
  ];
  return `${head.join("\n")}\n${v.text.replace(/\r\n?/g, "\n").replace(/\n+$/, "")}\n`;
}

/** Version lue sur disque, ou null (nom refusé, en-tête absent). Un fichier sans date prend la date de son nom. */
export function readVersionFile(name: string, raw: string): SceneVersion | null {
  if (!isVersionName(name)) return null;
  const text = raw.replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return null;
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  let title = fields.title ?? "";
  if (title.startsWith('"')) {
    try {
      title = String(JSON.parse(title));
    } catch {
      title = title.replace(/^"|"$/g, "");
    }
  }
  const fromName = name.replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2}).*$/, "$1-$2-$3T$4:$5:$6");
  const words = Number(fields.words);
  return {
    name,
    title: cleanTitle(title),
    date: /^\d{4}-\d{2}-\d{2}T/.test(fields.date ?? "") ? fields.date : fromName,
    words: Number.isFinite(words) && words >= 0 ? Math.round(words) : 0,
    kind: fields.kind === "scenario" ? "scenario" : "roman",
    text: text.slice(m[0].length).replace(/\n+$/, ""),
  };
}

/** Les plus récentes d'abord (le nom est daté). */
export const sortVersions = <T extends { name: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => b.name.localeCompare(a.name));

/** Chemin d'une version dans le projet (relatif à son dossier), ou null si l'identifiant ou le nom sont refusés. */
export function versionPath(cardId: string, name: string): string | null {
  return isVersionOwner(cardId) && isVersionName(name) ? `${SCENE_VERSIONS_DIR}/${cardId}/${name}` : null;
}

/** Dossier des versions des scènes, à la racine du projet (à ne pas confondre avec `markdown/versions/`). */
export const SCENE_VERSIONS_DIR = "versions";

/** Chemin d'un fichier de `versions/` lu dans un .zip : [carte, nom] s'il est sûr, sinon null. */
export function parseVersionPath(path: string): [string, string] | null {
  const m = /^versions\/([^/]+)\/([^/]+)$/.exec(path);
  return m && isVersionOwner(m[1]) && isVersionName(m[2]) ? [m[1], m[2]] : null;
}
