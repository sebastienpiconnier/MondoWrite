import { describe, it, expect } from "vitest";
import { pickNames, seeded, countryForLang, dataFileFor, loadNames, firstNames, NAME_COUNTRIES } from "../names";

describe("annuaire de noms (#17)", () => {
  const list = { f: ["Anna", "Béa", "Chloé"], m: ["Hugo", "Ivan"], x: ["Camille"], l: ["Durand", "Morvan", "Petit", "Roux"] };
  it("tire avec une graine fixe, sans doublon", () => {
    const a = pickNames({ list, gender: "any", kind: "full", count: 3, taken: [], rand: seeded(7) });
    const b = pickNames({ list, gender: "any", kind: "full", count: 3, taken: [], rand: seeded(7) });
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    expect(a).toHaveLength(3);
  });
  it("respecte le genre, sans oublier les prénoms sans genre", () => {
    expect(firstNames(list, "m").sort()).toEqual(["Camille", "Hugo", "Ivan"]);
    const f = pickNames({ list, gender: "f", kind: "first", count: 10, taken: [], rand: seeded(1) });
    expect(f.sort()).toEqual(["Anna", "Béa", "Camille", "Chloé"]);
  });
  it("n'offre pas un prénom ou un nom déjà porté (casse et accents ignorés)", () => {
    const out = pickNames({ list, gender: "any", kind: "full", count: 10, taken: ["bea durand", "Hugo"], rand: seeded(3) });
    expect(out.join(" ")).not.toMatch(/Béa|Hugo|Durand/);
  });
  it("rend moins de noms quand il n'y en a plus assez", () => {
    expect(pickNames({ list, gender: "m", kind: "last", count: 10, taken: [], rand: seeded(2) })).toHaveLength(4);
  });
  it("choisit un pays de départ selon la langue", () => {
    expect(countryForLang("fr")).toBe("FR");
    expect(countryForLang("en-GB")).toBe("GB");
    expect(countryForLang("es")).toBe("ES");
    expect(countryForLang("xx")).toBe("US");
  });
  it("charge les listes livrées de chaque pays proposé", async () => {
    for (const c of NAME_COUNTRIES) {
      if (!dataFileFor(c)) continue;
      const l = await loadNames(c);
      expect(l.l.length).toBeGreaterThan(20);
      expect(firstNames(l, "any").length).toBeGreaterThan(30);
    }
    await expect(loadNames("VN")).rejects.toThrow();
  });
});
