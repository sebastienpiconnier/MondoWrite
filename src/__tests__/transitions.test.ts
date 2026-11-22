// Enchaînements à relire (#120) : validés au premier passage, scènes nouvelles et coupures sans rien signaler,
// déplacement signalé, validation par ajout seulement.

import { describe, expect, it } from "vitest";
import { approveJunctions, junctionKey, readTransitions, transitionsToReread, withNewScenes } from "../transitions";

describe("enchaînements à relire", () => {
  it("sans clé : rien n'est signalé, et tout l'ordre du moment est validé", () => {
    expect(transitionsToReread(null, ["a", "b", "c"])).toEqual([]);
    expect(withNewScenes(null, ["a", "b", "c"])).toEqual([">a", "a>b", "b>c"]);
  });

  it("une scène déplacée fait relire ses nouveaux enchaînements", () => {
    const approved = withNewScenes(null, ["a", "b", "c", "d"]);
    const moved = ["a", "c", "b", "d"];
    expect(withNewScenes(approved, moved)).toBe(approved);
    expect(transitionsToReread(approved, moved).map((r) => [r.prev, r.next, r.rank])).toEqual([
      ["a", "c", 2],
      ["c", "b", 3],
      ["b", "d", 4],
    ]);
    // Remise à sa place : plus rien à relire.
    expect(transitionsToReread(approved, ["a", "b", "c", "d"])).toEqual([]);
  });

  it("une scène nouvelle ou coupée n'est pas à relire, une scène ajoutée à la fin non plus", () => {
    const approved = withNewScenes(null, ["a", "b", "c"]);
    // b coupée en b et n (n juste après b) : ni b > n ni n > c ne sont à relire.
    const split = withNewScenes(approved, ["a", "b", "n", "c"]);
    expect(split).toEqual([...approved, "b>n", "n>c"]);
    expect(transitionsToReread(split, ["a", "b", "n", "c"])).toEqual([]);
    // Deux scènes nouvelles d'un coup entre b et c.
    const two = withNewScenes(approved, ["a", "b", "x", "y", "c"]);
    expect(transitionsToReread(two, ["a", "b", "x", "y", "c"])).toEqual([]);
    // Ajoutée à la fin.
    expect(transitionsToReread(withNewScenes(approved, ["a", "b", "c", "z"]), ["a", "b", "c", "z"])).toEqual([]);
    // Une scène nouvelle glissée là où l'enchaînement d'avant n'était pas validé : la suite reste à relire.
    const moved = ["a", "c", "b"];
    const plus = withNewScenes(approved, ["a", "c", "n", "b"]);
    expect(transitionsToReread(plus, ["a", "c", "n", "b"]).map((r) => r.next)).toEqual(["c", "b"]);
    expect(transitionsToReread(approved, moved).length).toBe(2);
  });

  it("valider ajoute seulement, et la clé relue écarte ce qui n'a pas la bonne forme", () => {
    const approved = [">a", "a>b"];
    const next = approveJunctions(approved, [{ prev: "b", next: "a" }, { prev: "a", next: "b" }]);
    expect(next).toEqual([">a", "a>b", "b>a"]);
    expect(approveJunctions(next, [{ prev: "a", next: "b" }])).toBe(next);
    expect(readTransitions([">a", "a>b", "a>b", "x", 3, "../x>y", "a>"])).toEqual([">a", "a>b"]);
    expect(readTransitions(undefined)).toBeNull();
    expect(junctionKey("", "a")).toBe(">a");
  });
});
