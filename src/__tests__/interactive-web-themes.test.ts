// Page web jouable (#122) : thèmes lisibles (contraste AA) en clair et en sombre, réglages gardés dans le projet,
// CSS de l'auteur rendu inerte.

import { describe, expect, it } from "vitest";
import { DEFAULT_WEB_PAGE, WEB_PAGE_KEY, WEB_THEMES, WEB_THEME_DEFS, readWebPage, safeCss, themeCss, withWebPage } from "../interactive/webThemes";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe("thèmes de la page web", () => {
  for (const theme of WEB_THEMES)
    for (const mode of ["light", "dark"] as const)
      it(`${theme}, ${mode} : texte, texte secondaire, boutons et focus lisibles (AA)`, () => {
        const p = WEB_THEME_DEFS[theme][mode];
        expect(contrast(p.ink, p.paper)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.soft, p.paper)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
        // Bordure des choix et contour du focus : 3:1 au moins pour un élément d'interface.
        expect(contrast(p.accent, p.paper)).toBeGreaterThanOrEqual(3);
      });

  it("donne les variables du thème, le sombre par le système ou par le lecteur", () => {
    const css = themeCss("parchemin");
    expect(css).toContain(`--paper: ${WEB_THEME_DEFS.parchemin.light.paper};`);
    expect(css).toContain(':root[data-mode="dark"]');
    expect(css).toContain('@media (prefers-color-scheme: dark) { :root:not([data-mode="light"])');
    expect(css).toContain(':root[data-size="l"] { --scale: 1.2; }');
  });

  it("relit les réglages du projet, Classique par défaut", () => {
    expect(readWebPage({})).toEqual(DEFAULT_WEB_PAGE);
    expect(readWebPage({ webPage: { theme: "inconnu", css: 3 } })).toEqual(DEFAULT_WEB_PAGE);
    expect(readWebPage({ webPage: { theme: "noir", css: "h1 { color: red }" } })).toEqual({ theme: "noir", css: "h1 { color: red }" });
  });

  it("n'écrit la clé que si un réglage s'écarte du défaut, et garde les clés d'une version future", () => {
    const meta = { interactive: true };
    expect(withWebPage(meta, { theme: "classique" })).toBe(meta);
    const noir = withWebPage(meta, { theme: "noir" });
    expect(noir).toEqual({ interactive: true, [WEB_PAGE_KEY]: { theme: "noir" } });
    expect(withWebPage(noir, { theme: "classique" })).toEqual({ interactive: true });
    const future = withWebPage({ webPage: { theme: "conte", fonts: "x" } }, { css: "p {}" });
    expect(future).toEqual({ webPage: { fonts: "x", theme: "conte", css: "p {}" } });
  });

  it("rend le CSS de l'auteur inerte", () => {
    const out = safeCss("p { color: red } </style><script>alert(1)</script> a { background: url(javascript:alert(1)); width: expression(alert(1)) }");
    expect(out).not.toMatch(/</);
    expect(out).not.toMatch(/javascript\s*:/i);
    expect(out).not.toMatch(/expression\s*\(/i);
    expect(out).toContain("p { color: red }");
  });
});
