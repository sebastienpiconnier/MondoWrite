// @vitest-environment happy-dom
// Série, fin du lot 3 : une page de titre par épisode dans le PDF de toute la série, et « Mes gabarits » posés
// épisode par épisode.

import { beforeEach, describe, expect, it } from "vitest";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import { episodeScript, seriesBooks } from "../screenplay/series";
import { currentTemplate, customOf } from "../screenplay/template";
import { buildPdf } from "../screenplay/export/pdf";
import { LAYOUTS } from "../screenplay/layout";
import { EMPTY_PLAN } from "../plan";
import { useCosmos } from "../store";
import { useSettings } from "../settings";

const section = (depth: number, text: string): ScreenplayElement => ({ type: "section", depth, text });
const sc = (text: string, cardId: string): ScreenplayElement => ({ type: "sceneHeading", text, cardId });

const sp: Screenplay = {
  titlePage: { Title: "Le Phare", Author: "Inès" },
  elements: [
    sc("INT. BUREAU - JOUR", "s0"),
    section(1, "Saison 1 [[cosmos:season:sa1]]"),
    section(2, "Le signal [[cosmos:episode:e1]]"),
    { type: "synopsis", text: "Inès entend un signal." },
    sc("INT. PHARE - NUIT", "s1"),
    section(2, "Tempête [[cosmos:episode:e2]]"),
    sc("EXT. PORT - JOUR", "s2"),
    section(1, "Saison 2 [[cosmos:season:sa2]]"),
    section(2, "Retour [[cosmos:episode:e3]]"),
    sc("INT. CUISINE - SOIR", "s3"),
  ],
};
const labels = new Map([
  ["sa1", "Saison 1"],
  ["sa2", "Saison 2"],
  ["e1", "Ép. 1 · Le signal"],
  ["e2", "Ép. 2 · Tempête"],
  ["e3", "Ép. 1 · Retour"],
]);

describe("une page de titre par épisode", () => {
  it("toute la série : ce qui précède, puis chaque épisode avec sa saison", () => {
    const books = seriesBooks(sp, null, labels)!;
    expect(books.map((b) => b.titlePage.Title)).toEqual([
      "Le Phare",
      "Le Phare\nSaison 1\nÉp. 1 · Le signal",
      "Le Phare\nSaison 1\nÉp. 2 · Tempête",
      "Le Phare\nSaison 2\nÉp. 1 · Retour",
    ]);
    expect(books[1].elements.map((e) => e.text)).toEqual(["INT. PHARE - NUIT"]);
    expect(books[1].titlePage.Author).toBe("Inès");
  });

  it("une saison : ses épisodes seulement ; un épisode ou hors série : rien à découper", () => {
    const season = seriesBooks(sp, "sa2", labels)!;
    expect(season.map((b) => b.titlePage.Title)).toEqual(["Le Phare\nSaison 2\nÉp. 1 · Retour"]);
    expect(seriesBooks(sp, "e1", labels)).toBeNull();
    expect(seriesBooks({ titlePage: {}, elements: [sc("INT. A - JOUR", "a")] }, null, labels)).toBeNull();
    // Une seule saison : pas de nom de saison sur la page de titre de toute la série.
    const one: Screenplay = { titlePage: { Title: "X" }, elements: sp.elements.slice(1, 7) };
    expect(seriesBooks(one, null, labels)!.map((b) => b.titlePage.Title)).toEqual(["X\nÉp. 1 · Le signal", "X\nÉp. 2 · Tempête"]);
  });

  it("le PDF a autant de pages de titre que d'épisodes", async () => {
    const options = { layout: LAYOUTS.letter, locale: "fr", strings: { more: "(À SUIVRE)", contd: "(SUITE)" } };
    const { PDFDocument } = await import("pdf-lib");
    const single = await PDFDocument.load(await buildPdf(sp, options));
    const split = await PDFDocument.load(await buildPdf(sp, { ...options, books: seriesBooks(sp, null, labels)! }));
    expect(single.getPageCount()).toBe(2); // une page de titre, une page de texte
    expect(split.getPageCount()).toBe(8); // quatre parties, chacune page de titre et texte
  });
});

describe("« Mes gabarits » épisode par épisode", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await useCosmos.getState().start();
    await useCosmos.getState().createProject({ title: "Le Phare", kind: "scenario" });
    useCosmos.setState({ screenplay: sp, currentEpisode: null });
  });

  it("les cases de l'auteur se posent dans l'épisode choisi, sous lui, et se renomment sur place", () => {
    const s = useCosmos.getState;
    s().setCustomTemplate("Mon épisode", [{ label: "Ouverture" }, { label: "Bascule" }], "e2");
    const e2 = episodeScript(s().screenplay!, "e2").elements;
    expect(currentTemplate(e2)).toBe("perso");
    expect(customOf(e2)?.beats.map((b) => b.label)).toEqual(["Ouverture", "Bascule"]);
    expect(e2.filter((e) => e.type === "section").every((e) => e.depth === 3)).toBe(true);
    expect(currentTemplate(episodeScript(s().screenplay!, "e1").elements)).toBeNull();
    // Renommer une case garde sa clé et sa place.
    const beats = customOf(e2)!.beats;
    s().setCustomTemplate("Mon épisode", [{ key: beats[0].key, label: "Accroche" }, { key: beats[1].key, label: "Bascule" }], "e2");
    expect(customOf(episodeScript(s().screenplay!, "e2").elements)?.beats.map((b) => b.label)).toEqual(["Accroche", "Bascule"]);
    // Annulable.
    s().undo();
    expect(customOf(episodeScript(s().screenplay!, "e2").elements)?.beats[0].label).toBe("Ouverture");
  });

  it("sans épisode choisi, l'épisode ouvert reçoit le gabarit", () => {
    useCosmos.setState({ currentEpisode: "e3" });
    useCosmos.getState().setCustomTemplate("Court", [{ label: "Tout" }]);
    expect(currentTemplate(episodeScript(useCosmos.getState().screenplay!, "e3").elements)).toBe("perso");
    expect(currentTemplate(episodeScript(useCosmos.getState().screenplay!, "e1").elements)).toBeNull();
  });
});
