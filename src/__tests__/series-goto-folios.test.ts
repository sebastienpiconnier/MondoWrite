// @vitest-environment node
// Série : « Aller à » nomme les saisons ; le PDF du scénario numérote toutes ses pages, la première aussi.

import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import { screenplayPlaces, type GoLabels } from "../goto";
import { buildPdf } from "../screenplay/export/pdf";
import { seriesBooks } from "../screenplay/series";
import { LAYOUTS } from "../screenplay/layout";
import { readPdfText } from "../pdfDocument";

const meta = import.meta as unknown as { resolve: (s: string) => string };
pdfjs.GlobalWorkerOptions.workerSrc = meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

const section = (depth: number, text: string): ScreenplayElement => ({ type: "section", depth, text });
const sc = (text: string, cardId: string): ScreenplayElement => ({ type: "sceneHeading", text, cardId });
const sp: Screenplay = {
  titlePage: { Title: "Le Manoir" },
  elements: [
    section(1, "Saison 1 [[cosmos:season:sa1]]"),
    section(2, "[[cosmos:episode:e1]]"),
    sc("INT. MANOIR - JOUR", "s1"),
    section(2, "La fin des haricots [[cosmos:episode:e2]]"),
    section(1, " [[cosmos:season:sa2]]"),
    section(2, "[[cosmos:episode:e3]]"),
    { type: "synopsis", text: "Mon synopsis" },
    sc("INT. BALCON - AUBE", "s2"),
  ],
};
const labels: GoLabels = {
  page: "Page {n}",
  untitledScene: "Scène sans titre",
  chapter: (n) => `Chapitre ${n}`,
  episode: (n, title) => `Ép. ${n} · ${title || "Épisode sans titre"}`,
  season: (n, title) => title || `Saison ${n}`,
};

describe("« Aller à » dans une série", () => {
  it("chaque saison est un endroit, et chaque épisode dit sa saison", () => {
    const { targets } = screenplayPlaces(sp.elements, sp.elements.map(() => 1), 1, labels);
    expect(targets.filter((t) => t.kind === "season").map((t) => t.label)).toEqual(["Saison 1", "Saison 2"]);
    const eps = targets.filter((t) => t.kind === "episode");
    expect(eps.map((t) => t.detail)).toEqual(["Saison 1", "Saison 1", "Saison 2 · Mon synopsis"]);
    expect(targets.map((t) => t.kind)).toEqual(["season", "episode", "scene", "episode", "season", "episode", "scene"]);
  });

  it("hors d'une série, rien ne change", () => {
    const { targets } = screenplayPlaces([sc("INT. A - JOUR", "a")], [1], 1, labels);
    expect(targets.map((t) => t.kind)).toEqual(["scene"]);
  });
});

describe("numéros de page du PDF", () => {
  const options = { layout: LAYOUTS.letter, locale: "fr", strings: { more: "(À SUIVRE)", contd: "(SUITE)" }, titlePage: false };
  const folio = (page: { items: { text: string; y: number }[] }) => page.items.filter((i) => /^\d+\.$/.test(i.text.trim()) && i.y < 60).map((i) => i.text.trim());

  it("la première page porte « 1. », les suivantes leur numéro", async () => {
    const long: Screenplay = { titlePage: {}, elements: Array.from({ length: 90 }, (_, i) => ({ type: "action" as const, text: `Ligne ${i} avec assez de texte pour remplir.` })) };
    const pages = await readPdfText(await buildPdf(long, options));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.map(folio)).toEqual(pages.map((_, i) => [`${i + 1}.`]));
  }, 30000);

  it("série : chaque épisode repart de 1", async () => {
    const books = seriesBooks(sp, null, new Map([["e1", "Ép. 1"], ["e2", "Ép. 2"], ["e3", "Ép. 1"], ["sa1", "Saison 1"], ["sa2", "Saison 2"]]))!;
    const pages = await readPdfText(await buildPdf(sp, { ...options, books }));
    expect(pages.map(folio)).toEqual(pages.map(() => ["1."]));
  }, 30000);
});
