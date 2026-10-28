// @vitest-environment node
// Import d'un PDF : les lignes et leurs retraits (fonctions pures), puis des PDF fabriqués par MondoWrite lui-même
// (scénario, manuscrit, manuscrit au format Shunn, livre broché) relus par pdf.js : on doit retrouver le texte.

import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import chaperon from "../../docs/guide/exemples/chaperon.fountain?raw";
import { parse } from "../screenplay/parse";
import { buildPdf } from "../screenplay/export/pdf";
import { LAYOUTS } from "../screenplay/layout";
import { buildProsePdf } from "../export/pdf";
import { preparePaperback } from "../export/paperbackPdf";
import { DEFAULT_PRINT } from "../export/printOptions";
import { readPdfText } from "../pdfDocument";
import { looksLikeScreenplayPdf, novelFromPdf, pdfLines, screenplayFromPdf, unspace, type PdfPageText } from "../import/pdf";
import { chapterize } from "../import/manuscript";
import type { ScreenplayElement } from "../screenplay/model";

// Hors navigateur, pdf.js charge son worker depuis node_modules.
const meta = import.meta as unknown as { resolve: (s: string) => string };
pdfjs.GlobalWorkerOptions.workerSrc = meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

const strings = { more: "(À SUIVRE)", contd: "(SUITE)" };
const printed = (els: ScreenplayElement[]) => els.filter((e) => !["synopsis", "note", "section"].includes(e.type)).map((e) => [e.type, e.text]);

describe("lignes d'une page", () => {
  it("bouts regroupés par ligne, un grand blanc fait un morceau à part", () => {
    const page: PdfPageText = {
      width: 612,
      height: 792,
      items: [
        { x: 60, y: 100, width: 14, size: 12, text: "12" },
        { x: 108, y: 100, width: 72, size: 12, text: "INT. PHARE" },
        { x: 180, y: 100.4, width: 50, size: 12, text: " - NUIT" },
        { x: 108, y: 124, width: 30, size: 12, text: "Le" },
        { x: 142, y: 124, width: 30, size: 12, text: "vent." },
      ],
    };
    const lines = pdfLines(page, 7.2);
    expect(lines.map((l) => l.segments.map((s) => s.text))).toEqual([["12", "INT. PHARE - NUIT"], ["Le vent."]]);
  });

  it("texte espacé lettre à lettre recollé", () => {
    expect(unspace("C H A P I T R E 2")).toBe("CHAPITRE 2");
    expect(unspace("Il a dit")).toBe("Il a dit");
  });
});

describe("scénario en PDF", () => {
  it("le projet d'exemple : page de titre et tous les éléments", async () => {
    const sp = parse(chaperon);
    const bytes = await buildPdf(sp, { layout: LAYOUTS.a4, locale: "fr", strings, numberScenes: false, underlineHeadings: false, titlePage: true });
    const pages = await readPdfText(bytes);
    expect(looksLikeScreenplayPdf(pages)).toBe(true);
    const out = screenplayFromPdf(pages);
    expect(out.titlePage.Title).toBe("Le Petit Chaperon rouge");
    expect(out.titlePage.Author).toContain("Charles Perrault");
    expect(printed(out.elements)).toEqual(printed(sp.elements));
  }, 30000);

  it("répliques coupées par la page, (SUITE) et numéros de scène retirés du texte", async () => {
    const speech = (k: number) => Array.from({ length: 6 }, (_, j) => `Phrase ${j} de la réplique ${k}, assez longue pour passer à la ligne.`).join(" ");
    const long = Array.from({ length: 12 }, (_, k) =>
      [`INT. PIÈCE ${k} - NUIT`, `Action ${k} qui dure assez longtemps pour remplir une ligne entière de texte et même un peu plus.`, `HUGO\n${speech(k)}`, "Le vent souffle.", `HUGO\n(bas)\nEncore ${k}.`, "CUT TO:"].join("\n\n"),
    ).join("\n\n");
    const sp = parse(long);
    const bytes = await buildPdf(sp, { layout: LAYOUTS.letter, locale: "fr", strings, numberScenes: true, underlineHeadings: false, titlePage: false, resumes: true });
    const out = screenplayFromPdf(await readPdfText(bytes));
    expect(printed(out.elements)).toEqual(printed(sp.elements));
    expect(out.elements.find((e) => e.type === "sceneHeading")?.sceneNumber).toBe("1");
  }, 30000);
});

describe("roman en PDF", () => {
  const words = ["la", "forêt", "était", "sombre", "et", "le", "vent", "soufflait", "entre", "les", "arbres", "anciens", "pendant", "qu’elle", "marchait", "vers", "maison"];
  const sentence = (seed: number, n: number) => {
    const w = Array.from({ length: n }, (_, i) => words[(seed * 7 + i * 3) % words.length]);
    return `${w[0][0].toUpperCase()}${w.join(" ").slice(1)}.`;
  };
  const para = (seed: number) => Array.from({ length: 1 + (seed % 4) }, (_, i) => sentence(seed + i, 8 + ((seed + i) % 12))).join(" ");
  const chapters = [1, 2, 3].map((c) => ({ title: `Chapitre ${c}`, blocks: Array.from({ length: 12 }, (_, k) => ({ kind: "paragraph" as const, runs: [{ text: para(c * 31 + k) }] })) }));
  const source = chapters.flatMap((c) => c.blocks.map((b) => b.runs[0].text));

  it("manuscrit et format Shunn : tous les paragraphes, trois chapitres", async () => {
    for (const shunn of [false, true]) {
      const doc = { title: "Le Bois", author: "S. P.", lang: "fr", chapters, indent: true, ...(shunn ? { shunn: { running: "P. / LE BOIS", words: "environ 3 000 mots", byline: "par S. P." } } : {}) };
      const pages = await readPdfText(await buildProsePdf(doc, "a4"));
      expect(looksLikeScreenplayPdf(pages)).toBe(false);
      const paras = novelFromPdf(pages);
      for (const text of source) expect(paras.map((p) => p.text)).toContain(text);
      const book = chapterize(paras, "le-bois.pdf");
      expect(book.chapters.filter((c) => c.scenes.flat().length === 12)).toHaveLength(3);
    }
  }, 60000);

  it("livre broché : lettrine, mots coupés, titres courants et folios retirés", async () => {
    const sections = chapters.map((c, i) => ({ kind: "chapter" as const, label: `Chapitre ${i + 1}`, title: i === 1 ? "La tempête" : "", toc: "", blocks: c.blocks }));
    const strs = { copyright: "Copyright © {year} {name}", rights: "Tous droits réservés.", reproduction: "", fiction: "", isbn: "ISBN {isbn}", contents: "Sommaire", thanksTitle: "", thanksText: "", stayInTouch: "", website: "", newsletter: "", alsoBy: "" };
    const prepared = await preparePaperback({ title: "Le Phare", author: "S. P.", lang: "fr", year: 2026, sections }, DEFAULT_PRINT, strs);
    const paras = novelFromPdf(await readPdfText(await prepared.save()));
    for (const text of source) expect(paras.map((p) => p.text)).toContain(text);
    const book = chapterize(paras, "le-phare.pdf");
    expect(book.chapters.map((c) => c.title)).toContain("La tempête");
  }, 60000);
});
