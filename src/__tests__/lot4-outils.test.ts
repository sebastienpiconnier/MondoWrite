import { describe, it, expect } from "vitest";
import { wordBounds, candidates, lookup, matchCase, loadThesaurus, hasThesaurus, readManifest, readData } from "../thesaurus";
import { pickNames, seeded, countryForLang, dataFileFor, loadNames, firstNames, NAME_COUNTRIES, eraForAge, registerEras, loadRegister, type NameRegister } from "../names";

describe("synonymes (#16)", () => {
  it("trouve le mot sous le curseur, collé à ses bords", () => {
    expect(wordBounds("Elle marche vite", 7)).toEqual({ from: 5, to: 11 });
    expect(wordBounds("Elle marche vite", 5)).toEqual({ from: 5, to: 11 });
    expect(wordBounds("Elle marche vite", 11)).toEqual({ from: 5, to: 11 });
    expect(wordBounds("l'été, oui", 2)).toEqual({ from: 0, to: 5 });
    expect(wordBounds("a — b", 2)).toBeNull();
  });
  it("propose les formes de base françaises", () => {
    expect(candidates("belles", "fr")).toContain("bel");
    expect(candidates("chevaux", "fr")).toContain("cheval");
    expect(candidates("marchaient", "fr")).toContain("marcher");
    expect(candidates("marchée", "fr")).toContain("marcher");
    expect(candidates("finissent", "fr")).toContain("finir");
    expect(candidates("l'amie", "fr")[0]).toBe("amie");
    expect(candidates("Marche", "fr")[0]).toBe("marche");
  });
  it("garde la casse du mot remplacé", () => {
    expect(matchCase("Marche", "avance")).toBe("Avance");
    expect(matchCase("MARCHE", "avance")).toBe("AVANCE");
    expect(matchCase("marche", "avance")).toBe("avance");
    expect(matchCase("I", "me")).toBe("Me");
  });
  it("cherche par forme de base", () => {
    const data = { marcher: [["avancer", "cheminer"]] };
    expect(lookup(data, "Marchaient", "fr")?.lemma).toBe("marcher");
    expect(lookup(data, "courir", "fr")).toBeNull();
  });
  it("lit la liste du site : seules les entrées sûres sont gardées", () => {
    const sha = "a".repeat(64);
    const good = { lang: "fr", file: "fr.json", size: 100, sha256: sha };
    expect(readManifest({ thesaurus: [good] })).toEqual([{ lang: "fr", url: "https://mondowrite.app/thesaurus/fr.json", size: 100, sha256: sha }]);
    expect(readManifest({ thesaurus: [{ ...good, file: "https://evil.example/fr.json" }] })).toEqual([]);
    expect(readManifest({ thesaurus: [{ ...good, file: "http://mondowrite.app/fr.json" }] })).toEqual([]);
    expect(readManifest({ thesaurus: [{ ...good, sha256: "zz" }] })).toEqual([]);
    expect(readManifest({ thesaurus: [{ ...good, size: 999_999_999 }] })).toEqual([]);
    expect(readManifest(null)).toEqual([]);
  });
  it("ne garde des données téléchargées que des mots et des listes de mots", () => {
    const data = readData({ beau: [["joli", 3, "charmant"], "x", []], mauvais: "texte", vide: [[]] });
    expect(data.beau).toEqual([["joli", "charmant"]]);
    expect(data.mauvais).toBeUndefined();
    expect(data.vide).toBeUndefined();
  });
  it("refuse une langue sans dictionnaire", async () => {
    expect(hasThesaurus("fr-CA")).toBe(true);
    expect(hasThesaurus("en")).toBe(false);
    await expect(loadThesaurus("en")).rejects.toThrow();
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

describe("registre officiel des prénoms (#17)", () => {
  const list = { f: ["Zoé"], m: ["Zack"], x: [], l: ["Durand", "Roux"] };
  // 1950-1959, 1960-1969, 1970-1979
  const reg: NameRegister = {
    from: 1950,
    step: 10,
    f: [["Marie", [900, 100, 0]], ["Camille", [0, 0, 400]]],
    m: [["Jean", [800, 200, 0]], ["Camille", [0, 0, 300]]],
  };
  it("ne propose que les prénoms donnés dans la décennie choisie", () => {
    const out = pickNames({ list, gender: "any", kind: "first", count: 10, taken: [], rand: seeded(1), register: reg, era: 1970 });
    expect(out.sort()).toEqual(["Camille"]);
    const f = pickNames({ list, gender: "f", kind: "first", count: 10, taken: [], rand: seeded(1), register: reg, era: 1950 });
    expect(f).toEqual(["Marie"]);
  });
  it("tire au prorata des naissances", () => {
    const heavy: NameRegister = { ...reg, f: [["Rare", [1, 0, 0]], ["Courant", [999, 0, 0]]], m: [] };
    let first = 0;
    for (let i = 1; i <= 200; i++) if (pickNames({ list, gender: "f", kind: "first", count: 1, taken: [], rand: seeded(i), register: heavy })[0] === "Courant") first++;
    expect(first).toBeGreaterThan(180);
  });
  it("additionne un prénom donné aux deux sexes, et garde les noms de famille de la liste sans registre de noms", () => {
    const out = pickNames({ list, gender: "any", kind: "full", count: 1, taken: [], rand: seeded(5), register: reg, era: 1970 });
    expect(out[0]).toMatch(/^Camille (Durand|Roux)$/);
  });
  it("écarte les prénoms déjà portés dans le projet", () => {
    const out = pickNames({ list, gender: "f", kind: "first", count: 10, taken: ["Marie Dupont"], rand: seeded(2), register: reg });
    expect(out).toEqual(["Camille"]);
  });
  it("donne les décennies du registre et celle d'un âge", () => {
    expect(registerEras(reg)).toEqual([1950, 1960, 1970]);
    expect(eraForAge("34 ans", 2026, reg)).toBeNull();
    expect(eraForAge("52 ans", 2026, reg)).toBe(1970);
    expect(eraForAge("quarante", 2026, reg)).toBeNull();
  });
  it("n'a pas de registre pour un pays sans fichier", async () => {
    expect(await loadRegister("VN")).toBeNull();
  });
});
