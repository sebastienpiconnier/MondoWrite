// PDF de la Bible (Bible v2) : dessine avec pdf-lib les pages de bibleLayout.ts. Chargé seulement au moment
// d'exporter ou d'afficher l'aperçu (import dynamique). Polices : IBM Plex et Space Grotesk depuis les fichiers
// WOFF de Fontsource (adresse locale de l'app, lue par fetch, décompressés par woff.ts ; pas WOFF2, que
// fontkit ne sait pas réduire en sous-ensemble), Crimson Text depuis le fichier déjà embarqué
// pour le livre broché. Chaque police n'est chargée qu'une fois par session, et n'est intégrée au PDF qu'en
// sous-ensemble (les seuls caractères utilisés).

import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import crimsonData from "../assets/fonts/CrimsonText-Regular.ttf?inline";
import crimsonItalicData from "../assets/fonts/CrimsonText-Italic.ttf?inline";
import crimsonBoldData from "../assets/fonts/CrimsonText-Bold.ttf?inline";
import plexSerifUrl from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-normal.woff?url";
import plexSerifItalicUrl from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-400-italic.woff?url";
import plexSerifBoldUrl from "@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-600-normal.woff?url";
import plexSansUrl from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff?url";
import plexSansBoldUrl from "@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff?url";
import groteskUrl from "@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff?url";
import { addOutline } from "./outline";
import { woffToSfnt } from "./woff";
import { THEMES, themeFiles, type FontFile, type Rgb } from "./bibleThemes";
import { PAGE_SIZES, layoutBible, printable, type LaidPage } from "./bibleLayout";
import type { BiblePack } from "./biblePack";
import type { DocImage } from "./doc";
import type { BibleExportOptions } from "../bibleExport";

const fromDataUri = (uri: string) => Uint8Array.from(atob(uri.slice(uri.indexOf(",") + 1)), (c) => c.charCodeAt(0));

const SOURCES: Record<FontFile, { inline: string } | { url: string }> = {
  crimson: { inline: crimsonData },
  crimsonItalic: { inline: crimsonItalicData },
  crimsonBold: { inline: crimsonBoldData },
  plexSerif: { url: plexSerifUrl },
  plexSerifItalic: { url: plexSerifItalicUrl },
  plexSerifBold: { url: plexSerifBoldUrl },
  plexSans: { url: plexSansUrl },
  plexSansBold: { url: plexSansBoldUrl },
  grotesk: { url: groteskUrl },
};

const cache = new Map<FontFile, Promise<Uint8Array>>();
function fontBytes(file: FontFile): Promise<Uint8Array> {
  let p = cache.get(file);
  if (!p) {
    const src = SOURCES[file];
    p =
      "inline" in src
        ? Promise.resolve(fromDataUri(src.inline))
        : fetch(src.url).then((r) => {
            if (!r.ok) throw new Error(`police ${file}`);
            return r.arrayBuffer().then((b) => woffToSfnt(new Uint8Array(b)));
          });
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p;
}

/** Images dont le document a besoin (couverture, portraits, vignettes des lieux). */
export function packImageNames(pack: BiblePack): string[] {
  const names = new Set<string>();
  if (pack.cover) names.add(pack.cover);
  for (const s of pack.sections)
    for (const b of s.blocks) {
      if (b.kind === "person" && b.image) names.add(b.image);
      if (b.kind === "thumbs") for (const it of b.items) names.add(it.image);
    }
  return [...names];
}

const color = ([r, g, b]: Rgb) => rgb(r, g, b);

function drawImage(page: PDFPage, H: number, img: PDFImage, op: { x: number; y: number; w: number; h: number; crop: boolean }) {
  const ratio = img.width / img.height;
  const box = op.w / op.h;
  // Remplir (crop) : l'image déborde de la boîte, qui la découpe ; sinon elle tient dedans, centrée.
  const fill = op.crop ? ratio > box : ratio < box;
  const w = fill ? op.h * ratio : op.w;
  const h = fill ? op.h : op.w / ratio;
  const x = op.x + (op.w - w) / 2;
  const y = H - op.y - op.h + (op.h - h) / 2;
  if (!op.crop) return page.drawImage(img, { x, y, width: w, height: h });
  page.pushOperators(pushGraphicsState(), rectangle(op.x, H - op.y - op.h, op.w, op.h), clip(), endPath());
  page.drawImage(img, { x, y, width: w, height: h });
  page.pushOperators(popGraphicsState());
}

export interface BiblePdfInput {
  pack: BiblePack;
  options: BibleExportOptions;
  paper: "a4" | "letter";
  lang: string;
  images: Record<string, DocImage>;
  /** PDF du scénario au format standard : ses `pack.pilotPages` premières pages sont ajoutées à la fin. */
  pilot?: Uint8Array | null;
}

/** Compose et dessine le PDF. Rend aussi le nombre de pages (l'aperçu l'affiche). */
export async function bibleToPdf({ pack, options, paper, lang, images, pilot }: BiblePdfInput): Promise<{ bytes: Uint8Array; pages: number }> {
  const theme = THEMES[options.theme];
  const accent = theme.accents[options.accent] ?? theme.accents[0];
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const files = themeFiles(options.theme);
  const embedded = await Promise.all(files.map(async (f) => [f, await pdf.embedFont(await fontBytes(f), { subset: true })] as const));
  const fonts = Object.fromEntries(embedded) as Record<FontFile, PDFFont>;
  const pages: LaidPage[] = layoutBible({
    pack,
    theme,
    accent,
    paper,
    metrics: { width: (text, font, size) => fonts[font].widthOfTextAtSize(printable(text), size) },
    imageSize: (name) => (images[name] ? { w: images[name].width, h: images[name].height } : null),
  });
  const embeddedImages = new Map<string, PDFImage>();
  const image = async (name: string) => {
    let img = embeddedImages.get(name);
    if (!img && images[name]) {
      img = await pdf.embedJpg(images[name].data);
      embeddedImages.set(name, img);
    }
    return img ?? null;
  };
  const [W, H] = PAGE_SIZES[paper];
  const marks: { title: string; page: number }[] = [];
  for (const [i, laid] of pages.entries()) {
    const page = pdf.addPage([W, H]);
    if (laid.mark) marks.push({ title: laid.mark, page: i });
    for (const op of laid.ops) {
      if (op.op === "rect") page.drawRectangle({ x: op.x, y: H - op.y - op.h, width: op.w, height: op.h, color: color(op.color) });
      else if (op.op === "line") page.drawLine({ start: { x: op.x1, y: H - op.y1 }, end: { x: op.x2, y: H - op.y2 }, thickness: op.width, color: color(op.color) });
      else if (op.op === "text") page.drawText(op.text, { x: op.x, y: H - op.y, size: op.size, font: fonts[op.font], color: color(op.color) });
      else {
        const img = await image(op.name);
        if (img) drawImage(page, H, img, op);
      }
    }
  }
  // Annexe : les premières pages du pilote, recopiées telles quelles depuis le PDF du scénario (sans la page de titre).
  let total = pages.length;
  if (pilot && pack.pilotPages > 0) {
    const source = await PDFDocument.load(pilot);
    const count = source.getPageCount();
    const indices = Array.from({ length: Math.min(pack.pilotPages, count) }, (_, i) => i);
    for (const copied of await pdf.copyPages(source, indices)) pdf.addPage(copied);
    total += indices.length;
  }
  addOutline(pdf, marks);
  pdf.setTitle(`${pack.kind} - ${pack.title}`);
  if (pack.author) pdf.setAuthor(pack.author);
  pdf.setLanguage(lang);
  pdf.setCreator("MondoWrite");
  return { bytes: await pdf.save(), pages: total };
}
