import { describe, it, expect } from "vitest";
// @ts-expect-error script Node sans types
import { parseSsa, parseCensus, usTitleCase } from "../../scripts/names/build-us.mjs";

describe("registre des États-Unis (#17)", () => {
  it("range les prénoms SSA par décennie et par sexe, seuil appliqué", () => {
    const r = parseSsa({ 1950: "Mary,F,3000\nJames,M,2500\nRare,F,10", 1955: "Mary,F,500", 1890: "Old,F,9999" }, 2000);
    expect(r.f.map(([n]: [string]) => n)).toEqual(["Mary"]);
    expect(r.f[0][1][5]).toBe(3500);
    expect(r.m.map(([n]: [string]) => n)).toEqual(["James"]);
  });
  it("lit les noms du Census sans les colonnes d'origine, même nombre dans chaque décennie", () => {
    const csv = "name,rank,count,prop100k,cum_prop100k,pctwhite\nSMITH,1,2442977,828,828,70.9\nRARE,9999,100,0,0,(S)\nMCDONALD,300,50000,1,1,1";
    const r = parseCensus(csv, 20000);
    expect(r.map(([n]: [string]) => n)).toEqual(["McDonald", "Smith"]);
    expect(r[1][1]).toHaveLength(13);
    expect(new Set(r[1][1]).size).toBe(1);
  });
  it("met en casse de titre", () => {
    expect(usTitleCase("O'BRIEN")).toBe("O'Brien");
  });
});
