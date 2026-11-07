import { describe, it, expect } from "vitest";
import { wordBounds, candidates, lookup, matchCase, loadThesaurus, hasThesaurus } from "../thesaurus";
import { pickNames, seeded, countryForLang, dataFileFor, loadNames, firstNames, NAME_COUNTRIES } from "../names";

describe("synonymes (#16)", () => {
  it("trouve le mot sous le curseur, collé à ses bords", () => {
    expect(wordBounds("Elle marche vite", 7)).toEqual({ from: 5, to: 11 });
    expect(wordBounds("Elle marche vite", 5)).toEqual({ from: 5, to: 11 });
    expect(wordBounds("Elle marche vite", 11)).toEqual({ from: 5, to: 11 });
    expect(wordBounds("l'été, oui", 2)).toEqual({ from: 0, to: 5 });
    expect(wordBounds("a — b", 2)).toBeNull();
  });
  it("propose les formes de base anglaises", () => {
    expect(candidates("Walking", "en")).toContain("walk");
    expect(candidates("stories", "en")).toContain("story");
    expect(candidates("stopped", "en")).toContain("stop");
    expect(candidates("marche", "fr")).toEqual(["marche"]);
  });
  it("garde la casse du mot remplacé", () => {
    expect(matchCase("Walk", "stroll")).toBe("Stroll");
    expect(matchCase("WALK", "stroll")).toBe("STROLL");
    expect(matchCase("walk", "stroll")).toBe("stroll");
    expect(matchCase("I", "me")).toBe("Me");
  });
  it("cherche par forme de base", () => {
    const data = { walk: [["stroll", "amble"]] };
    expect(lookup(data, "Walking", "en")?.lemma).toBe("walk");
    expect(lookup(data, "run", "en")).toBeNull();
  });
  it("charge le dictionnaire anglais livré", async () => {
    expect(hasThesaurus("en-GB")).toBe(true);
    expect(hasThesaurus("fr")).toBe(false);
    await expect(loadThesaurus("fr")).rejects.toThrow();
    const data = await loadThesaurus("en");
    expect(lookup(data, "beautiful", "en")?.senses[0]).toContain("comely");
    expect(lookup(data, "walked", "en")).not.toBeNull();
  });
});

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
