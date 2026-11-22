// @vitest-environment happy-dom
// Préparer et payer (#119) : sens d'un fil entre deux scènes, lecture et écriture, ordre inversé.

import { describe, expect, it } from "vitest";
import { payoffOf, readSetups, setupOf, setupProblems, setupsToMeta } from "../setups";

const edge = (id: string, source: string, target: string, setup?: string) => ({ id, source, target, ...(setup ? { data: { setup } } : {}) });

describe("préparer et payer", () => {
  it("la scène qui prépare est l'un des bouts, dans un sens ou l'autre", () => {
    expect(setupOf(edge("l", "a", "b", "a"))).toBe("a");
    expect(payoffOf(edge("l", "a", "b", "a"))).toBe("b");
    expect(setupOf(edge("l", "a", "b", "b"))).toBe("b");
    expect(payoffOf(edge("l", "a", "b", "b"))).toBe("a");
    expect(setupOf(edge("l", "a", "b", "x"))).toBeNull();
    expect(setupOf(edge("l", "a", "b"))).toBeNull();
  });

  it("bloc de cosmos.json : seulement les fils qui existent, et une scène qui en est un bout", () => {
    const links = [{ id: "l1", source: "a", target: "b" }, { id: "l2", source: "c", target: "d" }];
    const read = readSetups({ l1: "b", l2: "x", gone: "a", l3: 4 }, links);
    expect([...read.entries()]).toEqual([["l1", "b"]]);
    expect(readSetups(null, links).size).toBe(0);
    expect(readSetups(["a"], links).size).toBe(0);
  });

  it("bloc écrit : seulement les fils qui préparent, rien sinon", () => {
    expect(setupsToMeta([edge("l1", "a", "b", "b"), edge("l2", "c", "d")])).toEqual({ l1: "b" });
    expect(setupsToMeta([edge("l2", "c", "d")])).toBeUndefined();
  });

  it("signale un fil à l'envers, jamais une scène hors du récit", () => {
    const edges = [edge("l1", "s1", "s3", "s3"), edge("l2", "s1", "s2", "s1"), edge("l3", "s2", "x", "x"), edge("l4", "s2", "s4")];
    expect(setupProblems(edges, ["s1", "s2", "s3", "s4"])).toEqual([{ linkId: "l1", setup: "s3", payoff: "s1", setupRank: 3, payoffRank: 1 }]);
    expect(setupProblems(edges, ["s3", "s2", "s1"]).map((p) => p.linkId)).toEqual(["l2"]);
    expect(setupProblems(edges, ["s1", "s2", "s4"])).toEqual([]);
  });
});

describe("préparer et payer : flèches et fichier", () => {
  it("la flèche part de la scène qui prépare, l'étiquette vide dit « prépare »", async () => {
    const { withSceneArrows } = await import("../sceneArrows");
    const edges: import("@xyflow/react").Edge[] = [
      { id: "l1", source: "a", target: "b", data: { setup: "b" } },
      { id: "l2", source: "a", target: "b", data: { setup: "a" }, label: "le fusil" },
      { id: "l3", source: "a", target: "b" },
    ];
    const [back, fwd, plain] = withSceneArrows(edges, new Set(["a", "b"]), "prépare");
    expect(back.markerStart).toBeTruthy();
    expect(back.markerEnd).toBeUndefined();
    expect(back.label).toBe("prépare");
    expect(fwd.markerEnd).toBeTruthy();
    expect(fwd.label).toBe("le fusil");
    expect(plain.label).toBeUndefined();
    expect(plain.className).not.toContain("is-setup");
  });

  it("cosmos.json garde le bloc setups à part des fils, avec la fiche du fil", async () => {
    const { fromProject, toProject } = await import("../projectState");
    const { demoProject } = await import("../demo");
    const s = fromProject(demoProject());
    const edge = s.edges[0];
    const state = { ...s, edges: s.edges.map((e) => (e.id === edge.id ? { ...e, data: { fiche: { enjeu: "x" }, setup: edge.target } } : e)), screenplay: null, viewport: undefined };
    const meta = toProject(state as never).meta as { setups?: unknown; links: { id: string }[] };
    expect(meta.setups).toEqual({ [edge.id]: edge.target });
    expect(JSON.stringify(meta.links)).not.toContain("setup");
    const back = fromProject(toProject(state as never));
    expect(back.edges.find((e) => e.id === edge.id)?.data).toEqual({ fiche: { enjeu: "x" }, setup: edge.target });
  });
});
