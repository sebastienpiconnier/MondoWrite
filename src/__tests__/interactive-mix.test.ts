// Roman interactif, lot 13 (#93) : mélange sans sections reliées voisines, et double page du livre broché.

import { describe, expect, it } from "vitest";
import { mixSections } from "../interactive/mix";
import { sameSpread, spreadOf } from "../interactive/spreads";
import { renumberSections } from "../interactive/sections";

/** Un livre de n sections où chacune mène aux deux suivantes (beaucoup de liens). */
const book = (n: number) => {
  const ids = Array.from({ length: n }, (_, i) => `s${i}`);
  const links = new Map(ids.map((id, i) => [id, [ids[i + 1], ids[i + 2]].filter(Boolean) as string[]]));
  return { ids, links };
};

describe("mélange des numéros", () => {
  it("ne laisse aucune section reliée voisine d'une autre quand c'est possible, toujours de la même façon", () => {
    const { ids, links } = book(300);
    const a = mixSections(ids, links, { s0: 1 }, 42);
    expect(a.neighbours).toBe(0);
    expect(a.numbers.s0).toBe(1);
    expect(new Set(Object.values(a.numbers)).size).toBe(300);
    expect(Math.max(...Object.values(a.numbers))).toBe(300);
    expect(mixSections(ids, links, { s0: 1 }, 42)).toEqual(a);
    for (const [from, list] of links) for (const to of list) expect(Math.abs(a.numbers[from] - a.numbers[to])).not.toBe(1);
  });

  it("garde les numéros figés et dit quand ce n'est pas possible", () => {
    const { ids, links } = book(40);
    const r = renumberSections(ids, { numbers: { s0: 1, s5: 17 }, locked: ["s5"] }, links, 3);
    expect(r.state.numbers.s0).toBe(1);
    expect(r.state.numbers.s5).toBe(17);
    expect(r.neighbours).toBe(0);
    // Trois sections toutes reliées entre elles : deux sont forcément voisines.
    const tight = mixSections(["a", "b", "c"], new Map([["a", ["b", "c"]], ["b", ["c"]]]), { a: 1 }, 1);
    expect(tight.neighbours).toBeGreaterThan(0);
  });
});

describe("double page", () => {
  it("regroupe les pages 2 et 3, 4 et 5…", () => {
    expect([0, 1, 2, 3, 4].map(spreadOf)).toEqual([0, 1, 1, 2, 2]);
  });

  it("repère une suite visible sur la même double page, même à cheval sur deux pages", () => {
    const spans = { 1: [1, 1], 2: [2, 3], 7: [3, 3], 9: [6, 6] } as Record<number, [number, number]>;
    expect(sameSpread(spans, [{ from: 1, to: 2 }, { from: 2, to: 7 }, { from: 1, to: 9 }, { from: 1, to: 2 }])).toEqual([
      { from: 1, to: 2 },
      { from: 2, to: 7 },
    ]);
  });
});
