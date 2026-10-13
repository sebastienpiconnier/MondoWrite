// Exports du manuscrit et de la bible : Markdown, Word, EPUB, PDF. Tout est fabriqué dans l'app, sans
// outil externe, donc sur toutes les cibles. Les modules sont chargés à la demande (import dynamique).

import type { ExportDoc } from "./doc";
import { fileName, type ExportedFile } from "../screenplay/export";

export type DocFormat = "pdf" | "docx" | "epub" | "md";
export const MANUSCRIPT_FORMATS: DocFormat[] = ["pdf", "docx", "epub", "md"];
export const BIBLE_FORMATS: DocFormat[] = ["pdf", "docx", "md"];

const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  epub: "application/epub+zip",
  md: "text/markdown",
};

export interface DocExportOptions {
  /** Nom du fichier, sans extension (« Kerlaouen », « Kerlaouen, bible »). */
  name: string;
  paper: "a4" | "letter";
  /** Titre de la table des matières d'un EPUB. */
  contents: string;
}

export async function exportDocument(doc: ExportDoc, format: DocFormat, options: DocExportOptions): Promise<ExportedFile> {
  let data: Uint8Array;
  if (format === "pdf") {
    data = await (await import("./pdf")).buildProsePdf(doc, options.paper);
  } else {
    const text = await import("./text");
    if (format === "md") data = new TextEncoder().encode(text.toMarkdown(doc));
    else if (format === "docx") data = text.toDocx(doc);
    else data = text.toEpub(doc, { id: `urn:uuid:${crypto.randomUUID()}`, modified: `${new Date().toISOString().slice(0, 19)}Z`, contents: options.contents });
  }
  return { name: `${fileName(options.name, "mondowrite")}.${format}`, extension: format, mime: MIME[format], data };
}
