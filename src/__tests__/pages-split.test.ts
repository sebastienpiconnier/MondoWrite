// Paragraphes du livre coupés entre deux pages (#75) : ils ne laissent plus un grand blanc en bas de page.
import { describe, expect, it } from "vitest";
import { MIN_SPLIT_LINES, layoutPages, type PageItem } from "../screenplay/editor/pages";

const LH = 1.6;
/** Paragraphe du livre de `n` lignes, qui peut se couper. */
const para = (n: number): PageItem => ({ height: n * LH, margin: 0, keep: 0, lineHeight: LH });
/** Bloc qui ne se coupe pas (titre, scénario). */
const block = (height: number, keep = 0): PageItem => ({ height, margin: 0, keep });
const PAGE = 41; // 25 lignes de 1,6 et un reste de 1

describe("layoutPages : paragraphe coupé", () => {
  it("coupe le paragraphe à la dernière ligne qui tient", () => {
    // 20 lignes prises, 10 de plus : 5 tiennent, 5 passent à la page suivante.
    const { breaks, tail, pages } = layoutPages([para(20), para(10)], PAGE);
    expect(pages).toBe(2);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ index: 1, line: 5, page: 2 });
    expect(breaks[0].rest).toBeCloseTo(PAGE - 25 * LH);
    expect(tail).toBeCloseTo(PAGE - 5 * LH);
  });

  it("garde au moins deux lignes en bas de page (orpheline)", () => {
    // Une seule ligne tiendrait : tout le paragraphe passe à la page suivante.
    const { breaks } = layoutPages([para(24), para(10)], PAGE);
    expect(breaks).toEqual([{ index: 1, rest: expect.any(Number), page: 2 }]);
  });

  it("garde au moins deux lignes en haut de la page suivante (veuve)", () => {
    // 4 lignes tiendraient sur 5 : on en laisse 3 pour en porter 2 en haut.
    const { breaks } = layoutPages([para(21), para(5)], PAGE);
    expect(breaks[0].line).toBe(5 - MIN_SPLIT_LINES);
  });

  it("coupe un paragraphe plus long qu'une page en plusieurs fois", () => {
    const { breaks, pages } = layoutPages([para(60)], PAGE);
    expect(pages).toBe(3);
    expect(breaks.map((b) => b.line)).toEqual([25, 50]);
  });

  it("ne coupe jamais un élément sans hauteur de ligne", () => {
    const { breaks } = layoutPages([block(20 * LH), block(10 * LH)], PAGE);
    expect(breaks).toEqual([{ index: 1, rest: expect.any(Number), page: 2 }]);
    expect(breaks[0].line).toBeUndefined();
  });

  it("un titre garde ses lignes avec lui, puis le paragraphe suivant se coupe", () => {
    // Après 22 lignes, le titre et ses 3 lignes gardées ne tiennent plus : le titre ouvre la page suivante.
    expect(layoutPages([para(22), block(LH, 3 * LH), para(8)], PAGE).breaks).toEqual([{ index: 1, rest: expect.any(Number), page: 2 }]);
    // Après 21 lignes, le titre tient, et le paragraphe se coupe après 3 lignes.
    expect(layoutPages([para(21), block(LH, 3 * LH), para(8)], PAGE).breaks).toMatchObject([{ index: 2, line: 3, page: 2 }]);
  });
});
