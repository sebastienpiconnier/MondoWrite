// Mode focus à la iA Writer (1.11.0) : mise en valeur qui défile, mots de la séance, largeur de la colonne.
import { describe, expect, it } from "vitest";
import { FOCUS_COLUMN_EM, FOCUS_COLUMNS, FOCUS_HIGHLIGHTS, isFocusColumn, nextHighlight, sessionDelta } from "../focusText";

describe("mode focus", () => {
  it("fait défiler toutes les mises en valeur puis revient au début", () => {
    let h = FOCUS_HIGHLIGHTS[0];
    const seen = [h];
    for (let i = 1; i < FOCUS_HIGHLIGHTS.length; i++) seen.push((h = nextHighlight(h)));
    expect(seen).toEqual(FOCUS_HIGHLIGHTS);
    expect(nextHighlight(h)).toBe(FOCUS_HIGHLIGHTS[0]);
  });

  it("compte les mots de la séance avec leur signe", () => {
    const num = (n: number) => new Intl.NumberFormat("fr").format(n);
    expect(sessionDelta(100, 1350, num)).toBe("+1 250");
    expect(sessionDelta(100, 100, num)).toBe("+0");
    expect(sessionDelta(100, 65, num)).toBe("−35");
  });

  it("a trois largeurs de colonne croissantes, et refuse une valeur inconnue", () => {
    const widths = FOCUS_COLUMNS.map((c) => FOCUS_COLUMN_EM[c]);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
    expect(isFocusColumn("medium")).toBe(true);
    expect(isFocusColumn("huge")).toBe(false);
  });
});
