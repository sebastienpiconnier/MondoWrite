// Longueur des scènes en huitièmes de page (#44).

import { describe, expect, it } from "vitest";
import type { ScreenplayElement } from "../model";
import { LAYOUTS } from "../layout";
import { paginate } from "../paginate";
import { eighthsBetween, eighthsByCard, eighthsOf, formatEighths } from "../eighths";

const letter = LAYOUTS.letter; // 55 lignes : un huitième fait 6,875 lignes
const heading = (text: string, cardId?: string): ScreenplayElement => ({ type: "sceneHeading", text, cardId });
/** Un paragraphe d'action d'exactement `n` lignes. */
const block = (n: number): ScreenplayElement => ({ type: "action", text: Array.from({ length: n }, () => "x").join("\n") });

describe("eighthsOf", () => {
  it("rien sans texte, au moins un huitième sinon", () => {
    expect(eighthsOf(0)).toBe(0);
    expect(eighthsOf(Number.NaN)).toBe(0);
    expect(eighthsOf(0.01)).toBe(1);
  });

  it("arrondit au huitième supérieur, sans compter les erreurs d'arrondi", () => {
    expect(eighthsOf(1 / 8)).toBe(1);
    expect(eighthsOf(7 / 56)).toBe(1);
    expect(eighthsOf(1 / 8 + 0.001)).toBe(2);
    expect(eighthsOf(1)).toBe(8);
    expect(eighthsOf(1 + 1 / 55)).toBe(9);
  });
});

describe("formatEighths", () => {
  it("fraction, page entière, pages et fraction", () => {
    expect(formatEighths(0)).toBe("");
    expect(formatEighths(3)).toBe("3/8");
    expect(formatEighths(8)).toBe("1");
    expect(formatEighths(10)).toBe("1 2/8");
    expect(formatEighths(16)).toBe("2");
  });
});

describe("scènes", () => {
  it("compte les lignes de la scène, en-tête compris, même coupée entre deux pages", () => {
    const elements = [heading("INT. PHARE - NUIT", "a"), block(5), heading("EXT. CÔTE - JOUR", "b"), block(70), heading("INT. CUISINE - JOUR")];
    const pagination = paginate(elements, letter);
    // En-tête (1) + ligne vide + 5 lignes = 7 lignes : un peu plus d'un huitième.
    expect(eighthsBetween(pagination, 0, 2)).toBe(2);
    const byCard = eighthsByCard(elements, pagination);
    expect(byCard.get("a")).toBe(2);
    // 1 ligne vide + en-tête + ligne vide + 70 lignes = 73 lignes, sur deux pages : 1 page et 3/8 (10,6 huitièmes).
    expect(byCard.get("b")).toBe(11);
    expect(byCard.size).toBe(2);
  });
});
