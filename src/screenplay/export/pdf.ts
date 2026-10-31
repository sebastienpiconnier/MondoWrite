// Export PDF au format standard : Courier Prime 12 points (10 caractères par pouce, 6 lignes par pouce),
// marges du gabarit (layout.ts), numéros de page en haut à droite à partir de la page 2. À la demande (fenêtre
// « Exporter le scénario en PDF ») : en-tête à gauche, filigrane, synopsis et notes en gris, répliques d'un
// personnage surlignées (texte d'un comédien).
// Ce module et ses polices ne sont chargés qu'au moment d'exporter (import dynamique).

import { PDFDocument, PageSizes, degrees, rgb, type PDFFont } from "pdf-lib";
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
  /** Page de titre (oui par défaut). */
  titlePage?: boolean;
  synopsis?: boolean;
  sections?: boolean;
  notes?: boolean;
  /** Texte d'un personnage : ses scènes seulement, ses répliques surlignées. */
  character?: string;
  /** En-tête de chaque page (déjà rempli : date, titre, auteur), en haut à gauche. */
  header?: string;
  /** Grand texte en travers de chaque page. */
  watermark?: string;
  /** (À SUIVRE) / (SUITE) aux coupures de réplique (oui par défaut), et (SUITE) quand un personnage reprend. */
  breaks?: boolean;
  resumes?: boolean;
}

const GRAY = rgb(0.38, 0.38, 0.38);
const MARKER = rgb(1, 0.93, 0.55); // surligneur jaune pâle : se lit aussi en noir et blanc

export async function buildPdf(
  screenplay: Screenplay,
  options: PdfOptions,
): Promise<Uint8Array> {
  const { layout, locale, strings, numberScenes, underlineHeadings } = options;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fromDataUri(regularData));
  const bold = await pdf.embedFont(fromDataUri(boldData));
  const [width, height] = layout.paper === "a4" ? PageSizes.A4 : PageSizes.Letter;
  const left = layout.margin.left * POINT;
  const top = height - layout.margin.top * POINT;

  const watermark = options.watermark?.trim().replace(/\u202f/g, "\u00a0") ?? "";
  const header = options.header?.trim() ?? "";
  const draw = (lines: TypesetLine[], number?: number) => {
    const page = pdf.addPage([width, height]);
    // Courier Prime n'a pas l'espace fine insécable (textes d'interface en français) : une insécable ordinaire.
    const text = (value: string, x: number, y: number, font: PDFFont, gray = false) => page.drawText(value.replace(/\u202f/g, "\u00a0"), { x, y, size: SIZE, font, ...(gray ? { color: GRAY } : {}) });
    if (watermark) {
      // En travers de la page, centré, assez grand pour se voir sans gêner la lecture.
      const angle = Math.atan2(height, width);
      const size = Math.max(24, Math.min(96, (Math.hypot(width, height) * 0.7) / (watermark.length * 0.6)));
      const w = bold.widthOfTextAtSize(watermark, size);
      const lift = size * 0.35;
      page.drawText(watermark, {
        x: width / 2 - (w / 2) * Math.cos(angle) + lift * Math.sin(angle),
        y: height / 2 - (w / 2) * Math.sin(angle) - lift * Math.cos(angle),
        size,
        font: bold,
        color: rgb(0.75, 0.75, 0.75),
        opacity: 0.45,
        rotate: degrees((angle * 180) / Math.PI),
      });
    }
    const at = (line: TypesetLine) => ({ x: left + line.column * CHAR, y: top - line.row * LINE - ASCENT });
    // Le surlignage d'abord, pour que le texte passe par-dessus.
    for (const line of lines) {
      if (!line.highlight || !line.text) continue;
      const { x, y } = at(line);
      page.drawRectangle({ x: x - 2, y: y - 3, width: line.text.length * CHAR + 4, height: LINE, color: MARKER });
    }
    for (const line of lines) {
      const { x, y } = at(line);
      text(line.text, x, y, line.bold ? bold : regular, line.gray);
      if (line.underline) page.drawLine({ start: { x, y: y - 2 }, end: { x: x + line.text.length * CHAR, y: y - 2 }, thickness: 0.6 });
    }
    if (number === undefined) return;
    const label = number > 1 ? `${number}.` : "";
    const headY = height - 0.5 * POINT - ASCENT;
    if (label) text(label, width - layout.margin.right * POINT - label.length * CHAR, headY, regular);
    if (header) {
      const room = Math.floor((width - left - layout.margin.right * POINT) / CHAR) - label.length - 2;
      text(header.length > room ? `${header.slice(0, Math.max(0, room - 1))}…` : header, left, headY, regular);
    }
  };

  const titleLines = options.titlePage === false ? [] : typesetTitlePage(screenplay.titlePage, layout);
  if (titleLines.length > 0) draw(titleLines);
  const pages = typeset(screenplay.elements, layout, locale, strings, {
    numberScenes,
    underlineHeadings,
    synopsis: options.synopsis,
    sections: options.sections,
    notes: options.notes,
    character: options.character,
    breaks: options.breaks,
    resumes: options.resumes,
  });
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
