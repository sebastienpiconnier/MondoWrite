// Liseré du type sur les cartes : chaque type a sa couleur dans les deux thèmes, assez contrastée sur le
// fond d'une carte (3:1, seuil d'un élément graphique), et le liseré la lit sur la carte.

import { describe, expect, it } from "vitest";
import { CARD_TYPES } from "../types";

// Lecture directe des feuilles de style (Vitest ne charge pas le CSS importé ; pas de types Node dans le projet).
const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as { readFileSync: (path: URL, encoding: string) => string };
const tokens = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const canvas = fs.readFileSync(new URL("../styles/canvas.css", import.meta.url), "utf8");
const block = (selector: string) => tokens.slice(tokens.indexOf(`${selector} {`), tokens.indexOf("}", tokens.indexOf(`${selector} {`)));
const color = (css: string, name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1];

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("liseré du type", () => {
  for (const [theme, selector] of [["clair", ":root"], ["sombre", ':root[data-theme="dark"]']] as const) {
    it(`thème ${theme} : les dix types ont une couleur lisible sur une carte`, () => {
      const css = block(selector);
      const surface = color(css, "surface")!;
      for (const type of CARD_TYPES) {
        const c = color(css, `type-${type}`);
        expect(c, type).toBeDefined();
        expect(contrast(c!, surface), type).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("la carte le dessine à gauche, la sélection reste à l'accent", () => {
    expect(canvas).toMatch(/\.card::before\s*{[^}]*background: var\(--type\)/);
    expect(canvas).toMatch(/\.card\.is-selected\s*{[^}]*border-color: var\(--accent\)/);
  });
});
