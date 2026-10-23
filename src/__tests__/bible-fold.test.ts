// Fiches repliées de la Bible : liste gardée sur l'appareil, sans doublon, bornée, relue avec prudence.

import { describe, expect, it } from "vitest";
import { FOLD_LIMIT, readFolded, setFolded } from "../bibleFold";

describe("fiches repliées", () => {
  it("replier ajoute, sans doublon", () => {
    const a = setFolded([], ["x", "y"], true);
    expect(a).toEqual(["x", "y"]);
    expect(setFolded(a, ["y", "z"], true)).toEqual(["x", "y", "z"]);
  });
  it("déplier retire", () => {
    expect(setFolded(["x", "y", "z"], ["y"], false)).toEqual(["x", "z"]);
  });
  it("rien ne change : même liste (pas d'écriture inutile)", () => {
    const a = ["x"];
    expect(setFolded(a, ["x"], true)).toBe(a);
    expect(setFolded(a, ["y"], false)).toBe(a);
  });
  it("bornée : les plus anciennes sont oubliées", () => {
    const many = Array.from({ length: FOLD_LIMIT }, (_, i) => `c${i}`);
    const next = setFolded(many, ["nouvelle"], true);
    expect(next.length).toBe(FOLD_LIMIT);
    expect(next[0]).toBe("c1");
    expect(next.at(-1)).toBe("nouvelle");
  });
  it("relecture : seulement des chaînes, rien en cas de texte abîmé", () => {
    expect(readFolded(JSON.stringify(["a", 3, null, "b"]))).toEqual(["a", "b"]);
    expect(readFolded("{pas du json")).toEqual([]);
    expect(readFolded(JSON.stringify({ a: 1 }))).toEqual([]);
    expect(readFolded(null)).toEqual([]);
  });
});
