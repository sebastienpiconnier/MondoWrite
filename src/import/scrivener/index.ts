// Import d'un projet Scrivener (docs/plan-import-scrivener.md) : un .scriv zippé, lu depuis une table
// chemin → octets. Trouve le .scrivx (à la racine du zip ou dans le dossier .scriv), lit le classeur, puis les
// textes du format Scrivener 3 (Files/Data/<UUID>/content.rtf, synopsis.txt) ou des formats plus anciens
// (Files/Docs/<ID>.rtf, <ID>_synopsis.txt). Le projet Scrivener n'est jamais modifié.

import type { Project } from "../../types";
import { readBinder } from "./binder";
import { decodeScrivenerName, scrivenerToProject, type ScrivenerDoc, type ScrivenerReport } from "./mapping";
import { rtfParagraphs } from "./rtf";

export interface ScrivenerImport {
  project: Project;
  /** Images et PDF à copier dans medias/ (nom sûr → octets). */
  medias: [string, Uint8Array][];
  report: ScrivenerReport;
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

/** Les fichiers d'un zip utiles à l'import Scrivener : classeur et textes (jamais les index ni les aperçus). */
export const isScrivenerEntry = (path: string) =>
  !ignored(path) && (/\.scrivx$/i.test(path) || /(^|\/)Files\/(version\.txt|Data\/[^/]+\/(content\.rtf|synopsis\.txt|notes\.rtf)|Docs\/[^/]+\.(rtf|txt))$/i.test(path));

const decode = (data: Uint8Array | undefined) => (data ? new TextDecoder("utf-8").decode(data) : "");

/** Lit un projet Scrivener ; null s'il n'y en a pas ou s'il n'a pas de manuscrit lisible. */
export function readScrivener(files: Map<string, Uint8Array>, newId: () => string): ScrivenerImport | null {
  const scrivx = findScrivx(files.keys());
  if (!scrivx) return null;
  const binder = readBinder(decode(files.get(scrivx)));
  if (!binder) return null;
  const root = scrivx.includes("/") ? scrivx.slice(0, scrivx.lastIndexOf("/") + 1) : "";
  const fileName = scrivx.slice(root.length).replace(/\.scrivx$/i, "");
  // Le nom du dossier .scriv est celui que l'auteur voit ; le .scrivx porte le même, sauf renommage.
  const folder = root.replace(/\/$/, "").split("/").pop() ?? "";
  const name = decodeScrivenerName(/\.scriv$/i.test(folder) ? folder.replace(/\.scriv$/i, "") : fileName).trim() || "Scrivener";

  const doc = (uuid: string): ScrivenerDoc => {
    // Scrivener 3 : un dossier par document. Formats d'avant : des fichiers à plat, nommés par l'identifiant.
    const content = files.get(`${root}Files/Data/${uuid}/content.rtf`) ?? files.get(`${root}Files/Docs/${uuid}.rtf`);
    const synopsis = files.get(`${root}Files/Data/${uuid}/synopsis.txt`) ?? files.get(`${root}Files/Docs/${uuid}_synopsis.txt`);
    return { paras: content ? rtfParagraphs(decode(content)) : [], synopsis: decode(synopsis).replace(/\r\n?/g, "\n").trim() };
  };

  const result = scrivenerToProject({ name, binder, doc }, newId);
  if (!result) return null;
  return { project: result.project, medias: [], report: result.report };
}

/** Lit un .zip : un projet Scrivener s'il contient un .scrivx, sinon null (ce n'est pas un projet Scrivener). */
export async function readScrivenerZip(data: Uint8Array, newId: () => string): Promise<ScrivenerImport | null | "not-scrivener"> {
  const { unzipSync } = await import("fflate");
  // Seuls le classeur et les textes sont décompressés : un projet avec sa Recherche pèse vite des dizaines de Mo.
  const entries = unzipSync(data, { filter: (file) => isScrivenerEntry(file.name) });
  const files = new Map(Object.entries(entries));
  if (!findScrivx(files.keys())) return "not-scrivener";
  return readScrivener(files, newId);
}
