import { describe, expect, it } from "vitest";
import { statsSignature } from "../components/useProjectStats";

const node = (fiche: Record<string, string>, title = "Inès") => ({ data: { id: "a", type: "personnage", title, fiche } });

describe("statsSignature", () => {
  it("ne change pas quand on écrit dans un champ que les chiffres ne lisent pas", () => {
    expect(statsSignature([node({ objectif: "fuir" })])).toBe(statsSignature([node({ objectif: "fuir l'île" })]));
  });
  it("change avec le nom, le genre ou les surnoms", () => {
    const base = statsSignature([node({})]);
    expect(statsSignature([node({}, "Inès Morvan")])).not.toBe(base);
    expect(statsSignature([node({ genre: "Femme" })])).not.toBe(base);
    expect(statsSignature([node({ surnoms: "Nène" })])).not.toBe(base);
  });
});
