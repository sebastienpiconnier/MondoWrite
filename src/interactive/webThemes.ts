// Page web jouable (#122) : thèmes de la page, en variables CSS, chacun en clair et en sombre, et réglages de la page
// gardés dans le projet (`webPage` de cosmos.json, clé hors de `KNOWN_META`, gardée par `metaKeep`). Fonctions pures.
//
// Les clés des thèmes sont écrites dans le fichier : ne jamais les renommer ni les traduire.

export const WEB_THEMES = ["classique", "parchemin", "noir", "terminal", "conte"] as const;
export type WebTheme = (typeof WEB_THEMES)[number];

/** Couleurs d'un thème dans un mode : encre, texte secondaire, filets, papier, accent et encre sur l'accent. */
export interface WebPalette {
  ink: string;
  soft: string;
  rule: string;
  paper: string;
  accent: string;
  accentInk: string;
}

export interface WebThemeDef {
  light: WebPalette;
  dark: WebPalette;
  /** Pile de polices du texte (polices du système : la page reste légère et hors ligne). */
  font: string;
  /** Taille du texte de base, en rem. */
  base: number;
  /** Interligne. */
  leading: number;
  /** Largeur de la colonne. */
  measure: string;
  /** Arrondi des boutons, en px. */
  radius: number;
}

const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';

export const WEB_THEME_DEFS: Readonly<Record<WebTheme, WebThemeDef>> = {
  // Le thème d'avant le lot : même papier, même encre, même police.
  classique: {
    light: { ink: "#1f2128", soft: "#5b5f6b", rule: "#d6d8de", paper: "#fdfcf9", accent: "#2f5fb3", accentInk: "#ffffff" },
    dark: { ink: "#d4d6de", soft: "#a3a7b3", rule: "#3a3e4c", paper: "#181a22", accent: "#8fb1ee", accentInk: "#10131a" },
    font: SERIF,
    base: 1.125,
    leading: 1.65,
    measure: "38em",
    radius: 8,
  },
  parchemin: {
    light: { ink: "#3b2a1a", soft: "#664d33", rule: "#c9b48f", paper: "#f4ead5", accent: "#8a3b12", accentInk: "#ffffff" },
    dark: { ink: "#ecdfc6", soft: "#c2ae8c", rule: "#4a3a28", paper: "#221a12", accent: "#e3a76c", accentInk: "#1d150d" },
    font: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
    base: 1.15,
    leading: 1.7,
    measure: "36em",
    radius: 4,
  },
  noir: {
    light: { ink: "#141414", soft: "#4a4a4a", rule: "#bdbdbd", paper: "#f0f0ee", accent: "#9b1c1c", accentInk: "#ffffff" },
    dark: { ink: "#dcdcdc", soft: "#a0a0a0", rule: "#333333", paper: "#0b0b0c", accent: "#ec6b6b", accentInk: "#0b0b0c" },
    font: 'Baskerville, "Baskerville Old Face", Georgia, "Times New Roman", serif',
    base: 1.125,
    leading: 1.6,
    measure: "36em",
    radius: 0,
  },
  terminal: {
    light: { ink: "#18261a", soft: "#3d573f", rule: "#b8c7b4", paper: "#f3f6ef", accent: "#1d6a2c", accentInk: "#ffffff" },
    dark: { ink: "#b8f5b0", soft: "#7fbf78", rule: "#234023", paper: "#0a100a", accent: "#62e36d", accentInk: "#08100a" },
    font: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    base: 1,
    leading: 1.6,
    measure: "68ch",
    radius: 2,
  },
  conte: {
    light: { ink: "#2a2440", soft: "#564e72", rule: "#e2d6bd", paper: "#fffaf0", accent: "#6a3fb5", accentInk: "#ffffff" },
    dark: { ink: "#ece6ff", soft: "#bcb4da", rule: "#3b3555", paper: "#1d1a2b", accent: "#c7adff", accentInk: "#1b1530" },
    font: '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
    base: 1.35,
    leading: 1.7,
    measure: "32em",
    radius: 14,
  },
};

export const isWebTheme = (value: unknown): value is WebTheme => typeof value === "string" && (WEB_THEMES as readonly string[]).includes(value);

const vars = (p: WebPalette) => `--ink: ${p.ink}; --soft: ${p.soft}; --rule: ${p.rule}; --paper: ${p.paper}; --accent: ${p.accent}; --accent-ink: ${p.accentInk};`;

/**
 * Variables du thème. Le mode suit le système, sauf si le lecteur en a choisi un (`data-mode` sur `<html>`, gardé par
 * son navigateur). La taille du texte se règle par `data-size` (petit, normal, grand).
 */
export function themeCss(theme: WebTheme): string {
  const d = WEB_THEME_DEFS[theme];
  return (
    `:root { color-scheme: light; ${vars(d.light)} --font: ${d.font}; --base: ${d.base}rem; --leading: ${d.leading}; --measure: ${d.measure}; --radius: ${d.radius}px; --scale: 1; }\n` +
    `:root[data-mode="dark"] { color-scheme: dark; ${vars(d.dark)} }\n` +
    `@media (prefers-color-scheme: dark) { :root:not([data-mode="light"]) { color-scheme: dark; ${vars(d.dark)} } }\n` +
    `:root[data-size="s"] { --scale: 0.9; }\n:root[data-size="l"] { --scale: 1.2; }\n`
  );
}

/** Longueur maximale du CSS personnalisé (au-delà, coupé). */
export const MAX_CUSTOM_CSS = 20000;

/**
 * CSS personnalisé posé dans un `<style>` : rien ne peut fermer la balise ni ouvrir un commentaire HTML. Un `<` devient
 * son échappement CSS (`\3C `), le même caractère pour le navigateur dans une chaîne, sans effet ailleurs. Les
 * vieilles portes vers du script (`expression(`, `javascript:`, `behavior:`) sont neutralisées.
 */
export function safeCss(css: string): string {
  return css
    .slice(0, MAX_CUSTOM_CSS)
    .replace(/</g, "\\3C ")
    .replace(/expression\s*\(/gi, "/* */(")
    .replace(/javascript\s*:/gi, "/* */:")
    .replace(/(-moz-binding|behavior)\s*:/gi, "/* */:");
}

/** Réglages de la page web gardés dans le projet. */
export interface WebPageOptions {
  theme: WebTheme;
  /** CSS de l'auteur, appliqué après le thème. */
  css: string;
}

export const WEB_PAGE_KEY = "webPage";
export const DEFAULT_WEB_PAGE: WebPageOptions = { theme: "classique", css: "" };

/** Réglages relus dans `metaKeep` : un thème inconnu redevient Classique, un CSS qui n'est pas un texte est ignoré. */
export function readWebPage(metaKeep: Readonly<Record<string, unknown>>): WebPageOptions {
  const raw = metaKeep[WEB_PAGE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_WEB_PAGE;
  const r = raw as Record<string, unknown>;
  return {
    theme: isWebTheme(r.theme) ? r.theme : DEFAULT_WEB_PAGE.theme,
    css: typeof r.css === "string" ? r.css.slice(0, MAX_CUSTOM_CSS) : "",
  };
}

/**
 * `metaKeep` après un changement des réglages : la clé disparaît quand tout revient au défaut (un projet sans réglage
 * s'exporte comme avant). Même objet si rien ne change. Les clés qu'une version future aurait ajoutées restent.
 */
export function withWebPage(metaKeep: Readonly<Record<string, unknown>>, patch: Partial<WebPageOptions>): Record<string, unknown> {
  const before = readWebPage(metaKeep);
  const next: WebPageOptions = {
    theme: patch.theme !== undefined && isWebTheme(patch.theme) ? patch.theme : before.theme,
    css: patch.css !== undefined ? patch.css.slice(0, MAX_CUSTOM_CSS) : before.css,
  };
  if (next.theme === before.theme && next.css === before.css) return metaKeep as Record<string, unknown>;
  const raw = metaKeep[WEB_PAGE_KEY];
  const kept = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  delete kept.theme;
  delete kept.css;
  const value: Record<string, unknown> = { ...kept };
  if (next.theme !== DEFAULT_WEB_PAGE.theme) value.theme = next.theme;
  if (next.css.trim()) value.css = next.css;
  const out: Record<string, unknown> = { ...metaKeep };
  if (Object.keys(value).length) out[WEB_PAGE_KEY] = value;
  else delete out[WEB_PAGE_KEY];
  return out;
}
