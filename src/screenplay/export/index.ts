// Les trois exports du scénario. Le PDF et le FDX sont chargés à la demande (import dynamique) :
// leurs bibliothèques et les polices ne pèsent pas sur le démarrage de l'app.

import type { Screenplay } from "../model";
import { LAYOUTS, type Paper } from "../layout";
import { serialize } from "../serialize";
import type { TypesetStrings } from "./typeset";

export type ExportFormat = "pdf" | "fountain" | "fdx";
export const EXPORT_FORMATS: ExportFormat[] = ["pdf", "fountain", "fdx"];

export interface ExportedFile {
  /** Nom proposé, extension comprise. */
  name: string;
  extension: string;
  mime: string;
  data: Uint8Array;
}

export interface ExportOptions {
  /** Titre du projet : sert de nom de fichier. */
  title: string;
  paper: Paper;
  locale: string;
  strings: TypesetStrings;
  /** Numéroter les scènes dans le PDF et le FDX. */
  numberScenes?: boolean;
  /** Souligner les en-têtes de scène dans le PDF et le FDX. */
  underlineHeadings?: boolean;
  /** scenario.fountain tel qu'il est sur disque, quand le scénario n'a pas changé depuis. */
  source?: string;
  /** PDF seulement : choix de la fenêtre « Exporter le scénario en PDF » (en-tête déjà rempli). */
  print?: { titlePage: boolean; synopsis: boolean; sections: boolean; notes: boolean; character: string; header: string; watermark: string };
}

const MIME: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  fountain: "text/plain",
  fdx: "application/xml",
};

/** Nom de fichier valable sur tous les systèmes (ni chemin, ni caractère interdit sous Windows) ; une virgule devient un tiret. */
export function fileName(title: string, fallback: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s*[,，、]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/(\s-){2,}/g, " -")
    .replace(/^[-. ]+|[-. ]+$/g, "");
  return safe || fallback;
}

export async function exportScreenplay(
  screenplay: Screenplay,
  format: ExportFormat,
  options: ExportOptions,
): Promise<ExportedFile> {
  const encode = (text: string) => new TextEncoder().encode(text);
  let data: Uint8Array;
  if (format === "fountain") {
    // Le fichier tel quel.
    data = encode(options.source ?? serialize(screenplay));
  } else if (format === "fdx") {
    const { buildFdx } = await import("./fdx");
    data = encode(buildFdx(screenplay, options.locale, options.numberScenes, options.underlineHeadings));
  } else {
    const { buildPdf } = await import("./pdf");
    data = await buildPdf(screenplay, {
      layout: LAYOUTS[options.paper],
      locale: options.locale,
      strings: options.strings,
      numberScenes: options.numberScenes,
      underlineHeadings: options.underlineHeadings,
      ...(options.print ?? {}),
    });
  }
  return { name: `${fileName(options.title, "scenario")}.${format}`, extension: format, mime: MIME[format], data };
}
