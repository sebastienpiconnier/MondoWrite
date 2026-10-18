import { describe, expect, it } from "vitest";
import { hiddenFrames } from "../canvasFilter";

const box = (x: number, y: number, w = 100, h = 100) => ({ x, y, width: w, height: h });

describe("hiddenFrames", () => {
  const frames = [
    { id: "A", box: box(0, 0, 400, 400) },
    { id: "B", box: box(1000, 0, 400, 400) },
    { id: "A-inner", box: box(10, 10, 200, 200) },
    { id: "C", box: box(2000, 0, 400, 400) },
  ];
  const cards = [
    { id: "c1", box: box(50, 50) },
    { id: "c2", box: box(1050, 50) },
  ];

  it("ne masque rien sans filtre", () => {
    expect(hiddenFrames(frames, cards, new Set(["c2"]), false).size).toBe(0);
  });

  it("masque les cadres sans carte visible, garde ceux qui en contiennent", () => {
    const off = hiddenFrames(frames, cards, new Set(["c2"]), true);
    expect([...off].sort()).toEqual(["B", "C"]);
  });

  it("garde un cadre qui en contient un autre resté visible", () => {
    const off = hiddenFrames(frames, [{ id: "c1", box: box(600, 600) }], new Set(), true);
    expect(off.has("A")).toBe(true);
    const off2 = hiddenFrames(frames, [{ id: "c1", box: box(20, 20) }], new Set(), true);
    expect(off2.has("A")).toBe(false);
    expect(off2.has("A-inner")).toBe(false);
  });
});
