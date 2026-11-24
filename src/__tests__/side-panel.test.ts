import { describe, expect, it } from "vitest";
import { EMPTY_SIDE_PREFS, moveSidePart, orderParts, readSidePrefs, resetSideParts, setSideHidden } from "../sidePanel";

const D = ["props", "setups", "links", "cited", "synopsis", "chutier", "stats"];

describe("volet de droite", () => {
  it("garde l'ordre par défaut sans réglage", () => {
    expect(orderParts(D, EMPTY_SIDE_PREFS)).toEqual(D);
  });
  it("monte et descend une rubrique, sans perdre celles d'une autre vue", () => {
    const p = { ...EMPTY_SIDE_PREFS, order: ["scene", "synopsis"] };
    const moved = moveSidePart(p, D, "synopsis", -1);
    expect(orderParts(D, moved)).toEqual(["props", "setups", "links", "synopsis", "cited", "chutier", "stats"]);
    expect(moved.order).toContain("scene");
    expect(moveSidePart(moved, D, "props", -1)).toBe(moved);
  });
  it("place une rubrique inconnue de l'ordre après sa voisine par défaut", () => {
    const p = { ...EMPTY_SIDE_PREFS, order: ["synopsis", "props", "cited"] };
    expect(orderParts(D, p)).toEqual(["synopsis", "props", "setups", "links", "cited", "chutier", "stats"]);
  });
  it("relit prudemment et rétablit l'ordre", () => {
    expect(readSidePrefs({ order: ["a", 3, "../x", "a"], hidden: "x" })).toEqual({ order: ["a"], hidden: [], folded: [] });
    const p = setSideHidden({ ...EMPTY_SIDE_PREFS, order: ["stats", "scene"] }, "stats", true);
    expect(resetSideParts(p, D)).toEqual({ order: ["scene"], hidden: [], folded: [] });
  });
});
