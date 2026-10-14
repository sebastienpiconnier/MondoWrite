// Import d'un fichier depuis l'accueil : choisit le chemin selon son extension (et, pour un .txt, selon ce
// qu'il contient). Manuscrit (.docx, .md, .txt) → projet roman ; scénario (.fountain, .fdx) → projet
// scénario. Null quand le fichier ne contient rien de lisible.

import type { Project } from "../types";
import { importFountain, importScreenplayModel, type ImportOptions } from "../screenplay/import";
import { parse } from "../screenplay/parse";
import { parseFdx } from "../screenplay/fdxImport";
import { bookToProject, chapterize, textParagraphs } from "./manuscript";

export const IMPORT_EXTENSIONS = ["docx", "md", "markdown", "txt", "fountain", "spmd", "fdx"];

const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** Un texte brut est un scénario s'il a au moins deux en-têtes de scène (INT., EXT.) reconnus par Fountain. */
export const looksLikeScreenplay = (text: string) => parse(text).elements.filter((el) => el.type === "sceneHeading").length >= 2;

export async function projectFromFile(file: { name: string; data: Uint8Array }, options: ImportOptions): Promise<Project | null> {
  const ext = extensionOf(file.name);
  const text = () => new TextDecoder("utf-8").decode(file.data);
  let project: Project;
  if (ext === "fdx") {
    const screenplay = parseFdx(text());
    if (!screenplay) return null;
    project = importScreenplayModel(screenplay, options);
  } else if (ext === "fountain" || ext === "spmd" || (ext === "txt" && looksLikeScreenplay(text()))) {
    project = importFountain(text(), options);
  } else if (ext === "docx") {
    // Chargé seulement ici : la lecture du .docx et sa décompression restent hors du paquet de démarrage.
    const { readDocx } = await import("./docx");
    const paras = await readDocx(file.data);
    if (!paras) return null;
    project = bookToProject(chapterize(paras, file.name), { fileName: file.name, newId: options.newId });
  } else {
    project = bookToProject(chapterize(textParagraphs(text(), ext), file.name), { fileName: file.name, newId: options.newId });
  }
  if (project.meta.kind === "scenario") return project.screenplay && project.screenplay.elements.length > 0 ? project : null;
  return project.cards.length > 0 ? project : null;
}
