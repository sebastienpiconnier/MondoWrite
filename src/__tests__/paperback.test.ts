import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRINT,
  INCH,
  KDP_TRIMS,
  cleanPrint,
  coverLayout,
  gutterFor,
  gutterMin,
  hyphenateBook,
  hyphenateRuns,
  layoutPaperback,
  printToMeta,
  spineInches,
  type BookDoc,
  type BookStrings,
  type Metrics,
  type PrintOptions,
} from "../export/paperback";
import type { Block } from "../export/doc";

/** Mesure simple : chaque caractère fait la moitié du corps. */
const metrics: Metrics = { width: (s, _f, size) => [...s].length * size * 0.5, capHeight: 0.65 };

const strings: BookStrings = {
  copyright: "Copyright © {year} {name}",
  rights: "Tous droits réservés.",
  reproduction: "Aucune partie de ce livre ne peut être reproduite.",
  fiction: "Ceci est une œuvre de fiction.",
  isbn: "ISBN {isbn}",
  contents: "Table des matières",
  thanksTitle: "Merci de votre lecture",
  thanksText: "Si {title} vous a plu, un avis en ligne aide d’autres lecteurs.",
  stayInTouch: "Restons en contact",
  website: "Site",
  newsletter: "Lettre",
  alsoBy: "Du même auteur",
};

const lorem = "Le vent soufflait sur la lande et la gardienne du phare montait les marches une à une sans se presser.";
const para = (n = 1): Block => ({ kind: "paragraph", runs: [{ text: Array(n).fill(lorem).join(" ") }] });

function book(chapters = 3, paras = 6): BookDoc {
  return {
    title: "Kerlaouen",
    author: "Inès Morvan",
    lang: "fr",
    year: 2026,
    sections: [
      { kind: "page", page: "dedicace", title: "Dédicace", blocks: [para()] },
      ...Array.from({ length: chapters }, (_, i) => ({ kind: "chapter" as const, label: `Chapitre ${i + 1}`, title: `Titre ${i + 1}`, toc: `Chapitre ${i + 1} · Titre ${i + 1}`, blocks: Array.from({ length: paras }, () => para(3)) })),
      { kind: "page", page: "remerciements", title: "Remerciements", blocks: [para()] },
    ],
  };
}

const options = (o: Partial<PrintOptions> = {}): PrintOptions => ({ ...DEFAULT_PRINT, ...o });

describe("réglages du livre broché", () => {
  it("relit les réglages et n'écrit rien tant qu'on n'a rien changé", () => {
    expect(cleanPrint(undefined)).toEqual(DEFAULT_PRINT);
    expect(cleanPrint({ trim: "7x10", paper: "gold", toc: "oui", isbn: "  978 2 1234 " })).toEqual({ ...DEFAULT_PRINT, isbn: "978 2 1234" });
    expect(printToMeta(DEFAULT_PRINT)).toBeUndefined();
    expect(printToMeta({ ...DEFAULT_PRINT, trim: "6x9" })?.trim).toBe("6x9");
  });

  it("grand fond par tranche de pages, dos selon le papier", () => {
    expect(gutterMin(24)).toBe(0.375);
    expect(gutterMin(151)).toBe(0.5);
    expect(gutterMin(701)).toBe(0.875);
    expect(gutterFor(300)).toBe(0.75);
    expect(spineInches(200, "cream")).toBeCloseTo(0.5);
  });
});

describe("césure", () => {
  const hy = (w: string) => w.replace(/(..)(?=.)/g, "$1\u00ad"); // une coupure toutes les deux lettres
  it("ne coupe ni les noms, ni les mots courts, ni le dernier mot, et garde trois lettres de chaque côté", () => {
    const [run] = hyphenateRuns([{ text: "Kerlaouen regardait doucement maintenant" }], hy);
    const words = run.text.split(" ");
    expect(words[0]).toBe("Kerlaouen");
    expect(words[1].split("\u00ad").every((part, i, all) => (i === 0 || i === all.length - 1 ? part.length >= 3 : true))).toBe(true);
    expect(words[1]).toContain("\u00ad");
    expect(words[3]).toBe("maintenant");
    expect(hyphenateRuns([{ text: "petit chat" }], hy)[0].text).toBe("petit chat");
  });

  it("laisse les pages de garde et les séparateurs intacts", () => {
    const b = hyphenateBook(
      { ...book(1, 1), sections: [{ kind: "page", page: "dedicace", title: "", blocks: [para()] }, { kind: "chapter", label: "", title: "", toc: "", blocks: [para(), { kind: "paragraph", runs: [{ text: "* * *" }] }] }] },
      hy,
    );
    const ded = b.sections[0].blocks[0];
    const ch = b.sections[1].blocks;
    expect(ded.kind === "paragraph" && ded.runs[0].text).not.toContain("\u00ad");
    expect(ch[0].kind === "paragraph" && ch[0].runs[0].text).toContain("\u00ad");
    expect(ch[1].kind === "paragraph" && ch[1].runs[0].text).toBe("* * *");
  });
});

describe("mise en page du livre", () => {
  it("compte de pages pair, chapitres en belle page, page 1 au début du récit", () => {
    const layout = layoutPaperback(book(), options(), strings, metrics);
    expect(layout.pages.length % 2).toBe(0);
    expect(layout.pages[0].recto).toBe(true);
    expect(layout.pages[1].role).toBe("front"); // copyright au dos du titre
    const chapters = layout.entries.filter((e) => e.title.startsWith("Chapitre"));
    expect(chapters).toHaveLength(3);
    for (const e of chapters) {
      expect(e.page % 2).toBe(0);
      expect(layout.pages[e.page].recto).toBe(true);
    }
    expect(layout.pages[chapters[0].page].folio).toBe(1);
    // Pas de folio avant le récit, ni sur une page blanche.
    expect(layout.pages.slice(0, chapters[0].page).every((p) => p.folio === undefined)).toBe(true);
    expect(layout.pages.filter((p) => p.role === "blank").every((p) => p.texts.length === 0)).toBe(true);
  });

  it("titres courants : auteur à gauche, titre à droite, jamais sur l'ouverture d'un chapitre ; folios aux coins extérieurs", () => {
    const layout = layoutPaperback(book(2, 30), options(), strings, metrics);
    const trim = KDP_TRIMS["5x8"];
    const headSize = trim.size * 0.7;
    const heads = (i: number) => layout.pages[i].texts.filter((t) => t.size === headSize && t.muted);
    const opening = layout.entries[0].page;
    expect(heads(opening)).toHaveLength(0);
    const verso = layout.pages.findIndex((p, i) => i > opening && !p.recto && p.role === "story" && !p.opening);
    const recto = layout.pages.findIndex((p, i) => i > opening && p.recto && p.role === "story" && !p.opening);
    expect(heads(verso)[0].text).toBe("INÈS MORVAN");
    expect(heads(recto)[0].text).toBe("KERLAOUEN");
    const folio = (i: number) => layout.pages[i].texts.find((t) => t.text === String(layout.pages[i].folio))!;
    expect(folio(verso).x).toBeCloseTo(trim.outside * INCH);
    expect(folio(recto).x + metrics.width(folio(recto).text, "regular", folio(recto).size)).toBeCloseTo(layout.width - trim.outside * INCH);
  });

  it("marges en miroir : le grand fond est du côté de la reliure", () => {
    const layout = layoutPaperback(book(2, 30), options(), strings, metrics);
    const body = (p: (typeof layout.pages)[number]) => Math.min(...p.texts.filter((t) => !t.muted).map((t) => t.x));
    const story = layout.pages.filter((p) => p.role === "story" && !p.opening);
    const recto = story.find((p) => p.recto)!;
    const verso = story.find((p) => !p.recto)!;
    expect(body(recto)).toBeCloseTo(layout.gutter * INCH, 0);
    expect(body(verso)).toBeCloseTo(KDP_TRIMS["5x8"].outside * INCH, 0);
  });

  it("le grand fond suit le nombre de pages", () => {
    const short = layoutPaperback(book(1, 2), options(), strings, metrics, 24);
    expect(short.gutter).toBe(gutterFor(short.pages.length));
    const long = layoutPaperback(book(20, 40), options(), strings, metrics, 24);
    expect(long.pages.length).toBeGreaterThan(150);
    expect(long.gutter).toBe(gutterFor(long.pages.length));
  });

  it("texte justifié : une ligne pleine finit au bord de la colonne", () => {
    const layout = layoutPaperback(book(1, 4), options({ dropCap: false }), strings, metrics);
    const page = layout.pages[layout.entries[0].page];
    const size = KDP_TRIMS["5x8"].size;
    const rows = new Map<number, { x: number; end: number }>();
    for (const t of page.texts.filter((x) => x.size === size && !x.muted)) {
      const r = rows.get(t.y) ?? { x: t.x, end: 0 };
      r.end = Math.max(r.end, t.x + metrics.width(t.text, t.font, t.size));
      rows.set(t.y, r);
    }
    const right = layout.width - KDP_TRIMS["5x8"].outside * INCH;
    const full = [...rows.values()].filter((r) => Math.abs(r.end - right) < 0.5);
    expect(full.length).toBeGreaterThan(3);
  });

  it("veuves et orphelines : jamais une ligne seule d'un paragraphe en haut ou en bas de page", () => {
    const layout = layoutPaperback(book(3, 25), options({ dropCap: false }), strings, metrics);
    const size = KDP_TRIMS["5x8"].size;
    // Chaque paragraphe fait plusieurs lignes : la première ligne d'une page qui continue un paragraphe
    // (sans alinéa) est suivie d'au moins une autre ligne du même paragraphe.
    for (const p of layout.pages.filter((x) => x.role === "story" && !x.opening)) {
      const ys = [...new Set(p.texts.filter((t) => t.size === size && !t.muted).map((t) => t.y))].sort((a, b) => a - b);
      expect(ys.length === 0 || ys.length >= 2).toBe(true);
    }
  });

  it("lettrine sur deux lignes au début d'un chapitre", () => {
    const layout = layoutPaperback(book(1, 2), options(), strings, metrics);
    const page = layout.pages[layout.entries[0].page];
    const cap = page.texts.find((t) => t.size > KDP_TRIMS["5x8"].size * 2);
    expect(cap?.text).toBe("L");
  });

  it("page de copyright par défaut avec mention de fiction et ISBN", () => {
    const layout = layoutPaperback(book(1, 1), options({ isbn: "978-2-1234-5678-9" }), strings, metrics);
    const all = layout.pages[1].texts.map((t) => t.text).join(" ");
    expect(all).toContain("2026");
    expect(all).toContain("Morvan");
    expect(all).toContain("fiction.");
    expect(all).toContain("978-2-1234-5678-9");
    const own = layoutPaperback({ ...book(1, 1), sections: [{ kind: "page", page: "copyright", title: "", blocks: [{ kind: "paragraph", runs: [{ text: "© Éditions du Phare" }] }] }, ...book(1, 1).sections] }, options(), strings, metrics);
    expect(own.pages[1].texts.map((t) => t.text).join(" ")).toContain("Phare");
    expect(own.pages[1].texts.map((t) => t.text).join(" ")).not.toContain("fiction");
  });

  it("sommaire avec les numéros de page", () => {
    const layout = layoutPaperback(book(3, 10), options({ toc: true }), strings, metrics);
    const tocPage = layout.pages.find((p) => p.texts.some((t) => t.text === "TABLE DES MATIÈRES"))!;
    expect(tocPage).toBeTruthy();
    for (const e of layout.entries.filter((x) => x.title.startsWith("Chapitre"))) {
      expect(tocPage.texts.some((t) => t.text === String(layout.pages[e.page].folio))).toBe(true);
    }
  });

  it("pages de fin : mot au lecteur avec les liens, puis « Du même auteur »", () => {
    const layout = layoutPaperback(book(1, 2), options({ thanks: true, website: "kerlaouen.fr", alsoBy: "Le Phare\nLa Lande" }), strings, metrics);
    const titles = layout.entries.map((e) => e.title);
    expect(titles.slice(-3)).toEqual(["Merci de votre lecture", "Remerciements", "Du même auteur"]);
    const note = layout.pages[layout.entries[layout.entries.length - 3].page].texts.map((t) => t.text).join(" ");
    expect(note).toContain("kerlaouen.fr");
    expect(note).toContain("Kerlaouen");
    expect(layout.pages[layout.entries[layout.entries.length - 3].page].recto).toBe(true);
  });
});

describe("gabarit de couverture", () => {
  it("largeur : deux plats, le dos et le fond perdu", () => {
    const cover = coverLayout("6x9", "white", 300);
    expect(cover.width / INCH).toBeCloseTo(0.125 * 2 + 12 + 300 * 0.002252);
    expect(cover.height / INCH).toBeCloseTo(9.25);
    expect(cover.spine.width / INCH).toBeCloseTo(0.6756);
    expect(cover.spineText).toBe(true);
    expect(coverLayout("5x8", "cream", 60).spineText).toBe(false);
    expect(coverLayout("5x8", "cream", 79).spineText).toBe(false);
    expect(coverLayout("5x8", "cream", 80).spineText).toBe(true);
    // Le code-barres est au dos, en bas à droite, à un quart de pouce des bords.
    expect(cover.barcode.x + cover.barcode.width).toBeCloseTo(cover.back.x + cover.back.width - 0.25 * INCH);
  });
});

describe("livre broché d'un livre-jeu (sections à la suite)", () => {
  const gamebook = (count: number, paras: number): BookDoc => ({
    title: "Le Puits",
    author: "Inès Morvan",
    lang: "fr",
    year: 2026,
    sections: [
      { kind: "chapter", label: "", title: "Avant de commencer", toc: "Avant de commencer", blocks: [para()] },
      ...Array.from({ length: count }, (_, i) => ({
        kind: "chapter" as const,
        label: "",
        title: String(i + 1),
        toc: String(i + 1),
        section: i + 1,
        blocks: [...Array.from({ length: paras }, () => para()), { kind: "paragraph" as const, runs: [{ text: `Si tu descends : rendez-vous au ${((i + 1) % count) + 1}.` }] }],
      })),
    ],
  });
  const options: PrintOptions = { ...DEFAULT_PRINT, toc: true };

  it("fait suivre les sections sur la page, chacune sous son numéro en gras", () => {
    const layout = layoutPaperback(gamebook(12, 1), options, strings, metrics);
    const opening = layout.pages.findIndex((p) => p.texts.some((t) => t.text === "1" && t.font === "bold" && t.size > 12));
    expect(opening).toBeGreaterThan(0);
    // Plusieurs sections sur la même page : pas une belle page par section.
    const numbersOn = (i: number) => layout.pages[i].texts.filter((t) => t.font === "bold" && /^\d+$/.test(t.text) && t.y > INCH).map((t) => t.text);
    expect(numbersOn(opening).length).toBeGreaterThan(1);
    // Douze sections courtes tiennent dans bien moins de douze pages.
    const storyPages = layout.pages.filter((p) => p.role === "story").length;
    expect(storyPages).toBeLessThan(12);
  });

  it("dit sur quelles pages tombe chaque section (lot 13)", () => {
    const short = layoutPaperback(gamebook(12, 1), options, strings, metrics);
    const spans = short.sections!;
    expect(Object.keys(spans).map(Number).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // Plusieurs sections courtes sur une page : la 1 et la 2 commencent sur la même.
    expect(spans[2][0]).toBe(spans[1][0]);
    const long = layoutPaperback(gamebook(3, 14), options, strings, metrics).sections!;
    expect(long[1][1]).toBeGreaterThan(long[1][0]);
    expect(long[2][0]).toBeGreaterThanOrEqual(long[1][1]);
  });

  it("rappelle en haut de page les numéros des sections qu'on y lit", () => {
    const layout = layoutPaperback(gamebook(12, 1), options, strings, metrics);
    const heads = layout.pages.map((p) => p.texts.find((t) => t.y < INCH && t.font === "bold")?.text).filter(Boolean);
    expect(heads.length).toBeGreaterThan(0);
    expect(heads[0]).toMatch(/^1(–\d+)?$/);
  });

  it("une section longue sur deux pages : la page suivante commence par son numéro", () => {
    const layout = layoutPaperback(gamebook(3, 14), options, strings, metrics);
    const heads = layout.pages.map((p) => p.texts.find((t) => t.y < INCH && t.font === "bold")?.text).filter(Boolean);
    expect(heads).toContain("1");
    expect(heads.some((h) => /^1–2$/.test(h!))).toBe(true);
  });

  it("le sommaire ne liste pas les sections numérotées", () => {
    const layout = layoutPaperback(gamebook(5, 1), options, strings, metrics);
    const tocPage = layout.pages.find((p) => p.texts.some((t) => t.text.startsWith("TABLE")));
    const lines = tocPage?.texts.map((t) => t.text) ?? [];
    expect(lines).toContain("Avant");
    expect(lines.filter((x) => x === "4" || x === "5")).toHaveLength(0);
  });
});

describe("images du livre broché", () => {
  const img = (width: number, height: number) => ({ data: new Uint8Array(), width, height });
  const withImage = (image: Block, images = { a: img(1600, 1200) }): BookDoc => {
    const b = book(1, 6);
    const chapter = b.sections[1] as Extract<BookDoc["sections"][number], { kind: "chapter" }>;
    return { ...b, images, sections: [b.sections[0], { ...chapter, blocks: [para(3), image, ...chapter.blocks] }, b.sections[2]] };
  };
  const placed = (layout: ReturnType<typeof layoutPaperback>) => layout.pages.flatMap((p, i) => (p.images ?? []).map((im) => ({ ...im, page: i, plate: !!p.plate })));

  it("image dans le texte : sur la largeur du texte au plus, proportions gardées", () => {
    const layout = layoutPaperback(withImage({ kind: "image", name: "a" }), options(), strings, metrics);
    const [im] = placed(layout);
    expect(im).toBeDefined();
    expect(im.plate).toBe(false);
    expect(im.width / im.height).toBeCloseTo(4 / 3, 3);
    // Pas plus large qu'une ligne pleine du texte.
    const lines = layout.pages[im.page].texts.filter((x) => x.y > INCH);
    const right = Math.max(...lines.map((x) => x.x + metrics.width(x.text, x.font, x.size)));
    expect(im.x).toBeGreaterThanOrEqual(Math.min(...lines.map((x) => x.x)) - 0.01);
    expect(im.x + im.width).toBeLessThanOrEqual(right + 0.5);
    // Le texte qui suit passe sous l'image.
    const below = layout.pages[im.page].texts.filter((x) => x.y > im.y + im.height);
    expect(below.length).toBeGreaterThan(0);
  });

  it("une petite image n'est pas agrandie au-delà de 150 points par pouce", () => {
    const layout = layoutPaperback(withImage({ kind: "image", name: "a" }, { a: img(150, 150) }), options(), strings, metrics);
    expect(placed(layout)[0].width).toBeCloseTo(INCH, 3);
  });

  it("image en pleine page : la page suivante, sans folio ni titre courant, avec sa légende", () => {
    const layout = layoutPaperback(withImage({ kind: "image", name: "a", alt: "Le phare sous l’orage", place: "page" }), options(), strings, metrics);
    const [im] = placed(layout);
    expect(im.plate).toBe(true);
    const plate = layout.pages[im.page];
    expect(plate.texts.every((x) => x.y > im.y)).toBe(true);
    expect(plate.texts.map((x) => x.text).join(" ")).toContain("phare");
    expect(plate.folio).toBeGreaterThan(0);
    // Le texte cité avant l'image continue sur la page d'avant, sans blanc : la page précédente est pleine.
    const before = layout.pages[im.page - 1];
    expect(before.role).toBe("story");
    expect(Math.max(...before.texts.map((x) => x.y))).toBeGreaterThan(KDP_TRIMS[DEFAULT_PRINT.trim].height * INCH * 0.8);
  });

  it("une image absente est ignorée", () => {
    const layout = layoutPaperback(withImage({ kind: "image", name: "b" }), options(), strings, metrics);
    expect(placed(layout)).toHaveLength(0);
  });

  it("livre-jeu : la légende d'une illustration commence par le numéro de sa section", () => {
    const doc: BookDoc = {
      title: "Le Puits",
      author: "",
      lang: "fr",
      year: 2026,
      images: { a: img(800, 1200) },
      sections: [1, 2, 3].map((n) => ({ kind: "chapter" as const, label: "", title: String(n), toc: String(n), section: n, blocks: [para(), ...(n === 2 ? [{ kind: "image" as const, name: "a", alt: "Le puits", place: "page" as const }] : []), para()] })),
    };
    const layout = layoutPaperback(doc, options(), strings, metrics);
    const [im] = placed(layout);
    const caption = layout.pages[im.page].texts;
    expect(caption.find((x) => x.font === "bold")?.text).toBe("2");
    // Pas de rappel des sections en haut d'une illustration.
    expect(caption.every((x) => x.y > INCH)).toBe(true);
  });
});
