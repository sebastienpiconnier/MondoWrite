// Import d'un projet Scrivener (docs/plan-import-scrivener.md) : un .scriv zippé, lu depuis une table
// chemin → octets. Trouve le .scrivx (à la racine du zip ou dans le dossier .scriv), lit le classeur, puis les
// textes du format Scrivener 3 (Files/Data/<UUID>/content.rtf, synopsis.txt) ou des formats plus anciens
// (Files/Docs/<ID>.rtf, <ID>_synopsis.txt). Le projet Scrivener n'est jamais modifié.

import type { Project } from "../../types";
import { readBinder } from "./binder";
import { readInspectorNotes } from "./comments";
import { decodeScrivenerName, scrivenerToProject, type ScrivenerDoc, type ScrivenerOptions, type ScrivenerReport, type ScrivenerSnapshot, type ScrivenerSource } from "./mapping";
import { rtfDocument, rtfParagraphs } from "./rtf";

export { scrivenerFolders } from "./mapping";
export type { ScrivenerLabels, ScrivenerReport, ScrivenerSource } from "./mapping";

export interface ScrivenerImport {
  project: Project;
  /** Images et PDF à copier dans medias/ (nom sûr → octets). */
  medias: [string, Uint8Array][];
  report: ScrivenerReport;
  /** Versions des scènes tirées des instantanés : carte, nom du fichier, contenu. */
  versions: [string, string, string][];
}

/** Fichier d'un zip à ignorer : dossiers cachés, __MACOSX, chemins piégés. */
const ignored = (path: string) => path.split("/").some((part) => part.startsWith(".") || part === "__MACOSX" || part === "..") || path.startsWith("/");

/** Le .scrivx d'un ensemble de fichiers (le moins profond), ou rien. */
export function findScrivx(paths: Iterable<string>): string | null {
  let best: string | null = null;
  for (const path of paths) {
    if (ignored(path) || !/\.scrivx$/i.test(path)) continue;
    if (best === null || path.split("/").length < best.split("/").length) best = path;
  }
  return best;
}

/** Fichiers d'un document que MondoWrite sait reprendre : texte, synopsis, notes, commentaires, PDF et images. */
const DATA_FILE = /^(content\.(rtf|comments|pdf|png|jpe?g|gif|webp)|synopsis\.txt|notes\.rtf)$/i;
const MEDIA_EXT = /^(pdf|png|jpe?g|gif|webp)$/i;

/** Les fichiers d'un zip utiles à l'import Scrivener : classeur, textes et médias (jamais les index ni les aperçus). */
export const isScrivenerEntry = (path: string) => {
  if (ignored(path)) return false;
  if (/\.scrivx$/i.test(path)) return true;
  const data = path.match(/(?:^|\/)Files\/Data\/[^/]+\/([^/]+)$/);
  if (data) return DATA_FILE.test(data[1]);
  // Instantanés (Snapshots/<UUID>.snapshots/index.xml et un .rtf par instantané) et historique d'écriture (lot 3).
  if (/(^|\/)Snapshots\/[^/]+\.snapshots\/(index\.xml|[^/]+\.rtf)$/i.test(path)) return true;
  return /(^|\/)Files\/(version\.txt|writing\.history|Docs\/[^/]+\.(rtf|txt|comments|pdf|png|jpe?g|gif|webp))$/i.test(path);
};

/** Texte d'un élément XML simple, entités décodées. */
const xmlText = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

/** « 2025-06-01-11-36-07+0200 » (nom d'un instantané) ou « 2025-06-01 11:36:07 +0200 » (index) → date ISO avec fuseau. */
export function snapshotDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ -](\d{2})[-:](\d{2})[-:](\d{2}) ?([+-])(\d{2}):?(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7]}${m[8]}:${m[9]}` : null;
}

const decode = (data: Uint8Array | undefined) => (data ? new TextDecoder("utf-8").decode(data) : "");

/** Le projet Scrivener lu (classeur et accès aux documents), avant le choix des dossiers ; null s'il n'y en a pas. */
export function readScrivenerSource(files: Map<string, Uint8Array>): ScrivenerSource | null {
  const scrivx = findScrivx(files.keys());
  if (!scrivx) return null;
  const binder = readBinder(decode(files.get(scrivx)));
  // Scrivener 2 (Mac) et 1 (Windows) : classeur en version 1.x. Non repris (décidé le 2 novembre 2026) : Scrivener 3
  // le convertit en l'ouvrant, et l'auteur reçoit un message qui le lui dit.
  const major = Number.parseInt(binder?.version ?? "", 10);
  if (binder && Number.isFinite(major) && major < 2) throw new Error("scrivener-old");
  if (!binder || !binder.items.some((i) => i.type === "DraftFolder")) return null;
  const root = scrivx.includes("/") ? scrivx.slice(0, scrivx.lastIndexOf("/") + 1) : "";
  const fileName = scrivx.slice(root.length).replace(/\.scrivx$/i, "");
  // Le nom du dossier .scriv est celui que l'auteur voit ; le .scrivx porte le même, sauf renommage.
  const folder = root.replace(/\/$/, "").split("/").pop() ?? "";
  const name = decodeScrivenerName(/\.scriv$/i.test(folder) ? folder.replace(/\.scriv$/i, "") : fileName).trim() || "Scrivener";
  // Noms de fichiers sans casse : les identifiants du classeur et les dossiers ne l'écrivent pas toujours pareil.
  const byLower = new Map<string, Uint8Array>();
  for (const [path, data] of files) if (path.startsWith(root)) byLower.set(path.slice(root.length).toLowerCase(), data);
  const get = (...paths: string[]) => {
    for (const p of paths) {
      const data = byLower.get(p.toLowerCase());
      if (data) return data;
    }
    return undefined;
  };

  const doc = (uuid: string): ScrivenerDoc => {
    // Scrivener 3 : un dossier par document. Formats d'avant : des fichiers à plat, nommés par l'identifiant.
    const content = get(`Files/Data/${uuid}/content.rtf`, `Files/Docs/${uuid}.rtf`);
    const text = content ? rtfDocument(decode(content)) : { paras: [], images: [], inline: [] };
    const notes = get(`Files/Data/${uuid}/notes.rtf`, `Files/Docs/${uuid}_notes.rtf`);
    const comments = get(`Files/Data/${uuid}/content.comments`, `Files/Docs/${uuid}.comments`);
    let media: ScrivenerDoc["media"] = null;
    for (const [path, data] of byLower) {
      const m = path.match(/^files\/(?:data\/([^/]+)\/content|docs\/([^/.]+))\.([a-z0-9]+)$/);
      if (m && (m[1] ?? m[2]) === uuid.toLowerCase() && MEDIA_EXT.test(m[3])) {
        media = { ext: m[3] === "jpeg" ? "jpg" : m[3], data };
        break;
      }
    }
    return {
      paras: text.paras,
      images: text.images,
      inline: text.inline,
      synopsis: decode(get(`Files/Data/${uuid}/synopsis.txt`, `Files/Docs/${uuid}_synopsis.txt`)).replace(/\r\n?/g, "\n").trim(),
      notes: notes ? rtfParagraphs(decode(notes)) : [],
      comments: comments ? readInspectorNotes(decode(comments)) : new Map(),
      media,
    };
  };
  /** Instantanés d'un document, du plus ancien au plus récent : titre (index.xml), date, paragraphes. */
  const snapshots = (uuid: string): ScrivenerSnapshot[] => {
    const dir = `snapshots/${uuid.toLowerCase()}.snapshots/`;
    const titles = new Map<string, string>();
    const index = decode(byLower.get(`${dir}index.xml`));
    for (const m of index.matchAll(/<Snapshot\b[^>]*>([\s\S]*?)<\/Snapshot>/g)) {
      const date = snapshotDate(xmlText(m[1].match(/<Date>([\s\S]*?)<\/Date>/)?.[1] ?? ""));
      if (date) titles.set(date, xmlText(m[1].match(/<Title>([\s\S]*?)<\/Title>/)?.[1] ?? ""));
    }
    const out: ScrivenerSnapshot[] = [];
    for (const [path, data] of byLower) {
      if (!path.startsWith(dir) || !path.endsWith(".rtf")) continue;
      const date = snapshotDate(path.slice(dir.length, -4));
      if (!date) continue;
      const text = rtfDocument(decode(data));
      out.push({ title: titles.get(date) ?? "", date, paras: text.paras, inline: text.inline });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  };
  const history = decode(get("Files/writing.history"));
  return { name, binder, doc, snapshots, ...(history ? { history } : {}) };
}

/** Lit et convertit un projet Scrivener ; null s'il n'y en a pas ou s'il n'a pas de manuscrit lisible. */
export function readScrivener(files: Map<string, Uint8Array>, options: ScrivenerOptions | (() => string)): ScrivenerImport | null {
  const source = readScrivenerSource(files);
  return source ? buildScrivener(source, options) : null;
}

/** Projet MondoWrite tiré d'un projet Scrivener lu, une fois les dossiers choisis. */
export function buildScrivener(source: ScrivenerSource, options: ScrivenerOptions | (() => string)): ScrivenerImport | null {
  const result = scrivenerToProject(source, options);
  return result && result.project.cards.length > 0 ? result : null;
}

/** Lit un .zip : le projet Scrivener qu'il contient, null s'il est illisible, « not-scrivener » sans .scrivx. */
export async function readScrivenerZip(data: Uint8Array): Promise<ScrivenerSource | null | "not-scrivener"> {
  const { unzipSync } = await import("fflate");
  // Seuls le classeur, les textes et les médias sont décompressés (jamais les index ni les aperçus).
  const entries = unzipSync(data, { filter: (file) => isScrivenerEntry(file.name) });
  const files = new Map(Object.entries(entries));
  if (!findScrivx(files.keys())) return "not-scrivener";
  return readScrivenerSource(files);
}
