// @vitest-environment happy-dom
// Préparer et payer (#119) : sens d'un fil entre deux scènes, lecture et écriture, ordre inversé.

import { describe, expect, it } from "vitest";
import { payoffOf, readSetups, sceneLetters, setupLetter, setupLetters, setupCircle, setupOf, setupProblems, setupScenes, setupsByScene, setupsOf, setupsToMeta } from "../setups";
import { hiddenCards, NO_FILTER } from "../canvasFilter";

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
    // Couleur propre et arc par une autre sortie que le fil d'une scène à la suivante.
    expect(back.style?.stroke).toBe("var(--setup)");
    expect(back.data).toEqual({ setup: "b", arc: true });
    expect(plain.style?.stroke).toBe("var(--accent)");
    expect(plain.data).toBeUndefined();
  });

  it("l'arc passe par le haut de deux scènes côte à côte, par la gauche de deux scènes l'une sous l'autre", async () => {
    const { arcPath } = await import("../components/FloatingEdge");
    const [side, , y1] = arcPath({ x: 0, y: 100, w: 200, h: 80 }, { x: 600, y: 100, w: 200, h: 80 });
    expect(side.startsWith("M 100,100")).toBe(true);
    expect(y1).toBeLessThan(100);
    const [stack, x2] = arcPath({ x: 0, y: 0, w: 200, h: 80 }, { x: 0, y: 400, w: 200, h: 80 });
    expect(stack.startsWith("M 0,40")).toBe(true);
    expect(x2).toBeLessThan(0);
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

describe("préparer et payer : ce que chaque scène prépare", () => {
  const edges = [edge("l1", "a", "b", "a"), edge("l2", "c", "a", "c"), edge("l3", "a", "d"), edge("l4", "b", "e", "e")];

  it("prépare et payée par, une fois par tableau de fils", () => {
    expect(setupsOf(edges, "a")).toEqual({ prepares: ["b"], paidBy: ["c"] });
    expect(setupsOf(edges, "b")).toEqual({ prepares: [], paidBy: ["a", "e"] });
    expect(setupsOf(edges, "d")).toEqual({ prepares: [], paidBy: [] });
    expect(setupsByScene(edges)).toBe(setupsByScene(edges));
    expect([...setupScenes(edges)].sort()).toEqual(["a", "b", "c", "e"]);
    expect([...setupCircle(edges, "a")].sort()).toEqual(["a", "b", "c"]);
  });

  it("filtre « Préparations seulement » : les autres cartes sont masquées", () => {
    const cards = ["a", "b", "c", "d", "e", "x"].map((id) => ({ id, type: "scene" as const, html: "" }));
    const hidden = hiddenCards(cards, edges, { ...NO_FILTER, setups: true });
    expect([...hidden].sort()).toEqual(["d", "x"]);
    expect(hiddenCards(cards, edges, NO_FILTER).size).toBe(0);
  });
});

describe("préparer et payer : une lettre par paire", () => {
  it("A à Z, puis AA", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(setupLetter)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA"]);
  });

  it("dans l'ordre du récit de la scène qui prépare, une scène hors du récit après", () => {
    const edges = [edge("l1", "c", "d", "c"), edge("l2", "a", "b", "a"), edge("l3", "x", "a", "x"), edge("l4", "a", "d", "d"), edge("l5", "b", "c")];
    const letters = setupLetters(edges, ["a", "b", "c", "d"]);
    expect([...letters.entries()]).toEqual([["l2", "A"], ["l1", "B"], ["l4", "C"], ["l3", "D"]]);
    const byScene = sceneLetters(edges, letters);
    expect(byScene.get("a")).toEqual({ prepares: ["A"], pays: ["C", "D"] });
    expect(byScene.get("d")).toEqual({ prepares: ["C"], pays: ["B"] });
  });

  it("le fil porte la lettre de sa paire, avant l'étiquette de l'auteur", async () => {
    const { withSceneArrows } = await import("../sceneArrows");
    const edges: import("@xyflow/react").Edge[] = [
      { id: "l1", source: "a", target: "b", data: { setup: "a" } },
      { id: "l2", source: "a", target: "b", data: { setup: "b" }, label: "le fusil" },
    ];
    const [plain, named] = withSceneArrows(edges, new Set(["a", "b"]), "prépare", new Map([["l1", "A"], ["l2", "B"]]));
    expect(plain.label).toBe("prépare A");
    expect(named.label).toBe("B · le fusil");
  });
});
