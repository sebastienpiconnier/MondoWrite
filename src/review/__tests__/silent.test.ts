// Personnages muets (#47) : noms en capitales de l'action, sans réplique ni carte.

import { describe, expect, it } from "vitest";
import { parse } from "../../screenplay/parse";
import { namesInGroup, silentCharacters } from "../silent";
import { genderSummary, screenplayReport } from "../report";
import { checkScreenplay } from "../checks";
import { LAYOUTS } from "../../screenplay/layout";
import type { CardData } from "../../types";

const script = `INT. PHARE - NUIT

INÈS (34 ans) monte l'escalier. Le GARDIEN la suit sans un mot.

INÈS
Tu viens ?

GROS PLAN sur la LANTERNE. Un coup de feu : BANG !

EXT. CÔTE - JOUR

Sur la jetée, MARIE ET PAUL regardent le PHARE. Le gardien fume.

NOIR.

Inès revient, CONT'D. Une page du chapitre II.
`;

const names = (cards: CardData[] = []) => silentCharacters(parse(script).elements, cards).map((c) => c.name);

describe("namesInGroup", () => {
  it("coupe sur les mots qui joignent et retire les termes techniques aux bords", () => {
    expect(namesInGroup("MARIE ET PAUL")).toEqual(["MARIE", "PAUL"]);
    expect(namesInGroup("GROS PLAN")).toEqual([]);
    expect(namesInGroup("GROS PLAN SUR MARIE")).toEqual(["MARIE"]);
    expect(namesInGroup("LA MÈRE")).toEqual(["LA MÈRE"]);
    expect(namesInGroup("DE LA")).toEqual([]);
    expect(namesInGroup("CONT'D")).toEqual([]);
    expect(namesInGroup("II")).toEqual([]);
  });
});

describe("silentCharacters", () => {
  it("relève les muets, pas ceux qui parlent, les décors, les bruits ni les termes techniques", () => {
    expect(names()).toEqual(["GARDIEN", "LANTERNE", "MARIE", "PAUL"]);
  });

  it("écarte ce qui a déjà une carte (personnage, surnom, objet)", () => {
    const cards: CardData[] = [
      { id: "g", type: "personnage", title: "Le Gardien", html: "", fiche: { surnoms: "Gardien" } },
      { id: "l", type: "objet", title: "Lanterne", html: "" },
      { id: "m", type: "personnage", title: "Marie Morvan", html: "" },
    ];
    expect(names(cards)).toEqual(["PAUL"]);
  });

  it("garde l'élément de la première apparition", () => {
    const elements = parse(script).elements;
    const gardien = silentCharacters(elements, []).find((c) => c.name === "GARDIEN")!;
    expect(elements[gardien.first].text).toContain("Le GARDIEN la suit");
  });
});

describe("Statistiques et Vérifier", () => {
  const elements = parse(script).elements;

  it("une ligne sans réplique par muet, hors répartition par genre", () => {
    const rows = screenplayReport(elements, [], "fr", ["GARDIEN"]);
    const gardien = rows.find((r) => r.name === "GARDIEN")!;
    expect(gardien).toMatchObject({ id: null, lines: 0, scenes: 2, first: 1, last: 2 });
    expect(genderSummary(rows).reduce((n, g) => n + g.characters, 0)).toBe(1);
    // Un nom qui parle n'est pas ajouté deux fois.
    expect(screenplayReport(elements, [], "fr", ["INÈS"]).filter((r) => r.name === "INÈS")).toHaveLength(1);
  });

  it("un point par muet sans carte", () => {
    const found = checkScreenplay(elements, LAYOUTS.letter, [], "fr").filter((f) => f.rule === "silentCharacter");
    expect(found.map((f) => f.names![0])).toEqual(["GARDIEN", "LANTERNE", "MARIE", "PAUL"]);
    expect(found[0].scene).toBe(1);
  });
});
