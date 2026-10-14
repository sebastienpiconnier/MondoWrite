// Import d'un fichier Fountain : projet scénario, cartes Scène, Personnage et Décor.

import { describe, expect, it } from "vitest";
import { importFountain, type ImportOptions } from "../import";
import { headingTitles } from "../link";
import { serialize } from "../serialize";
import { buildFdx } from "../export/fdx";
import { typeset } from "../export/typeset";
import { LAYOUTS } from "../layout";
import { parse } from "../parse";
import courtFr from "./fixtures/court-fr.fountain?raw";
import torture from "./fixtures/torture.fountain?raw";

const options = (): ImportOptions => {
  let n = 0;
  return { fileName: "mon-film.fountain", locale: "fr", linkLabel: "se passe à", newId: () => `id${++n}` };
};
const byType = (project: ReturnType<typeof importFountain>, type: string) =>
  project.cards.filter((c) => c.type === type).map((c) => c.title);

describe("import d'un fichier Fountain", () => {
  it("fixture française : un projet scénario avec ses cartes", () => {
    const project = importFountain(courtFr, options());
    expect(project.meta).toMatchObject({ version: 1, title: "Le Phare des Absents", kind: "scenario" });
    expect(byType(project, "scene")).toEqual(["INT. PHARE, LANTERNE - NUIT", "EXT. ÎLOT - AUBE"]);
    expect(byType(project, "personnage")).toEqual(["Inès", "Hugo"]);
    expect(byType(project, "lieu")).toEqual(["Phare, Lanterne", "Îlot"]);
    // Rien d'autre : pas de carte pour l'action ou les transitions.
    expect(project.cards).toHaveLength(6);
  });

  it("chaque en-tête est relié à sa carte, y compris s'il portait le lien d'un autre projet", () => {
    const project = importFountain(courtFr, options());
    const scenes = project.cards.filter((c) => c.type === "scene");
    expect([...headingTitles(project.screenplay!)]).toEqual(scenes.map((c) => [c.id, c.title]));
    expect(serialize(project.screenplay!)).not.toContain("k3x9a7bq2m");
    expect(serialize(project.screenplay!)).toContain(`INT. PHARE, LANTERNE - NUIT [[cosmos:${scenes[0].id}]]`);
  });

  it("le texte du scénario est gardé tel quel, liens mis à part", () => {
    const project = importFountain(courtFr, options());
    const strip = (text: string) => text.replace(/ \[\[cosmos:[^\]]+\]\]/g, "");
    expect(strip(serialize(project.screenplay!))).toBe(strip(courtFr.replace(/\r\n/g, "\n")));
  });

  it("un fil « se passe à » relie chaque scène à son décor ; un décor n'a qu'une carte", () => {
    const source = "INT. PHARE - NUIT\n\nUn.\n\nEXT. PORT - JOUR\n\nDeux.\n\nint. phare - aube\n\nTrois.\n";
    const project = importFountain(source, options());
    const id = (title: string) => project.cards.find((c) => c.title === title)!.id;
    expect(byType(project, "lieu")).toEqual(["Phare", "Port"]);
    expect(project.meta.links.map(({ source: s, target, label }) => [s, target, label])).toEqual([
      [id("INT. PHARE - NUIT"), id("Phare"), "se passe à"],
      [id("EXT. PORT - JOUR"), id("Port"), "se passe à"],
      [id("int. phare - aube"), id("Phare"), "se passe à"],
    ]);
  });

  it("personnages : une carte par nom, sans extension ni doublon", () => {
    const source = "INT. A - JOUR\n\nHUGO (V.O.)\nUn.\n\nINÈS\nDeux.\n\nHUGO (CONT'D)\nTrois.\n\n@McAvoy\nQuatre.\n";
    expect(byType(importFountain(source, options()), "personnage")).toEqual(["Hugo", "Inès", "Mcavoy"]);
  });

  it("fichier torture : en-tête libre sans décor, synopsis gardé dans le scénario (c'est celui de la carte)", () => {
    const project = importFountain(torture, options());
    expect(project.meta.title).toBe("TORTURE ou l’art d’éprouver un parseur");
    expect(byType(project, "scene")).toHaveLength(4);
    // « INTÉRIEUR. CUISINE… » n'a pas de préfixe standard : pas de carte Décor pour lui.
    expect(byType(project, "lieu")).toEqual(["Voiture", "Quai", "Péniche"]);
    const withSynopsis = importFountain("INT. PHARE - NUIT\n\n= Elle trouve le journal & doute.\n\nAction.\n", options());
    expect(withSynopsis.cards.find((c) => c.type === "scene")!.html).toBe("");
    expect(withSynopsis.screenplay!.elements[1]).toEqual({ type: "synopsis", text: "Elle trouve le journal & doute." });
  });

  it("titre : la page de titre, sinon le nom du fichier", () => {
    expect(importFountain("INT. A - JOUR\n\nAction.\n", options()).meta.title).toBe("mon-film");
    expect(importFountain("Title: Kerlaouen\n\nINT. A - JOUR\n", options()).meta.title).toBe("Kerlaouen");
  });

  it("cartes rangées sur le canevas : personnages, décors, puis scènes, sans chevauchement", () => {
    const project = importFountain(courtFr, options());
    const at = (title: string) => {
      const card = project.cards.find((c) => c.title === title)!;
      return project.meta.layout.find((l) => l.id === card.id)!;
    };
    expect(at("Inès")).toMatchObject({ x: 80, y: 80 });
    expect(at("Hugo")).toMatchObject({ x: 360, y: 80 });
    expect(at("Phare, Lanterne").y).toBe(280);
    expect(at("INT. PHARE, LANTERNE - NUIT").y).toBe(480);
    const spots = project.meta.layout.map((l) => `${l.x},${l.y}`);
    expect(new Set(spots).size).toBe(spots.length);
    expect(project.meta.layout).toHaveLength(project.cards.length);
  });

  it("fichier sans scénario : aucun élément", () => {
    expect(importFountain("", options()).screenplay!.elements).toEqual([]);
  });
});

describe("numéros de scène (option)", () => {
  const { elements } = parse("INT. A - JOUR\n\nUn.\n\nEXT. B - NUIT #12A#\n\nDeux.\n\nINT. C - JOUR\n\nTrois.\n");
  const strings = { more: "(À SUIVRE)", contd: "(SUITE)" };
  const margins = (numberScenes: boolean) =>
    typeset(elements, LAYOUTS.letter, "fr", strings, { numberScenes })
      .flatMap((page) => page.lines)
      .filter((line) => line.column < 0)
      .map((line) => line.text);

  it("PDF : numéros dans la marge, le numéro écrit dans le fichier passe devant", () => {
    expect(margins(true)).toEqual(["1", "12A", "3"]);
    expect(margins(false)).toEqual(["12A"]);
  });

  it("FDX : attribut Number", () => {
    const numbers = (fdx: string) => [...fdx.matchAll(/Number="([^"]+)"/g)].map((m) => m[1]);
    expect(numbers(buildFdx({ titlePage: {}, elements }, "fr", true))).toEqual(["1", "12A", "3"]);
    expect(numbers(buildFdx({ titlePage: {}, elements }, "fr"))).toEqual(["12A"]);
  });
});
