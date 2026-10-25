import { describe, expect, it } from "vitest";
import { needsTwoRows, topbarLayout } from "../components/useTopbarFit";

describe("barre du haut sur une ou deux lignes", () => {
  it("une ligne quand tout tient", () => {
    expect(needsTwoRows(1366, 260, 420, 560, 16)).toBe(false);
  });
  it("deux lignes quand les vues passeraient sur le logo (texte agrandi, scénario)", () => {
    expect(needsTwoRows(1366, 300, 600, 640, 16)).toBe(true);
  });
});

describe("barre compacte avant deux lignes", () => {
  it("garde les libellés quand tout tient", () => {
    expect(topbarLayout(1366, 220, 340, 450, 450, false, 16)).toEqual({ compact: false, stacked: false });
  });
  it("passe en icônes d'abord, sur une ligne (iPad en paysage)", () => {
    expect(topbarLayout(960, 220, 340, 450, 450, false, 16)).toEqual({ compact: true, stacked: false });
    expect(topbarLayout(960, 220, 340, 450, 300, true, 16)).toEqual({ compact: true, stacked: false });
  });
  it("puis sur deux lignes si les icônes ne suffisent pas (iPad en portrait)", () => {
    expect(topbarLayout(790, 220, 340, 450, 300, true, 16)).toEqual({ compact: true, stacked: true });
  });
  it("revient aux libellés quand la fenêtre s'élargit", () => {
    expect(topbarLayout(1366, 220, 340, 450, 300, true, 16)).toEqual({ compact: false, stacked: false });
  });
});
