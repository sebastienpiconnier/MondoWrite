// « Aller à » : endroits du scénario et du roman, et ce qui répond à la saisie.

import { describe, expect, it } from "vitest";
import type { ScreenplayElement } from "../screenplay/model";
import { findPlaces, novelPlaces, screenplayPlaces, type GoLabels } from "../goto";
import type { Plan } from "../plan";

const labels: GoLabels = {
  page: "Page {n}",
  untitledScene: "Scène sans titre",
  chapter: (n, title) => (title ? `Chapitre ${n} · ${title}` : `Chapitre ${n}`),
};

describe("Aller à, dans un scénario", () => {
  const elements: ScreenplayElement[] = [
    { type: "sceneHeading", text: "INT. PHARE - NUIT", cardId: "s1" },
    { type: "synopsis", text: "Inès entend la cloche." },
    { type: "action", text: "Le vent." },
    { type: "note", text: "Revoir la fin" },
    { type: "note", text: "cosmos:x1" },
    { type: "sceneHeading", text: "EXT. CÔTE - JOUR" },
    { type: "action", text: "La mer." },
  ];
  const startPage = [1, 1, 1, 1, 1, 2, 2];
  const places = screenplayPlaces(elements, startPage, 2, labels);

  it("scènes numérotées, notes de l'auteur (pas celles de lien), pages", () => {
    expect(places.targets.map((t) => [t.kind, t.label, t.target])).toEqual([
      ["scene", "1. INT. PHARE - NUIT", "s1"],
      ["note", "Revoir la fin", "@3"],
      ["scene", "2. EXT. CÔTE - JOUR", "@5"],
    ]);
    expect(places.pageAt(2)).toBe("@5");
    expect(places.pageAt(3)).toBeNull();
  });

  it("un nombre : la page puis la scène de ce numéro ; un mot : sans casse ni accents", () => {
    expect(findPlaces("2", places, labels).map((t) => t.label)).toEqual(["Page 2", "2. EXT. CÔTE - JOUR"]);
    expect(findPlaces("cote", places, labels).map((t) => t.target)).toEqual(["@5"]);
    expect(findPlaces("cloche", places, labels).map((t) => t.target)).toEqual(["s1"]);
    expect(findPlaces("", places, labels).map((t) => t.kind)).toEqual(["scene", "scene"]);
  });
});

describe("Aller à, dans un roman", () => {
  const plan: Plan = { template: "libre", beats: {}, chapters: [{ id: "c1", title: "Le bois", scenes: ["a", "b"] }] } as Plan;
  const words = (n: number) => `<p>${Array.from({ length: n }, () => "mot").join(" ")}</p>`;
  const manuscript = { a: words(300), b: `${words(10)}<p><mark>la galette</mark></p>`, c: words(5) };
  const titles = new Map([
    ["a", "La galette"],
    ["b", "Le bois"],
    ["c", ""],
  ]);
  const places = novelPlaces(["a", "b", "c"], titles, plan, manuscript, labels);

  it("chapitres, scènes, passages à reprendre, pages à 250 mots", () => {
    expect(places.targets.map((t) => [t.kind, t.label, t.page])).toEqual([
      ["chapter", "Chapitre 1 · Le bois", 1],
      ["scene", "La galette", 1],
      ["scene", "Le bois", 2],
      ["revisit", "la galette", 2],
      ["scene", "Scène sans titre", 2],
    ]);
    expect(places.pages).toBe(2);
    expect(places.pageAt(2)).toBe("b");
    expect(places.pageAt(1)).toBe("a");
  });

  it("un nombre trouve la page et le chapitre ; un mot, la scène et le passage", () => {
    expect(findPlaces("1", places, labels).map((t) => t.label)).toEqual(["Page 1", "Chapitre 1 · Le bois"]);
    expect(findPlaces("galette", places, labels).map((t) => t.kind)).toEqual(["scene", "revisit"]);
  });
});
