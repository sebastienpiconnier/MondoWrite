import { describe, expect, it } from "vitest";
import { BIBLE_PARTS, PART_OF, bibleOrder, canMoveInPart, groupByPart, inPartOrder, isPrivatePart, moveInPart, partNumber } from "../bibleParts";
import { DEFAULT_SECTIONS, sectionOrder } from "../bibleSections";
import { CARD_TYPES, type CardType } from "../types";

describe("parties de la Bible", () => {
  it("range chaque type de carte dans une partie connue", () => {
    for (const type of CARD_TYPES) expect(BIBLE_PARTS).toContain(PART_OF[type]);
  });

  it("numérote les parties de 1 à 5, « Pour vous » en dernier et seule privée", () => {
    expect(BIBLE_PARTS.map(partNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(BIBLE_PARTS.filter(isPrivatePart)).toEqual(["pourVous"]);
  });

  it("suit l'ordre des parties, et l'ordre donné à l'intérieur de chacune", () => {
    expect(inPartOrder(["idee", "scene", "personnage", "intrigue", "theme", "lieu"])).toEqual(["theme", "personnage", "lieu", "scene", "intrigue", "idee"]);
  });

  it("donne les rubriques visibles dans l'ordre des parties, sans les rubriques masquées", () => {
    const order = bibleOrder({ order: DEFAULT_SECTIONS.order, hidden: ["image", "theme"] });
    expect(order[0]).toBe("personnage");
    expect(order).not.toContain("image");
    expect(order).not.toContain("theme");
    expect(order.slice(-4).every((t) => PART_OF[t] === "pourVous")).toBe(true);
    // Toutes les autres rubriques sont là, une seule fois.
    expect(new Set(order).size).toBe(order.length);
    expect(order.length).toBe(CARD_TYPES.length - 2);
  });

  it("regroupe par partie et omet les parties vides", () => {
    const groups = groupByPart<CardType>(["question", "personnage", "lien"], (t) => t);
    expect(groups.map((g) => g.part)).toEqual(["personnages", "pourVous"]);
    expect(groups[1].items).toEqual(["question", "lien"]);
  });

  it("déplace une rubrique seulement à l'intérieur de sa partie", () => {
    const prefs = DEFAULT_SECTIONS;
    const pourVous = sectionOrder(prefs).filter((t) => PART_OF[t] === "pourVous");
    const second = pourVous[1];
    const moved = moveInPart(prefs, second, "up");
    expect(sectionOrder(moved).filter((t) => PART_OF[t] === "pourVous")[0]).toBe(second);
    // Au bord de sa partie : rien ne change, même objet.
    expect(moveInPart(prefs, "personnage", "up")).toBe(prefs);
    expect(moveInPart(prefs, "personnage", "down")).toBe(prefs);
    expect(canMoveInPart(prefs, "personnage", "up")).toBe(false);
    expect(canMoveInPart(prefs, pourVous[0], "down")).toBe(true);
    expect(canMoveInPart(prefs, pourVous[pourVous.length - 1], "down")).toBe(false);
  });

  it("garde un ordre enregistré par une version précédente", () => {
    // Ordre ancien, intrigue avant personnage : la partie Personnages reste devant Structure.
    const prefs = { order: ["intrigue", "personnage", "lieu", "scene", "theme", "question", "image", "lien", "document", "idee"] as CardType[], hidden: [] };
    expect(bibleOrder(prefs).slice(0, 5)).toEqual(["theme", "personnage", "lieu", "intrigue", "scene"]);
  });
});
