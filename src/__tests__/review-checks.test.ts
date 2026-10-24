// Vérification du texte : des points à regarder, jamais une correction (onglet « Vérifier »).
import { describe, expect, it } from "vitest";
import { editDistance, foldName, similarNames } from "../review/names";
import { checkManuscript, checkScreenplay, groupFindings, rawText, speakers } from "../review/checks";
import { parse } from "../screenplay/parse";
import { LAYOUTS } from "../screenplay/layout";
import type { CardData } from "../types";

const card = (id: string, title: string, type: CardData["type"] = "personnage", fiche?: Record<string, string>): CardData => ({ id, type, title, html: "", ...(fiche ? { fiche } : {}) });

describe("noms presque identiques", () => {
  it("repliés sans accents, tirets ni casse", () => {
    expect(foldName("Jean-Paul l’Ange")).toBe("JEAN PAUL L ANGE");
    expect(similarNames("INES", "INÈS")).toBe(true);
    expect(similarNames("JEAN-PAUL", "JEAN PAUL")).toBe(true);
  });
  it("une lettre d'écart pour un nom d'au moins 5 lettres ; pas pour deux noms courts", () => {
    expect(similarNames("CHAPPERON", "CHAPERON")).toBe(true);
    expect(similarNames("LÉA", "LÉO")).toBe(false);
    expect(similarNames("LOUP", "LOUPP")).toBe(true);
    expect(similarNames("MARIE", "MARIUS")).toBe(false);
    expect(editDistance("MARIE", "MARIUS", 1)).toBe(2);
  });
});

const script = (src: string) => parse(src).elements;
const SCRIPT = `INT. MAISON DE LA MÈRE - JOUR

La Mère tend le panier.

LA MÈRE
Va voir ta Mère-grand.

CHAPERON
J'y vais.

EXT. LE BOIS - JOUR

Le Petit Chaperon rouge marche entre les arbres, son panier au bras. Les bûcherons coupent du bois plus loin, on entend leurs haches qui résonnent. Elle cueille des noisettes, court après les papillons, fait des bouquets de petites fleurs. Le Loup sort de derrière un chêne et la regarde passer longuement.

LE LOUP
Où allez-vous  ainsi ?

CHAPPERON
Chez ma Mère-grand.

CHAPERON
Par-delà le moulin.

INT. MAISON DE LA MÈRE-GRAND
`;

describe("vérification d'un scénario", () => {
  // Un nom de personnage tapé dans l'éditeur, encore sans réplique.
  const els = [...script(SCRIPT), { type: "character" as const, text: "BÛCHERON" }];
  const cards = [card("a", "Le Petit Chaperon rouge", "personnage", { surnoms: "Chaperon" }), card("b", "La Mère"), card("c", "Le Loup")];
  const found = checkScreenplay(els, LAYOUTS.a4, cards, "fr");
  const byRule = (r: string) => found.filter((f) => f.rule === r);

  it("compte les répliques de chaque personnage", () => {
    expect(speakers(els).get("CHAPERON")?.lines).toBe(2);
  });
  it("signale le nom le moins employé à côté de l'autre", () => {
    expect(byRule("similarNames").map((f) => f.names)).toEqual([["CHAPPERON", "CHAPERON"]]);
    expect(byRule("similarNames")[0].counts).toEqual([1, 2]);
    expect(byRule("similarNames")[0].scene).toBe(2);
  });
  it("personnage sans carte, surnoms compris (la variante d'un nom connu n'est pas comptée deux fois)", () => {
    expect(byRule("unknownCharacter").map((f) => f.names?.[0])).toEqual(["BÛCHERON"]);
  });
  it("action trop longue, en-tête sans moment, personnage sans réplique, espaces en trop", () => {
    expect(byRule("longAction")).toHaveLength(1);
    expect(byRule("longAction")[0].counts![0]).toBeGreaterThan(4);
    expect(byRule("headingFormat").map((f) => f.scene)).toEqual([3]);
    expect(byRule("emptyElement").map((f) => f.text)).toEqual(["BÛCHERON"]);
    expect(byRule("extraSpaces")).toHaveLength(1);
  });
  it("un en-tête forcé (« .PHARE ») est le choix de l'auteur", () => {
    const f = checkScreenplay(script(".PHARE\n\nLa nuit tombe."), LAYOUTS.a4, [], "fr");
    expect(f.filter((x) => x.rule === "headingFormat")).toHaveLength(0);
  });
  it("groupés par règle, sans les points ignorés", () => {
    const ignored = new Set([byRule("extraSpaces")[0].key]);
    const groups = groupFindings(found, ignored);
    expect(groups[0].rule).toBe("similarNames");
    expect(groups.some((g) => g.rule === "extraSpaces")).toBe(false);
  });
});

describe("vérification d'un roman", () => {
  const cards = [card("p", "Inès Morvan"), card("l", "Kerdonis", "lieu"), card("s", "Arrivée", "scene")];
  const manuscript = {
    s1: "<p>Inés arrive à  Kerdonis.</p><p>Inès monte , puis s’arrête.</p>",
    s2: "<p>Morvan, c’était le nom de son père. Kerdonnis dormait.</p>",
  };
  const found = checkManuscript(manuscript, ["s1", "s2"], cards);

  it("texte brut, espaces gardées", () => {
    expect(rawText("<p>a  b&nbsp;c</p>")).toBe("a  b c\n");
  });
  it("un nom écrit presque comme celui d'une carte", () => {
    expect(found.filter((f) => f.rule === "similarNames").map((f) => [f.sceneId, ...(f.names ?? [])])).toEqual([
      ["s1", "Inés", "Inès"],
      ["s2", "Kerdonnis", "Kerdonis"],
    ]);
  });
  it("espaces doubles et espace avant une virgule", () => {
    const spaces = found.filter((f) => f.rule === "extraSpaces");
    expect(spaces).toHaveLength(2);
    expect(spaces[0].text).toContain("Kerdonis");
  });
});

describe("variante d'un nom connu", () => {
  it("n'est signalée qu'une fois, avec le nom de la carte comme bon nom", () => {
    const els = script("INT. SALON - JOUR\n\nETHANN\nSalut.\n\nETHAN\nBonjour.");
    const f = checkScreenplay(els, LAYOUTS.a4, [card("e", "Ethan")], "fr");
    const similar = f.filter((x) => x.rule === "similarNames");
    expect(similar).toHaveLength(1);
    expect(similar[0].names).toEqual(["ETHANN", "ETHAN"]);
    expect(f.some((x) => x.rule === "unknownCharacter")).toBe(false);
  });
});
