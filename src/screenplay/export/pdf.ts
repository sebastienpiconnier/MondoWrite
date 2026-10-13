// Export PDF au format standard : Courier Prime 12 points (10 caractères par pouce, 6 lignes par pouce),
// marges du gabarit (layout.ts), numéros de page en haut à droite à partir de la page 2.
// Ce module et ses polices ne sont chargés qu'au moment d'exporter (import dynamique).

import { PDFDocument, PageSizes, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
// Polices embarquées dans le PDF (TTF officiels, licence SIL OFL : voir src/assets/fonts/OFL.txt).
import regularData from "../../assets/fonts/CourierPrime-Regular.ttf?inline";
import boldData from "../../assets/fonts/CourierPrime-Bold.ttf?inline";
import type { Screenplay } from "../model";
import type { Layout } from "../layout";
import { typeset, typesetTitlePage, type TypesetLine, type TypesetStrings } from "./typeset";

const POINT = 72; // points par pouce
const SIZE = 12;
const CHAR = SIZE * 0.6; // chasse de Courier : 7,2 points
const LINE = SIZE; // 6 lignes par pouce
const ASCENT = 9; // de la ligne de base au haut de la ligne

const fromDataUri = (uri: string) => Uint8Array.from(atob(uri.slice(uri.indexOf(",") + 1)), (c) => c.charCodeAt(0));

export interface PdfOptions {
  layout: Layout;
  locale: string;
  strings: TypesetStrings;
  numberScenes?: boolean;
  underlineHeadings?: boolean;
}

export async function buildPdf(
  screenplay: Screenplay,
  { layout, locale, strings, numberScenes, underlineHeadings }: PdfOptions,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fromDataUri(regularData));
  const bold = await pdf.embedFont(fromDataUri(boldData));
  const [width, height] = layout.paper === "a4" ? PageSizes.A4 : PageSizes.Letter;
  const left = layout.margin.left * POINT;
  const top = height - layout.margin.top * POINT;

  const draw = (lines: TypesetLine[], number?: number) => {
    const page = pdf.addPage([width, height]);
    const text = (value: string, x: number, y: number, font: PDFFont) => page.drawText(value, { x, y, size: SIZE, font });
    for (const line of lines) {
      const x = left + line.column * CHAR;
      const y = top - line.row * LINE - ASCENT;
      text(line.text, x, y, line.bold ? bold : regular);
      if (line.underline) page.drawLine({ start: { x, y: y - 2 }, end: { x: x + line.text.length * CHAR, y: y - 2 }, thickness: 0.6 });
    }
    if (number !== undefined && number > 1) {
      const label = `${number}.`;
      text(label, width - layout.margin.right * POINT - label.length * CHAR, height - 0.5 * POINT - ASCENT, regular);
    }
  };

  const titleLines = typesetTitlePage(screenplay.titlePage, layout);
  if (titleLines.length > 0) draw(titleLines);
  const pages = typeset(screenplay.elements, layout, locale, strings, { numberScenes, underlineHeadings });
  for (const page of pages) draw(page.lines, page.number);
  // Un PDF sans page n'est pas valide : scénario vide, une feuille blanche.
  if (titleLines.length === 0 && pages.length === 0) pdf.addPage([width, height]);

  const title = Object.entries(screenplay.titlePage).find(([key]) => key.trim().toLowerCase() === "title")?.[1];
  const author = Object.entries(screenplay.titlePage).find(([key]) => /^authors?$/i.test(key.trim()))?.[1];
  if (title) pdf.setTitle(title.replace(/\s+/g, " "));
  if (author) pdf.setAuthor(author.replace(/\s+/g, " "));
  pdf.setLanguage(locale);
  pdf.setCreator("MondoWrite");
  return pdf.save();
}
