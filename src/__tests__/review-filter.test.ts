// Filtre par personnage du Scénario : ses scènes, ses répliques ; rien n'est écrit.
import { describe, expect, it } from "vitest";
import { filterElements, scenesWith, speakingNames } from "../review/filter";
import { parse } from "../screenplay/parse";

const els = parse(`INT. MAISON - JOUR

La Mère tend le panier.

LA MÈRE
Va.

EXT. BOIS - JOUR

Le Loup guette.

CHAPERON
Bonjour.

LE LOUP
(doucement)
Où vas-tu ?

CHAPERON
Chez ma Mère-grand.

INT. CHAMBRE - NUIT

La Mère-grand dort.
`).elements;

describe("filtre par personnage", () => {
  it("les scènes où il parle ou est nommé dans l'action", () => {
    expect(scenesWith(els, "LE LOUP").map((i) => els[i].text)).toEqual(["BOIS - JOUR".replace(/^/, "EXT. ")]);
    expect(scenesWith(els, "La Mère").map((i) => els[i].text)).toEqual(["INT. MAISON - JOUR"]);
  });
  it("« Ses scènes » cache les autres scènes", () => {
    const v = filterElements(els, { name: "CHAPERON", mode: "scenes" });
    expect(v.filter((x) => x === "show").length).toBe(els.slice(scenesWith(els, "CHAPERON")[0]).length - els.slice(els.findIndex((e) => e.text === "INT. CHAMBRE - NUIT")).length);
    expect(v[0]).toBe("hide");
  });
  it("« Ses répliques » : son nom, ses didascalies et répliques en pleine encre, le reste estompé", () => {
    const v = filterElements(els, { name: "le loup", mode: "lines" });
    const shown = els.filter((_, i) => v[i] === "show").map((e) => e.text);
    expect(shown).toEqual(["LE LOUP", "(doucement)", "Où vas-tu ?"]);
    expect(els.filter((_, i) => v[i] === "dim").map((e) => e.text)).toContain("Bonjour.");
  });
  it("sans filtre, tout est montré ; noms qui parlent dans l'ordre", () => {
    expect(filterElements(els, null).every((x) => x === "show")).toBe(true);
    expect(speakingNames(els)).toEqual(["LA MÈRE", "CHAPERON", "LE LOUP"]);
  });
});
