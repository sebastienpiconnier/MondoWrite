// PDF d'un document en prose (manuscrit, bible) : Courier Prime 12, mise en page calculée par prose.ts.
// Ce module et ses polices ne sont chargés qu'au moment d'exporter (import dynamique depuis index.ts).

import { PDFDocument, PageSizes } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import regularData from "../assets/fonts/CourierPrime-Regular.ttf?inline";
import boldData from "../assets/fonts/CourierPrime-Bold.ttf?inline";
import type { ExportDoc } from "./doc";
import { PROSE_CHAR, PROSE_LINE, PROSE_MARGIN, layoutProse, proseGeometry } from "./prose";

const SIZE = 12;
const ASCENT = 9;

const fromDataUri = (uri: string) => Uint8Array.from(atob(uri.slice(uri.indexOf(",") + 1)), (c) => c.charCodeAt(0));

export async function buildProsePdf(doc: ExportDoc, paper: "a4" | "letter"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fromDataUri(regularData));
  const bold = await pdf.embedFont(fromDataUri(boldData));
  const [width, height] = paper === "a4" ? PageSizes.A4 : PageSizes.Letter;
  const top = height - PROSE_MARGIN;

  // Chaque image n'est intégrée qu'une fois, même citée plusieurs fois.
  const embedded = new Map<string, Awaited<ReturnType<typeof pdf.embedJpg>>>();
  for (const [name, image] of Object.entries(doc.images ?? {})) {
    try {
      embedded.set(name, await pdf.embedJpg(image.data));
    } catch {
      // Image illisible : le PDF se fait sans elle.
    }
  }

  for (const sheet of layoutProse(doc, proseGeometry(width, height))) {
    const page = pdf.addPage([width, height]);
    for (const image of sheet.images ?? []) {
      const jpg = embedded.get(image.name);
      if (jpg) page.drawImage(jpg, { x: PROSE_MARGIN, y: top - image.row * PROSE_LINE - image.height, width: image.width, height: image.height });
    }
    for (const line of sheet.lines) {
      const y = top - line.row * PROSE_LINE - ASCENT;
      for (const segment of line.segments) {
        const x = PROSE_MARGIN + segment.col * PROSE_CHAR;
        page.drawText(segment.text, { x, y, size: SIZE, font: segment.bold ? bold : regular });
        // En Courier, l'italique se note par un soulignement.
        if (segment.underline) page.drawLine({ start: { x, y: y - 2 }, end: { x: x + segment.text.length * PROSE_CHAR, y: y - 2 }, thickness: 0.6 });
      }
    }
    if (sheet.number !== undefined) {
      const label = String(sheet.number);
      page.drawText(label, { x: width - PROSE_MARGIN - label.length * PROSE_CHAR, y: height - PROSE_MARGIN / 2 - ASCENT, size: SIZE, font: regular });
    }
  }
  pdf.setTitle(doc.title);
  if (doc.author) pdf.setAuthor(doc.author);
  pdf.setLanguage(doc.lang);
  pdf.setCreator("MondoWrite");
  return pdf.save();
}
