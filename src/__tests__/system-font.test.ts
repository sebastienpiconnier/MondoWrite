// Police de l'ordinateur pour la page (discussion #61) : nom nettoyé, pile CSS, liste des familles.
import { describe, expect, it } from "vitest";
import { cleanFontName, pageFontStack, PAGE_FONT_STACKS, readWritingForTest } from "../settings";
import { uniqueSorted } from "../systemFonts";

describe("police de l'ordinateur", () => {
  it("garde un nom de police lisible et retire ce qui casserait la règle CSS", () => {
    expect(cleanFontName("  Baskerville   Old Face ")).toBe("Baskerville Old Face");
    expect(cleanFontName('Evil"; } body { x')).toBe("Evil body x");
    expect(cleanFontName(42)).toBe("");
    expect(cleanFontName("x".repeat(200))).toHaveLength(80);
  });
  it("met la police nommée devant la police par défaut, seulement si on l'a choisie", () => {
    expect(pageFontStack("system", "Baskerville")).toBe(`"Baskerville", ${PAGE_FONT_STACKS.plex}`);
    expect(pageFontStack("system", "")).toBe(PAGE_FONT_STACKS.plex);
    expect(pageFontStack("garamond", "Baskerville")).toBe(PAGE_FONT_STACKS.garamond);
  });
  it("relit le réglage prudemment", () => {
    expect(readWritingForTest({ pageFont: "system", customFont: "Optima<" })).toMatchObject({ pageFont: "system", customFont: "Optima" });
    expect(readWritingForTest({}).customFont).toBe("");
  });
  it("trie les familles sans doublon ni famille cachée", () => {
    expect(uniqueSorted(["Optima", "arial", "Arial", ".SF NS", " ", "Baskerville"])).toEqual(["arial", "Baskerville", "Optima"]);
  });
});
