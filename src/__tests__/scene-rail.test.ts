import { describe, expect, it } from "vitest";
import type { Node as PMNode } from "@tiptap/pm/model";
import { bookRange, railSegments, screenplayRange } from "../components/SceneRail";

// Document réduit à ce que lisent les fonctions : enfants, nom du type, attributs, taille.
const fakeDoc = (children: { name: string; attrs?: Record<string, unknown> }[]) => {
  const nodes = children.map((c) => ({ type: { name: c.name }, attrs: c.attrs ?? {}, nodeSize: 2 }));
  return {
    childCount: nodes.length,
    child: (i: number) => nodes[i],
    content: { size: nodes.length * 2 },
    resolve: (pos: number) => ({ index: () => Math.min(nodes.length - 1, Math.floor(pos / 2)) }),
  } as unknown as PMNode;
};

describe("trait de la scène en cours (#156)", () => {
  it("un morceau par page : un grand écart (saut de page) coupe le trait", () => {
    expect(railSegments([{ top: 10, bottom: 30 }, { top: 46, bottom: 60 }, { top: 300, bottom: 320 }, { top: 0, bottom: 0 }])).toEqual([
      { top: 10, height: 50 },
      { top: 300, height: 20 },
    ]);
    expect(railSegments([])).toEqual([]);
  });

  it("scénario : de l'en-tête à la scène ou à la section suivante ; rien avant le premier en-tête", () => {
    const doc = fakeDoc([
      { name: "preserved", attrs: { kind: "section" } },
      { name: "sceneHeading" },
      { name: "action" },
      { name: "dialogue" },
      { name: "preserved", attrs: { kind: "section" } },
      { name: "sceneHeading" },
      { name: "action" },
    ]);
    expect(screenplayRange(doc, 0)).toBeNull();
    expect(screenplayRange(doc, 6)).toEqual([1, 4]);
    expect(screenplayRange(doc, 13)).toEqual([5, 7]);
  });

  it("manuscrit : les paragraphes entre le repère de la scène et le suivant", () => {
    const doc = fakeDoc([
      { name: "sceneMark", attrs: { id: "a" } },
      { name: "paragraph" },
      { name: "paragraph" },
      { name: "sceneMark", attrs: { id: "b" } },
      { name: "paragraph" },
    ]);
    expect(bookRange("a", "sceneMark")(doc, 0)).toEqual([1, 3]);
    expect(bookRange("b", "sceneMark")(doc, 0)).toEqual([4, 5]);
    expect(bookRange("z", "sceneMark")(doc, 0)).toBeNull();
  });
});
