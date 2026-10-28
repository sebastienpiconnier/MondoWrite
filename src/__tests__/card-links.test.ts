// Liaisons écrites sur les cartes, et fils dessinés quand ils sont masqués.

import { describe, expect, it } from "vitest";
import { fromLinkedKey, linkedCards, linkedKey, wireShown } from "../cardLinks";
import { KNOWN_META, openProject, toProject } from "../projectState";

const cards = [
  { id: "a", title: "Inès", type: "personnage" },
  { id: "b", title: " Le phare ", type: "lieu" },
  { id: "c", title: "", type: "idee" },
];
const same = (c: (typeof cards)[number]) => c;

describe("voisines d'une carte", () => {
  it("dans les deux sens, sans doublon, sans boucle ni carte disparue", () => {
    const edges = [
      { source: "a", target: "b" },
      { source: "b", target: "a" },
      { source: "c", target: "a" },
      { source: "a", target: "a" },
      { source: "a", target: "zz" },
    ];
    const map = linkedCards(cards, same, edges);
    expect(map.get("a")?.map((l) => l.id)).toEqual(["b", "c"]);
    expect(map.get("b")).toEqual([{ id: "a", title: "Inès", type: "personnage" }]);
    expect(map.get("c")?.[0].title).toBe("Inès");
    expect(map.get("a")?.[0].title).toBe("Le phare");
    // Mêmes cartes et mêmes fils : le même résultat, sans recalcul.
    expect(linkedCards(cards, same, edges)).toBe(map);
  });

  it("clé stable aller-retour", () => {
    const list = linkedCards(cards, same, [{ source: "a", target: "b" }, { source: "a", target: "c" }]).get("a");
    expect(fromLinkedKey(linkedKey(list))).toEqual(list);
    expect(fromLinkedKey(linkedKey(undefined))).toEqual([]);
  });
});

describe("fils dessinés", () => {
  it("tous quand ils sont visibles ; masqués, ceux des cartes rallumées seulement", () => {
    const e = { source: "a", target: "b" };
    expect(wireShown(e, false, new Set())).toBe(true);
    expect(wireShown(e, true, new Set())).toBe(false);
    expect(wireShown(e, true, new Set(["b"]))).toBe(true);
    expect(wireShown(e, true, new Set(["c"]))).toBe(false);
  });
});

describe("réglage enregistré", () => {
  it("hideWires est écrit dans cosmos.json seulement s'il est vrai, et relu", () => {
    const base = { meta: { version: 1 as const, title: "T", kind: "roman" as const, layout: [], links: [] }, cards: [], screenplay: null };
    const { state } = openProject(base);
    expect(state.hideWires).toBe(false);
    const empty = toProject({ ...state, screenplay: null, metaKeep: {} } as Parameters<typeof toProject>[0]);
    expect("hideWires" in empty.meta).toBe(false);
    const on = toProject({ ...state, hideWires: true } as Parameters<typeof toProject>[0]);
    expect(on.meta.hideWires).toBe(true);
    expect(openProject(on).state.hideWires).toBe(true);
    expect(KNOWN_META.has("hideWires")).toBe(true);
  });
});
