// Import d'un fichier depuis l'accueil : choisit le chemin selon son extension (et, pour un .txt ou un .pdf,
// selon ce qu'il contient). Manuscrit (.docx, .md, .txt, .pdf) → projet roman ; scénario (.fountain, .fdx, .pdf)
// → projet scénario ; projet Scrivener zippé (.zip qui contient un .scrivx) → projet roman avec ses médias.
// Null quand le fichier ne contient rien de lisible.

import type { Project } from "../types";
import type { ScrivenerSource } from "./scrivener/mapping";
import type { StoryReport } from "../interactive/storyImport";
import { importFountain, importScreenplayModel, type ImportOptions } from "../screenplay/import";
import { parse } from "../screenplay/parse";
import { parseFdx, parseFdxRevisions } from "../screenplay/fdxImport";
import { bookToProject, chapterize, textParagraphs } from "./manuscript";

export const IMPORT_EXTENSIONS = ["docx", "md", "markdown", "txt", "fountain", "spmd", "fdx", "pdf", "zip"];

/** Histoires interactives (#84, lot 9) : Twee 3 (Twine) et Ink, seulement quand le roman interactif est proposé. */
export const STORY_EXTENSIONS = ["twee", "tw", "ink"];

/** Extensions proposées au choix du fichier. */
export const importExtensions = (interactive: boolean) => (interactive ? [...IMPORT_EXTENSIONS, ...STORY_EXTENSIONS] : IMPORT_EXTENSIONS);

const extensionOf = (name: string) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** Un texte brut est un scénario s'il a au moins deux en-têtes de scène (INT., EXT.) reconnus par Fountain. */
export const looksLikeScreenplay = (text: string) => parse(text).elements.filter((el) => el.type === "sceneHeading").length >= 2;

/**
 * Ce qu'un fichier importé donne : un projet et ses médias ; un projet Scrivener lu, dont l'auteur choisit encore
 * les dossiers (`buildScrivener` le convertit) ; rien de lisible ; ou un .zip qui n'est pas de Scrivener.
 */
export type ImportOutcome = { project: Project; medias: [string, Uint8Array][]; story?: StoryReport } | { scrivener: ScrivenerSource } | null | "project-zip";

/**
 * Import complet : comme `projectFromFile`, plus les médias à copier dans medias/. Un .zip qui contient un projet
 * Scrivener est lu ; un autre .zip est sans doute un projet MondoWrite exporté (« project-zip »), que l'appelant
 * ouvre par son propre chemin.
 */
export async function importFromFile(file: { name: string; data: Uint8Array }, options: ImportOptions): Promise<ImportOutcome> {
  if (extensionOf(file.name) === "zip") {
    // Chargé seulement ici : le lecteur RTF et celui du classeur restent hors du paquet de démarrage.
    const { readScrivenerZip } = await import("./scrivener");
    const read = await readScrivenerZip(file.data);
    if (read === "not-scrivener") return "project-zip";
    return read ? { scrivener: read } : null;
  }
  if (STORY_EXTENSIONS.includes(extensionOf(file.name))) {
    const read = await storyFromFile(file, options);
    return read ? { project: read.project, medias: [], story: read.report } : null;
  }
  const project = await projectFromFile(file, options);
  return project ? { project, medias: [] } : null;
}

/** Histoire Twee ou Ink (#84, lot 9) : le projet et ce que l'import en dit (#96). */
async function storyFromFile(file: { name: string; data: Uint8Array }, options: ImportOptions): Promise<{ project: Project; report: StoryReport } | null> {
  // Roman interactif : refusé (rien de lisible) quand la fonction n'est pas proposée sur cet appareil.
  if (!options.interactive) return null;
  const story = await import("../interactive/storyImport");
  const text = new TextDecoder("utf-8").decode(file.data);
  const source = extensionOf(file.name) === "ink" ? story.parseInk(text, options.interactive.opening) : story.parseTwee(text);
  if (!source) return null;
  const project = story.storyToProject(source, { fileName: file.name, newId: options.newId });
  return project.cards.length > 0 ? { project, report: story.storyReport(source) } : null;
}

export async function projectFromFile(file: { name: string; data: Uint8Array }, options: ImportOptions): Promise<Project | null> {
  const ext = extensionOf(file.name);
  const text = () => new TextDecoder("utf-8").decode(file.data);
  let project: Project;
  if (STORY_EXTENSIONS.includes(ext)) return (await storyFromFile(file, options))?.project ?? null;
  else if (ext === "fdx") {
    const screenplay = parseFdx(text());
    if (!screenplay) return null;
    project = importScreenplayModel(screenplay, { ...options, revisions: parseFdxRevisions(text()) });
  } else if (ext === "fountain" || ext === "spmd" || (ext === "txt" && looksLikeScreenplay(text()))) {
    project = importFountain(text(), options);
  } else if (ext === "pdf") {
    // pdf.js et la lecture de la mise en page sont chargés seulement ici (lourds).
    const [{ readPdfText }, pdf] = await Promise.all([import("../pdfDocument"), import("./pdf")]);
    const pages = await readPdfText(file.data);
    if (pdf.looksLikeScreenplayPdf(pages)) project = importScreenplayModel(pdf.screenplayFromPdf(pages), options);
    else project = bookToProject(chapterize(pdf.novelFromPdf(pages), file.name), { fileName: file.name, newId: options.newId });
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
