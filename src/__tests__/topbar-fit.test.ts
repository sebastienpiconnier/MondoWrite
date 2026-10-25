import { describe, expect, it } from "vitest";
import { needsTwoRows } from "../components/useTopbarFit";

describe("barre du haut sur une ou deux lignes", () => {
  it("une ligne quand tout tient", () => {
    expect(needsTwoRows(1366, 260, 420, 560, 16)).toBe(false);
  });
  it("deux lignes quand les vues passeraient sur le logo (texte agrandi, scénario)", () => {
    expect(needsTwoRows(1366, 300, 600, 640, 16)).toBe(true);
  });
});
