// @vitest-environment happy-dom
// Export du canevas : texte par cadres dans l'ordre de lecture, taille de l'image selon la qualité.

import { describe, expect, it } from "vitest";
import { canvasBounds, canvasDoc, imageSize, readingOrder } from "../export/canvas";
import { toMarkdown } from "../export/text";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string, html = ""): CardData => ({ id, type, title, html });
const box = (x: number, y: number, width = 240, height = 120) => ({ x, y, width, height });
const strings = {
  types: { idee: "Idée", personnage: "Personnage", lieu: "Lieu", scene: "Scène", intrigue: "Intrigue", theme: "Thème", question: "Question", image: "Image", lien: "Lien", document: "Document", episode: "Épisode", groupe: "Groupe", objet: "Objet", evenement: "Événement", regle: "Règle", secret: "Secret" },
  untitled: "Sans titre",
  loose: "Hors cadre",
  untitledFrame: "Cadre sans nom",
  linkedTo: "Relié à",
  fields: { role: "Rôle" },
  arcTypes: {},
};

describe("export du canevas", () => {
  it("ordre de lecture : par rangées, puis de gauche à droite", () => {
    const items = [box(500, 10), box(0, 300), box(0, 0), box(260, 30)];
    expect(readingOrder(items, (b) => b).map((b) => `${b.x},${b.y}`)).toEqual(["0,0", "260,30", "500,10", "0,300"]);
  });

  it("un cadre = une partie (avec le nom du cadre qui l'englobe), les cartes hors cadre à la fin", () => {
    const cards = [
      { card: { ...card("p", "personnage", "Inès", "<p>Gardienne.</p>"), fiche: { role: "Héroïne" } }, box: box(40, 60) },
      { card: card("s", "scene", "Arrivée"), box: box(1040, 60) },
      { card: card("i", "idee", "", "<p>Un phare ?</p>"), box: box(3000, 3000) },
    ];
    const frames = [
      { id: "f1", title: "Personnages", box: box(0, 0, 600, 300) },
      { id: "f2", title: "Acte I", box: box(1000, 0, 800, 400) },
      { id: "f3", title: "Chapitre 1", box: box(1020, 40, 400, 300) },
      { id: "f4", title: "Vide", box: box(0, 900, 300, 300) },
    ];
    const doc = canvasDoc({ title: "Phare, canevas", author: "", lang: "fr" }, cards, frames, [{ source: "p", target: "s", label: "arrive" }], strings);
    expect(doc.chapters.map((c) => c.title)).toEqual(["Personnages", "Acte I › Chapitre 1", "Hors cadre"]);
    const md = toMarkdown(doc);
    expect(md).toContain("### Inès\n\n*Personnage*\n\n**Rôle :** Héroïne\n\nGardienne.");
    expect(md).toContain("*Relié à :* Arrivée (arrive)");
    expect(md).toContain("### Sans titre\n\n*Idée*\n\nUn phare ?");
  });

  it("taille de l'image : bornée par le côté le plus long et la surface, jamais plus de 3 pixels par unité", () => {
    const bounds = canvasBounds([box(0, 0, 1000, 500), box(-200, 100, 240, 120)])!;
    expect(bounds).toEqual({ x: -200, y: 0, width: 1200, height: 500 });
    const small = imageSize(bounds, "standard");
    expect(Math.max(small.width, small.height)).toBeLessThanOrEqual(3200);
    expect(small.scale).toBeLessThanOrEqual(3);
    const large = imageSize({ x: 0, y: 0, width: 20000, height: 8000 }, "large");
    expect(large.width * large.height).toBeLessThanOrEqual(40_000_000 + 20000);
    expect(large.width).toBeGreaterThan(imageSize({ x: 0, y: 0, width: 20000, height: 8000 }, "standard").width);
    expect(canvasBounds([])).toBeNull();
  });
});
