// Rendus du PDF de la Bible (Bible v2) : Sobre, Éditorial, Nuit. Un rendu n'est qu'un jeu de jetons (polices,
// couleurs, tailles) appliqué au même document par bibleLayout.ts. Ces couleurs sont celles du papier, pas de
// l'interface : elles ne suivent pas le mode sombre et vivent donc ici, pas dans styles.css.
// Polices (licence OFL) : IBM Plex Sans et Serif, Space Grotesk (fichiers de Fontsource, déjà dans l'app pour
// l'interface) et Crimson Text (déjà embarquée pour le livre broché).

import type { BibleTheme } from "../bibleExport";

export type Rgb = readonly [number, number, number];
/** Rôles typographiques du document. */
export type FontKey = "display" | "text" | "textItalic" | "textBold" | "ui" | "uiBold";
/** Fichiers de police connus de biblePdf.ts. */
export type FontFile = "crimson" | "crimsonItalic" | "crimsonBold" | "plexSerif" | "plexSerifItalic" | "plexSerifBold" | "plexSans" | "plexSansBold" | "grotesk";

export interface Accent {
  /** Sur le papier (textes courts, filets) : contraste suffisant sur fond clair. */
  paper: Rgb;
  /** Sur une couverture ou un bandeau sombre. */
  dark: Rgb;
}

export interface ThemeDef {
  fonts: Record<FontKey, FontFile>;
  paper: Rgb;
  ink: Rgb;
  muted: Rgb;
  line: Rgb;
  /** Fond des cases (moteur d'un personnage). */
  soft: Rgb;
  cover: { dark: boolean; bg: Rgb; ink: Rgb; muted: Rgb };
  /** Bandeau sombre en haut de chaque page (Nuit). */
  band: Rgb | null;
  accents: readonly Accent[];
  size: { cover: number; h1: number; h2: number; h3: number; lead: number; body: number; small: number; kicker: number };
  /** Interligne, en multiple de la taille du texte. */
  leading: number;
}

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const acc = (paper: string, dark: string): Accent => ({ paper: hex(paper), dark: hex(dark) });

export const THEMES: Record<BibleTheme, ThemeDef> = {
  sobre: {
    fonts: { display: "plexSansBold", text: "plexSerif", textItalic: "plexSerifItalic", textBold: "plexSerifBold", ui: "plexSans", uiBold: "plexSansBold" },
    paper: hex("#ffffff"),
    ink: hex("#1b1e2e"),
    muted: hex("#5a5f73"),
    line: hex("#d9dce5"),
    soft: hex("#eef0f4"),
    cover: { dark: false, bg: hex("#ffffff"), ink: hex("#1b1e2e"), muted: hex("#5a5f73") },
    band: null,
    accents: [acc("#3f43c4", "#9a9df5"), acc("#1e7f72", "#4cc2b0"), acc("#b3392c", "#f2887c"), acc("#7a4bb0", "#c3a2ef")],
    size: { cover: 34, h1: 20, h2: 13.5, h3: 11.5, lead: 12.5, body: 10, small: 8.5, kicker: 7 },
    leading: 1.5,
  },
  editorial: {
    fonts: { display: "crimsonBold", text: "crimson", textItalic: "crimsonItalic", textBold: "crimsonBold", ui: "plexSans", uiBold: "plexSansBold" },
    paper: hex("#fffdf8"),
    ink: hex("#2a2622"),
    muted: hex("#6b6255"),
    line: hex("#e3d9c8"),
    soft: hex("#f5efe4"),
    cover: { dark: false, bg: hex("#f6efe4"), ink: hex("#1c1916"), muted: hex("#6b6255") },
    band: null,
    accents: [acc("#8a3b12", "#d29a72"), acc("#1e5f74", "#7cc0d4"), acc("#55602a", "#b5c27a"), acc("#7a2e4e", "#d68fae")],
    size: { cover: 42, h1: 23, h2: 15, h3: 13, lead: 14, body: 11.5, small: 9.5, kicker: 7 },
    leading: 1.45,
  },
  nuit: {
    fonts: { display: "grotesk", text: "plexSerif", textItalic: "plexSerifItalic", textBold: "plexSerifBold", ui: "plexSans", uiBold: "plexSansBold" },
    paper: hex("#ffffff"),
    ink: hex("#1b1e2e"),
    muted: hex("#5a5f73"),
    line: hex("#d9dce5"),
    soft: hex("#eef0f6"),
    cover: { dark: true, bg: hex("#141b2d"), ink: hex("#f4f0e8"), muted: hex("#9aa3b5") },
    band: hex("#141b2d"),
    accents: [acc("#8a6a12", "#f2c14e"), acc("#0b6e8a", "#5fc3e0"), acc("#b3392c", "#f2887c"), acc("#3f43c4", "#9a9df5")],
    size: { cover: 46, h1: 20, h2: 13.5, h3: 11.5, lead: 12.5, body: 10, small: 8.5, kicker: 7 },
    leading: 1.5,
  },
};

/** Couleur d'une pastille de la fenêtre d'export (sa couleur sur le papier), en CSS. */
export const swatch = (theme: BibleTheme, i: number) => {
  const [r, g, b] = (THEMES[theme].accents[i] ?? THEMES[theme].accents[0]).paper;
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
};

/** Polices dont un rendu a besoin, sans doublon. */
export const themeFiles = (theme: BibleTheme): FontFile[] => [...new Set(Object.values(THEMES[theme].fonts))];
