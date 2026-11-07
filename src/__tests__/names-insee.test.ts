import { describe, it, expect } from "vitest";
// @ts-expect-error script Node sans types
import { parseInsee, parseInseeNames, titleCase } from "../../scripts/names/build-insee.mjs";

describe("fabrication du registre INSEE (#17)", () => {
  const csv = [
    "sexe;preusuel;annais;nombre",
    "1;JEAN-PIERRE;1955;500",
    "1;JEAN-PIERRE;1965;400",
    "2;MARIE;1955;900",
    "1;_PRENOMS_RARES;1980;900",
    "2;CAMILLE;XXXX;999",
    "1;CAMILLE;1990;400",
    "2;CAMILLE;1990;350",
    "2;ZOÉ;1990;20",
  ].join("\n");
  it("range les naissances par décennie et par sexe, sans les rares ni les années inconnues", () => {
    const r = parseInsee(csv, 300);
    expect(r.m.map(([n]: [string]) => n)).toEqual(["Camille", "Jean-Pierre"]);
    expect(r.f.map(([n]: [string]) => n)).toEqual(["Camille", "Marie"]);
    expect(r.m[1][1][5]).toBe(500);
    expect(r.m[1][1][6]).toBe(400);
  });
  it("met les prénoms en casse de titre", () => {
    expect(titleCase("MARIE-HÉLÈNE")).toBe("Marie-Hélène");
    expect(titleCase("JEAN PIERRE")).toBe("Jean Pierre");
  });
  it("refuse un fichier dont l'en-tête n'est pas celui de l'INSEE", () => {
    expect(() => parseInsee("a;b\n1;2")).toThrow();
  });
  it("lit les noms de famille : tranches décalées, seuil, décennies récentes reprises", () => {
    const txt = "NOM\t_1891_1900\t_1901_1910\t_1911_1920\t_1921_1930\t_1931_1940\t_1941_1950\t_1951_1960\t_1961_1970\t_1971_1980\t_1981_1990\t_1991_2000\r\n" +
      "MARTIN\t9\t100\t0\t0\t0\t0\t0\t0\t0\t0\t2000\r\nRARE\t1\t1\t0\t0\t0\t0\t0\t0\t0\t0\t1\r\n";
    const r = parseInseeNames(txt, 2000);
    expect(r.map(([n]: [string]) => n)).toEqual(["Martin"]);
    expect(r[0][1][0]).toBe(100);
    expect(r[0][1][9]).toBe(2000);
    expect(r[0][1][12]).toBe(2000);
  });
});
