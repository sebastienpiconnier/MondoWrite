// Couleurs des narrateurs (point de vue, 1.13.0) : huit jetons repris des couleurs de type, donc de chaque
// palette, assez contrastés sur le fond d'une carte et sur le fond du ruban (3:1, élément graphique).

import { describe, expect, it } from "vitest";

describe("couleurs des narrateurs", () => {
  it("les jetons --pov-* reprennent des couleurs de type, lisibles sur le fond dans chaque palette, en clair et en sombre", async () => {
    const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as { readFileSync: (path: URL, encoding: string) => string };
    const { PALETTES } = await import("../settings");
    const base = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const palettes = fs.readFileSync(new URL("../styles/palettes.css", import.meta.url), "utf8");
    const blockOf = (css: string, selector: string) => {
      const start = css.indexOf(`${selector} {`);
      return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start));
    };
    const tokensOf = (block: string) => Object.fromEntries(Array.from(block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g), (m) => [m[1], m[2]]));
    const alias = Object.fromEntries(Array.from(blockOf(base, ":root").matchAll(/--(pov-\d)\s*:\s*var\(--([\w-]+)\)/g), (m) => [m[1], m[2]]));
    expect(Object.keys(alias)).toHaveLength(8);
    expect(new Set(Object.values(alias)).size).toBe(8);
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const light = tokensOf(blockOf(base, ":root"));
    const dark = tokensOf(blockOf(base, ':root[data-theme="dark"]'));
    const failures: string[] = [];
    for (const palette of PALETTES)
      for (const mode of ["light", "dark"] as const) {
        const selector = mode === "light" ? `:root[data-palette="${palette}"]:not([data-theme="dark"])` : `:root[data-palette="${palette}"][data-theme="dark"]`;
        const tk: Record<string, string> = { ...(mode === "light" ? light : dark), ...tokensOf(blockOf(palettes, selector)) };
        for (const [pov, type] of Object.entries(alias))
          for (const bg of ["surface", "ground"]) if (contrast(tk[type], tk[bg]) < 3) failures.push(`${palette} ${mode} ${pov} sur ${bg} : ${contrast(tk[type], tk[bg]).toFixed(2)}`);
      }
    expect(failures).toEqual([]);
  });
});
