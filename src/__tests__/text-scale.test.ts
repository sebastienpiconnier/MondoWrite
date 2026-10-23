// Taille du texte du système (iPad, iPhone) : rapport à 17 pt, borné ; contraste du système sur la palette.

import { describe, expect, it } from "vitest";
import { MAX_SCALE, MIN_SCALE, textScale } from "../textScale";
import { shownPalette } from "../settings";

describe("taille du texte du système", () => {
  it("17 pt (défaut d'iOS) : rien ne change", () => {
    expect(textScale(17)).toBe(1);
  });
  it("plus grand : proportionnel", () => {
    expect(textScale(21)).toBeCloseTo(21 / 17);
  });
  it("tailles d'accessibilité : plafonnées", () => {
    expect(textScale(53)).toBe(MAX_SCALE);
    expect(textScale(10)).toBe(MIN_SCALE);
  });
  it("valeur absurde : rien ne change", () => {
    expect(textScale(Number.NaN)).toBe(1);
    expect(textScale(0)).toBe(1);
  });
});

describe("Augmenter le contraste", () => {
  it("impose la palette Contraste sans toucher au choix enregistré", () => {
    expect(shownPalette("sepia", true)).toBe("contraste");
    expect(shownPalette("sepia", false)).toBe("sepia");
  });
});
