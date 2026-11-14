// PDF du livre broché (intérieur prêt pour KDP) et de son gabarit de couverture. La mise en page vient de
// paperback.ts (pure) ; ici on charge la police (Crimson Text, licence OFL, avec son italique et son gras),
// les motifs de césure de la langue du livre, puis on dessine. Ce module, ses polices et la césure ne
// sont chargés qu'au moment d'exporter (import dynamique depuis index.ts).

import { PDFDocument, degrees, popGraphicsState, pushGraphicsState, rgb, setCharacterSpacing, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import regularData from "../assets/fonts/CrimsonText-Regular.ttf?inline";
import italicData from "../assets/fonts/CrimsonText-Italic.ttf?inline";
import boldData from "../assets/fonts/CrimsonText-Bold.ttf?inline";
import boldItalicData from "../assets/fonts/CrimsonText-BoldItalic.ttf?inline";
import { addOutline } from "./outline";
import { typoCode, typoRules } from "../typoRules";
import {
  KDP_MAX_PAGES,
  KDP_MIN_PAGES,
  KDP_TRIMS,
  coverLayout,
  hyphenateBook,
  layoutPaperback,
  spineInches,
  type BookDoc,
  type BookLayout,
  type BookStrings,
  type FontStyle,
  type PaperId,
  type PrintOptions,
  type TrimId,
} from "./paperback";
import { inkOn, layoutFullCover, luminance, type FullCoverInput, type FullCoverLayout } from "./fullCover";
import type { CoverArt } from "./coverImage";

const fromDataUri = (uri: string) => Uint8Array.from(atob(uri.slice(uri.indexOf(",") + 1)), (c) => c.charCodeAt(0));
/** Hauteur des capitales de Crimson Text, en fraction du corps (656 / 1024). */
const CAP_HEIGHT = 0.64;
const SHY = "\u00ad";
/** L'espace fine insécable n'est pas dans Crimson Text : une espace insécable ordinaire la remplace. */
const noThinSpace = (s: string) => s.replace(/\u202f/g, "\u00a0");

async function embedFonts(pdf: PDFDocument): Promise<Record<FontStyle, PDFFont>> {
  pdf.registerFontkit(fontkit);
  const [regular, italic, bold, boldItalic] = await Promise.all(
    [regularData, italicData, boldData, boldItalicData].map((data) => pdf.embedFont(fromDataUri(data), { subset: true })),
  );
  return { regular, italic, bold, boldItalic };
}

/** Motifs de césure livrés (typoRules.ts, `hyphen`) : imports écrits en entier pour que Vite les découpe. */
const HYPHEN_PATTERNS = {
  fr: () => import("hyphen/fr"),
  "en-us": () => import("hyphen/en-us"),
  "en-gb": () => import("hyphen/en-gb"),
} as const;

/** Césure de la langue du livre (français, anglais) ; aucune pour une langue dont les motifs ne sont pas livrés. */
async function hyphenator(lang: string): Promise<((word: string) => string) | null> {
  const code = lang.toLowerCase();
  const patterns = code === "en-au" ? "en-gb" : typoRules(code).hyphen;
  const load = patterns && (code.startsWith("en") || typoCode(code) !== "en") ? HYPHEN_PATTERNS[patterns] : null;
  if (!load) return null;
  try {
    type Hyphenator = { hyphenateSync: (text: string, options?: { hyphenChar?: string; minWordLength?: number }) => string };
    const mod = (await load()) as unknown as { default?: Hyphenator } & Partial<Hyphenator>;
    const hy = (mod.default ?? mod) as Hyphenator;
    return (word) => hy.hyphenateSync(word, { hyphenChar: SHY, minWordLength: 6 });
  } catch {
    return null;
  }
}

export interface PreparedPaperback {
  pages: number;
  spine: number;
  tooFew: boolean;
  tooMany: boolean;
  layout: BookLayout;
  save: () => Promise<Uint8Array>;
}

/** Compose le livre (nombre de pages connu tout de suite) ; `save` dessine le PDF. */
export async function preparePaperback(book: BookDoc, options: PrintOptions, strings: BookStrings): Promise<PreparedPaperback> {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const hy = await hyphenator(book.lang);
  const source = hy ? hyphenateBook(book, hy) : book;
  const layout = layoutPaperback(source, options, strings, { width: (text, font, size) => fonts[font].widthOfTextAtSize(noThinSpace(text), size), capHeight: CAP_HEIGHT });
  const pages = layout.pages.length;
  let saved: Promise<Uint8Array> | null = null;
  return {
    pages,
    spine: spineInches(pages, options.paper),
    tooFew: pages < KDP_MIN_PAGES,
    tooMany: pages > KDP_MAX_PAGES[options.paper],
    layout,
    // Le PDF ne se dessine qu'une fois, même si l'on enregistre deux fois.
    save: () => (saved ??= draw()),
  };
  async function draw() {
    {
      const ink = rgb(0, 0, 0);
      const muted = rgb(0.2, 0.2, 0.2);
      for (const sheet of layout.pages) {
        const page = pdf.addPage([layout.width, layout.height]);
        for (const t of sheet.texts) {
          const draw = () => page.drawText(noThinSpace(t.text), { x: t.x, y: layout.height - t.y, size: t.size, font: fonts[t.font], color: t.muted ? muted : ink });
          if (t.spacing) {
            page.pushOperators(pushGraphicsState(), setCharacterSpacing(t.spacing));
            draw();
            page.pushOperators(popGraphicsState());
          } else draw();
        }
      }
      addOutline(pdf, layout.entries);
      pdf.setTitle(book.title);
      if (book.author) pdf.setAuthor(book.author);
      pdf.setLanguage(book.lang);
      pdf.setCreator("MondoWrite");
      return pdf.save();
    }
  }
}

/** Textes du gabarit de couverture. */
export interface CoverStrings {
  back: string;
  front: string;
  spine: string;
  barcode: string;
  /** « Couverture entière : {w} × {h} in ({wmm} × {hmm} mm), fond perdu compris » */
  full: string;
  /** « Format : {w} × {h} in · {pages} pages · {paper} » */
  trim: string;
  /** « Dos : {s} in ({smm} mm) » */
  spineSize: string;
  noSpineText: string;
  legend: string;
  howTo: string;
  paper: Record<PaperId, string>;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const inches = (n: number) => n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
const mm = (n: number) => (n * 25.4).toFixed(1);

/** Gabarit de couverture : plats, dos, fond perdu, zones sûres et place du code-barres, chacun nommé. */
export async function buildCoverTemplate(trim: TrimId, paper: PaperId, pages: number, info: { title: string; author: string }, s: CoverStrings): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const c = coverLayout(trim, paper, pages);
  const page = pdf.addPage([c.width, c.height]);
  const H = c.height;
  const blue = rgb(0.12, 0.31, 0.54);
  const red = rgb(0.75, 0.22, 0.17);
  const rect = (b: { x: number; y: number; width: number; height: number }, o: Parameters<typeof page.drawRectangle>[0] = {}) =>
    page.drawRectangle({ x: b.x, y: H - b.y - b.height, width: b.width, height: b.height, ...o });

  rect({ x: 0, y: 0, width: c.width, height: c.height }, { color: rgb(0.965, 0.835, 0.835) });
  rect(c.trim, { color: rgb(1, 1, 1), borderColor: red, borderWidth: 0.75 });
  rect(c.spine, { color: rgb(0.933, 0.953, 0.98), borderColor: blue, borderWidth: 0.5 });
  for (const safe of c.safe) rect(safe, { borderColor: blue, borderWidth: 0.5, borderDashArray: [3, 3] });
  rect(c.barcode, { color: rgb(1, 0.97, 0.84), borderColor: rgb(0.72, 0.58, 0.04), borderWidth: 0.75 });

  const centered = (text: string, box: { x: number; width: number }, y: number, size: number, font: PDFFont, color = blue) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: box.x + (box.width - w) / 2, y: H - y, size, font, color });
  };
  const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
  centered(s.back, c.back, mid(c.back), 20, fonts.regular, rgb(0.62, 0.71, 0.81));
  centered(s.front, c.front, mid(c.front), 20, fonts.regular, rgb(0.62, 0.71, 0.81));
  centered(s.barcode, c.barcode, mid(c.barcode) - 2, 8, fonts.regular, rgb(0.49, 0.4, 0.03));
  centered("2 × 1.2 in", c.barcode, mid(c.barcode) + 10, 8, fonts.regular, rgb(0.49, 0.4, 0.03));
  // Dos : son nom écrit dans le sens de la hauteur, s'il y a la place.
  if (c.spine.width > 0.3 * 72) {
    const w = fonts.regular.widthOfTextAtSize(s.spine, 8);
    page.drawText(s.spine, { x: c.spine.x + c.spine.width / 2 - 3, y: H - mid(c.spine) + w / 2, size: 8, font: fonts.regular, color: blue, rotate: degrees(-90) });
  }

  // Les mesures, en haut du premier plat, dans sa zone sûre.
  const t = KDP_TRIMS[trim];
  const W = c.width / 72;
  const Hin = c.height / 72;
  const lines = [
    { text: [info.title, info.author].filter(Boolean).join(" · "), font: fonts.bold },
    { text: fill(s.full, { w: inches(W), h: inches(Hin), wmm: mm(W), hmm: mm(Hin) }), font: fonts.regular },
    { text: fill(s.trim, { w: inches(t.width), h: inches(t.height), pages, paper: s.paper[paper] }), font: fonts.regular },
    { text: `${fill(s.spineSize, { s: inches(c.spineInches), smm: mm(c.spineInches) })}${c.spineText ? "" : ` · ${s.noSpineText}`}`, font: fonts.regular },
    { text: s.legend, font: fonts.regular, color: red },
    { text: s.howTo, font: fonts.italic },
  ];
  const box = c.safe[1];
  const size = 8.5;
  let y = box.y + 14;
  for (const line of lines) {
    // Retour à la ligne par mots, dans la largeur de la zone sûre.
    const words = line.text.split(/\s+/).filter(Boolean);
    let cur = "";
    const flush = () => {
      if (!cur) return;
      page.drawText(cur, { x: box.x + 6, y: H - y, size, font: line.font, color: line.color ?? blue });
      y += size * 1.35;
      cur = "";
    };
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (line.font.widthOfTextAtSize(next, size) > box.width - 12 && cur) {
        flush();
        cur = word;
      } else cur = next;
    }
    flush();
    y += size * 0.35;
  }
  pdf.setTitle(info.title);
  pdf.setCreator("MondoWrite");
  return pdf.save();
}


// ---------- Couverture complète (#78) ----------

/** Couleur du dos sans image ni couleur choisie : le bleu nuit de l'app. */
const DEFAULT_SPINE = "#1f2a44";
const rgbOf = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
const LIGHT_INK = "#ffffff";
const DARK_INK = "#141414";
/** Rapport de contraste entre deux couleurs (WCAG). */
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export interface PreparedFullCover {
  layout: FullCoverLayout;
  /** Dessine le PDF avec l'image préparée (coverImage.ts) ; `art` null : premier plat uni. */
  draw: (art: CoverArt | null) => Promise<Uint8Array>;
}

/** Met la couverture complète en page avec les vraies polices ; le dessin attend l'image préparée. */
export async function prepareFullCover(input: FullCoverInput): Promise<PreparedFullCover> {
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const layout = layoutFullCover(input, { width: (text, font, size) => fonts[font].widthOfTextAtSize(noThinSpace(text), size) });
  let drawn = false;
  return {
    layout,
    draw: async (art) => {
      if (drawn) throw new Error("déjà dessinée");
      drawn = true;
      const { cover } = layout;
      const page = pdf.addPage([cover.width, cover.height]);
      const H = cover.height;
      const rect = (b: { x: number; y: number; width: number; height: number }, color: string, opacity = 1) =>
        page.drawRectangle({ x: b.x, y: H - b.y - b.height, width: b.width, height: b.height, color: rgbOf(color), opacity });
      const spine = input.design.spineColor || art?.edge || DEFAULT_SPINE;
      // Quatrième et dos.
      let backBg = spine;
      if (art?.back) {
        const image = await pdf.embedJpg(art.back);
        page.drawImage(image, { x: layout.backBox.x, y: H - layout.backBox.y - layout.backBox.height, width: layout.backBox.width, height: layout.backBox.height });
        backBg = art.backBg ?? spine;
      } else rect(layout.backBox, spine);
      rect(layout.spineBox, spine);
      // Premier plat : l'image, ou la couleur du dos.
      if (art?.front) {
        const image = await pdf.embedJpg(art.front.data);
        page.drawImage(image, { x: layout.frontBox.x, y: H - layout.frontBox.y - layout.frontBox.height, width: layout.frontBox.width, height: layout.frontBox.height });
      } else rect(layout.frontBox, spine);
      // Encre du premier plat : claire ou foncée selon la zone ; un voile discret quand l'image est trop mêlée.
      const frontInk = (bg: string | null) => {
        const ground = bg ?? spine;
        const ink = inkOn(ground) === "light" ? LIGHT_INK : DARK_INK;
        return { ink, veil: contrast(ink, ground) < 4.5 ? (ink === LIGHT_INK ? "#000000" : "#ffffff") : null };
      };
      const titleInk = frontInk(art?.titleBg ?? null);
      const authorInk = frontInk(art?.authorBg ?? null);
      if (art?.front) {
        // Bandeau sur toute la largeur du plat (fond perdu compris), jamais un cadre au milieu de l'image.
        const band = (z: NonNullable<FullCoverLayout["titleZone"]>) => ({ x: layout.frontBox.x, y: z.y, width: layout.frontBox.width, height: z.height });
        if (titleInk.veil && layout.titleZone) rect(band(layout.titleZone), titleInk.veil, 0.4);
        if (authorInk.veil && layout.authorZone) rect(band(layout.authorZone), authorInk.veil, 0.4);
      }
      const spineInk = inkOn(spine) === "light" ? LIGHT_INK : DARK_INK;
      const backInk = inkOn(backBg) === "light" ? LIGHT_INK : DARK_INK;
      for (const t of layout.texts) {
        const color =
          t.panel === "spine" ? spineInk : t.panel === "back" ? backInk : layout.titleZone && t.y <= layout.titleZone.y + layout.titleZone.height && t.y >= layout.titleZone.y ? titleInk.ink : authorInk.ink;
        const draw = () =>
          page.drawText(noThinSpace(t.text), { x: t.x, y: H - t.y, size: t.size, font: fonts[t.font], color: rgbOf(color), ...(t.rotate ? { rotate: degrees(t.rotate) } : {}) });
        if (t.spacing) {
          page.pushOperators(pushGraphicsState(), setCharacterSpacing(t.spacing));
          draw();
          page.pushOperators(popGraphicsState());
        } else draw();
      }
      pdf.setTitle(input.texts.title || "Cover");
      if (input.texts.author) pdf.setAuthor(input.texts.author);
      pdf.setCreator("MondoWrite");
      return pdf.save();
    },
  };
}
