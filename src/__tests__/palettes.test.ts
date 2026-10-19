import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE, PALETTES, isPalette } from "../settings";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as { readFileSync: (path: URL, encoding: string) => string };
const css = fs.readFileSync(new URL("../styles/palettes.css", import.meta.url), "utf8");

describe("palettes de couleurs", () => {
  it("Encre est la palette par défaut", () => {
    expect(DEFAULT_PALETTE).toBe("encre");
    expect(PALETTES[0]).toBe("encre");
  });
  it("reconnaît seulement les palettes connues", () => {
    expect(isPalette("orange")).toBe(true);
    expect(isPalette("rose")).toBe(false);
    expect(isPalette(undefined)).toBe(false);
  });
  it("chaque palette a sa version claire et sa version sombre", () => {
    for (const id of PALETTES) {
      expect(css).toContain(`:root[data-palette="${id}"]:not([data-theme="dark"])`);
      expect(css).toContain(`:root[data-palette="${id}"][data-theme="dark"]`);
    }
  });
  it("chaque palette a son nom en français et en anglais", () => {
    for (const id of PALETTES) {
      expect(fr.settings.palettes[id]).toBeTruthy();
      expect(en.settings.palettes[id]).toBeTruthy();
    }
  });
});
