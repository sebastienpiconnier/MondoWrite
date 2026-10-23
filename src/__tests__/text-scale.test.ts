// Taille du texte du système (iPad, iPhone) : rapport à 17 pt, borné ; contraste du système sur la palette ;
// zoom de la page du manuscrit et du scénario.

import { describe, expect, it } from "vitest";
import { MAX_SCALE, MIN_SCALE, textScale } from "../textScale";
import { PAGE_ZOOMS, nextZoom, shownPalette } from "../settings";

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


describe("zoom de la page", () => {
  it("cran par cran, borné aux deux bouts", () => {
    expect(nextZoom(1, 1)).toBe(1.15);
    expect(nextZoom(1, -1)).toBe(0.9);
    expect(nextZoom(PAGE_ZOOMS[0], -1)).toBe(PAGE_ZOOMS[0]);
    expect(nextZoom(2, 1)).toBe(2);
  });
  it("taille normale", () => {
    expect(nextZoom(1.75, 0)).toBe(1);
  });
  it("valeur entre deux crans : on part du cran le plus proche dans le sens demandé", () => {
    expect(nextZoom(1.2, 1)).toBe(1.3);
    expect(nextZoom(1.2, -1)).toBe(1.15);
  });
});
