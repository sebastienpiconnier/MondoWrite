import { describe, expect, it } from "vitest";
import { BIBLE_PARTS, PART_OF, bibleOrder, groupByPart, inPartOrder, isPrivatePart, moveInPart, partNumber } from "../bibleParts";
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
    const prefs = { order: DEFAULT_SECTIONS.order, hidden: ["image"] as CardType[] };
    const order = sectionOrder(prefs);
    const part = (t: CardType) => PART_OF[t] === "pourVous";
    const [a, b, c, d, e] = order.filter(part);
    const moved = moveInPart(prefs, a, d);
    expect(moved.order.filter(part)).toEqual([b, c, d, a, e]);
    expect(moved.order.filter((type) => !part(type))).toEqual(order.filter((type) => !part(type)));
    expect(moved.hidden).toBe(prefs.hidden);
    expect(moveInPart(moved, a, b).order).toEqual(order);
    expect(moveInPart(prefs, a, a)).toBe(prefs);
    expect(moveInPart(prefs, a, "personnage")).toBe(prefs);
  });

  it("garde un ordre enregistré par une version précédente", () => {
    // Ordre ancien, intrigue avant personnage : la partie Personnages reste devant Structure.
    const prefs = { order: ["intrigue", "personnage", "lieu", "scene", "theme", "question", "image", "lien", "document", "idee"] as CardType[], hidden: [] };
    expect(bibleOrder(prefs).slice(0, 10)).toEqual(["theme", "personnage", "lieu", "groupe", "objet", "evenement", "regle", "intrigue", "episode", "secret"]);
  });
});
