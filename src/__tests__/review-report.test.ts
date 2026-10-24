// Chiffres des personnages (Bible › Personnages › Chiffres) : relus dans le texte, rien n'est enregistré.
import { describe, expect, it } from "vitest";
import { genderSummary, novelReport, reportCsv, screenplayReport, sortRows } from "../review/report";
import { parse } from "../screenplay/parse";
import type { CardData } from "../types";

const els = parse(`INT. MAISON - JOUR

LA MÈRE
Va voir ta Mère-grand, ma fille.

CHAPERON
J'y vais.

EXT. BOIS - JOUR

Le Loup guette.

LE LOUP
(doucement)
Où vas-tu donc, petite ?

CHAPERON
Chez elle.
`).elements;
const cards: CardData[] = [
  { id: "c", type: "personnage", title: "Le Petit Chaperon rouge", html: "", fiche: { genre: "Fille", surnoms: "Chaperon" } },
  { id: "l", type: "personnage", title: "Le Loup", html: "", fiche: { genre: "Masculin" } },
];

describe("scénario", () => {
  const rows = screenplayReport(els, cards, "fr");
  it("une ligne par carte (surnoms compris), plus les noms qui parlent sans carte", () => {
    expect(rows.map((r) => [r.id, r.name, r.lines, r.words, r.scenes, r.first, r.last])).toEqual([
      ["c", "Le Petit Chaperon rouge", 2, 4, 2, 1, 2],
      ["l", "Le Loup", 1, 4, 1, 2, 2],
      [null, "LA MÈRE", 1, 6, 1, 1, 1],
    ]);
  });
  it("temps de parole : part des mots dits", () => {
    expect(rows[0].share).toBeCloseTo(4 / 14);
    expect(rows.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1);
  });
  it("répartition par genre, valeurs telles qu'écrites, non renseigné à la fin", () => {
    const g = genderSummary(rows);
    expect(g.map((x) => x.gender)).toEqual(["Fille", "Masculin", ""]);
    expect(g[0].lines).toBe(2);
  });
  it("tri par colonne et CSV", () => {
    expect(sortRows(rows, "words", true).map((r) => r.name)[0]).toBe("LA MÈRE");
    expect(sortRows(rows, "name", false, "fr").map((r) => r.name)[0]).toBe("LA MÈRE");
    const csv = reportCsv(rows.slice(0, 1), ["Nom", "Genre", "Scènes", "Répliques", "Mots", "Part", "Première", "Dernière"], "fr");
    expect(csv.split("\r\n")[1]).toBe("Le Petit Chaperon rouge;Fille;2;2;4;28,6;1;2");
  });
});

describe("roman", () => {
  it("scènes où le personnage est cité, dans l'ordre du livre", () => {
    const rows = novelReport({ a: "<p>Le Loup attend.</p>", b: "<p>Rien.</p>", c: "<p>Le Loup mange.</p>" }, ["a", "b", "c"], cards);
    const wolf = rows.find((r) => r.id === "l")!;
    expect([wolf.scenes, wolf.first, wolf.last]).toEqual([2, 1, 3]);
    expect(wolf.share).toBeCloseTo(2 / 3);
  });
});
