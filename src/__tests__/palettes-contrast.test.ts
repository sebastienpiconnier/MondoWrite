// Contraste AA (4,5:1) de tous les textes, dans chaque palette, en clair et en sombre : textes, textes
// indicatifs, couleurs de type et de statut (écrites en texte), texte estompé du mode focus.

import { describe, expect, it } from "vitest";
import { PALETTES } from "../settings";

const fs = (await import(/* @vite-ignore */ "node:" + "fs")) as { readFileSync: (path: URL, encoding: string) => string };
const base = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const palettes = fs.readFileSync(new URL("../styles/palettes.css", import.meta.url), "utf8");

type Tokens = Record<string, string>;
const tokensOf = (block: string): Tokens => Object.fromEntries(Array.from(block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g), (m) => [m[1], m[2]]));
const blockOf = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("\n}", start));
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const lightBase = tokensOf(blockOf(base, ":root"));
const darkBase = tokensOf(blockOf(base, ':root[data-theme="dark"]'));

/** Texte (avant) sur fond (après). */
const PAIRS: [string, string][] = [
  ["ink", "surface"],
  ["ink", "ground"],
  ["ink-2", "surface"],
  ["muted", "surface"],
  ["muted", "ground"],
  ["placeholder", "surface"],
  ["accent", "surface"],
  ["accent-ink", "accent-soft"],
  ["strong-fg", "strong-bg"],
  ["page-ink", "page"],
  ["page-ink-dim", "page"],
  // Passages commentés (1.13.0) : le texte de la page sur le fond du commentaire (alias de --accent-soft).
  ["page-ink", "accent-soft"],
  ["ink", "accent-soft"],
  ["danger", "surface"],
  // Mode Atelier : le repère « Atelier » et le soulignement des passages de l'IA (sur la page du manuscrit aussi).
  ["ia-mark", "surface"],
  ["ia-mark", "page"],
  ["ia-mark", "ground"],
  ...["idee", "personnage", "lieu", "scene", "theme", "intrigue", "lien", "image", "document", "question", "episode", "groupe", "objet", "evenement", "regle", "secret"].map((t): [string, string] => [`type-${t}`, "surface"]),
  ...["todo", "draft", "revise", "revised", "done"].map((s): [string, string] => [`status-${s}`, "surface"]),
];

describe("contraste AA dans toutes les palettes", () => {
  for (const palette of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      it(`${palette}, ${mode === "light" ? "clair" : "sombre"}`, () => {
        const selector = mode === "light" ? `:root[data-palette="${palette}"]:not([data-theme="dark"])` : `:root[data-palette="${palette}"][data-theme="dark"]`;
        const tokens = { ...(mode === "light" ? lightBase : darkBase), ...tokensOf(blockOf(palettes, selector)) };
        const failures = PAIRS.filter(([fg, bg]) => tokens[fg] && tokens[bg] && contrast(tokens[fg], tokens[bg]) < 4.5).map(
          ([fg, bg]) => `${fg} ${tokens[fg]} sur ${bg} ${tokens[bg]} : ${contrast(tokens[fg], tokens[bg]).toFixed(2)}`,
        );
        expect(failures).toEqual([]);
      });
    }
  }
});

// Scène en cours (#156) : le trait de la marge (encre de la page à 55 % sur la page, `.scene-rail`) et la barre des
// listes des scènes (encre sur le fond de la scène en cours) se voient sans la couleur : 3:1 au moins (WCAG 1.4.11).
const mix = (a: string, b: string, share: number) =>
  "#" +
  [1, 3, 5]
    .map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * share + parseInt(b.slice(i, i + 2), 16) * (1 - share)))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");

describe("scène en cours visible sans la couleur (#156)", () => {
  for (const palette of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      it(`${palette}, ${mode === "light" ? "clair" : "sombre"}`, () => {
        const selector = mode === "light" ? `:root[data-palette="${palette}"]:not([data-theme="dark"])` : `:root[data-palette="${palette}"][data-theme="dark"]`;
        const tk = { ...(mode === "light" ? lightBase : darkBase), ...tokensOf(blockOf(palettes, selector)) };
        expect(contrast(mix(tk["page-ink"], tk.page, 0.55), tk.page)).toBeGreaterThanOrEqual(3);
        expect(contrast(tk.ink, tk["accent-soft"])).toBeGreaterThanOrEqual(3);
        expect(contrast(tk.ink, tk.surface)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
