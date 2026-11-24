import { describe, expect, it } from "vitest";
import { plotColors, sceneColor, scenePlots } from "../plotColors";

const node = (id: string, type: string, fiche?: Record<string, string>) => ({ id, data: { type, ...(fiche ? { fiche } : {}) } }) as never;

describe("couleur d'une scène par son intrigue principale (#143)", () => {
  const nodes = [node("s1", "scene"), node("s2", "scene", { intrigue: "b" }), node("s3", "scene"), node("a", "intrigue"), node("b", "intrigue"), node("p", "personnage")];
  const edges = [
    { source: "s1", target: "a" },
    { source: "b", target: "s1" },
    { source: "s2", target: "a" },
    { source: "s2", target: "b" },
    { source: "s3", target: "p" },
  ];
  it("la première intrigue reliée, sinon celle de l'étoile", () => {
    expect(scenePlots("s1", nodes, edges)).toEqual(["a", "b"]);
    expect(scenePlots("s2", nodes, edges)).toEqual(["b", "a"]);
    expect(scenePlots("s3", nodes, edges)).toEqual([]);
  });
  it("deux intrigues, deux couleurs ; une scène sans intrigue reste neutre", () => {
    const c = plotColors(nodes, edges);
    expect(c.plots.get("a")).not.toBe(c.plots.get("b"));
    expect(sceneColor(c, "s1")).toBe(`var(--pov-${c.plots.get("a")})`);
    expect(sceneColor(c, "s2")).toBe(`var(--pov-${c.plots.get("b")})`);
    expect(sceneColor(c, "s3")).toBeUndefined();
    expect(plotColors(nodes, edges)).toBe(c);
  });
  it("une étoile vers une intrigue déliée ne compte plus", () => {
    const n2 = [node("s", "scene", { intrigue: "z" }), node("a", "intrigue"), node("z", "intrigue")];
    expect(scenePlots("s", n2, [{ source: "s", target: "a" }])).toEqual(["a"]);
  });
});
