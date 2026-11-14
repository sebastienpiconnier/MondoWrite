// Polices du titre et du nom sur la couverture complète (#78, lot 2) : six jeux, proposés selon le genre lu dans
// la couverture du projet, comme les styles d'image (coverGenre de ai/imageGen.ts). Toutes sous licence OFL,
// chargées seulement à l'export (paperbackPdf.ts). Module pur : les clés sont écrites dans cosmos.json
// (`coverDesign.font`), ne jamais les renommer ni les traduire.

import type { CoverGenre } from "../ai/imageGen";

export const COVER_FONT_SETS = ["classic", "elegant", "modern", "condensed", "script", "epic"] as const;
export type CoverFontSet = (typeof COVER_FONT_SETS)[number];
/** Choix de l'auteur : « auto » suit le genre de la couverture. */
export const COVER_FONTS = ["auto", ...COVER_FONT_SETS] as const;
export type CoverFontChoice = (typeof COVER_FONTS)[number];

/** Fichiers de police connus de l'export (paperbackPdf.ts les charge). */
export type CoverFontFile =
  | "crimson"
  | "crimsonBold"
  | "playfair"
  | "playfairBold"
  | "plexSans"
  | "plexSansBold"
  | "oswald"
  | "oswaldBold"
  | "dancingBold"
  | "cinzel"
  | "cinzelBold";

/** Hauteur des capitales de chaque fichier, en fraction du corps (mesurée dans les polices). */
export const CAP_HEIGHTS: Record<CoverFontFile, number> = {
  crimson: 0.64,
  crimsonBold: 0.64,
  playfair: 0.708,
  playfairBold: 0.708,
  plexSans: 0.698,
  plexSansBold: 0.698,
  oswald: 0.81,
  oswaldBold: 0.81,
  dancingBold: 0.72,
  cinzel: 0.7,
  cinzelBold: 0.7,
};

export interface CoverFontSpec {
  /** Titre du premier plat. */
  title: CoverFontFile;
  /** Nom de l'auteur du premier plat (en capitales espacées). */
  author: CoverFontFile;
  /** Titre et nom sur le dos : une police lisible petite (une manuscrite ne l'est pas). */
  spineTitle: CoverFontFile;
  spineAuthor: CoverFontFile;
  /** Titre écrit en capitales (les polices condensées se lisent mieux ainsi). */
  titleUpper: boolean;
  /** Interligne du titre, en fraction du corps. */
  lead: number;
}

export const COVER_FONT_SPECS: Record<CoverFontSet, CoverFontSpec> = {
  classic: { title: "crimsonBold", author: "crimson", spineTitle: "crimsonBold", spineAuthor: "crimson", titleUpper: false, lead: 1.08 },
  elegant: { title: "playfairBold", author: "playfair", spineTitle: "playfairBold", spineAuthor: "playfair", titleUpper: false, lead: 1.1 },
  modern: { title: "plexSansBold", author: "plexSans", spineTitle: "plexSansBold", spineAuthor: "plexSans", titleUpper: false, lead: 1.08 },
  condensed: { title: "oswaldBold", author: "oswald", spineTitle: "oswaldBold", spineAuthor: "oswald", titleUpper: true, lead: 1.02 },
  script: { title: "dancingBold", author: "crimson", spineTitle: "crimsonBold", spineAuthor: "crimson", titleUpper: false, lead: 1.15 },
  epic: { title: "cinzelBold", author: "cinzel", spineTitle: "cinzelBold", spineAuthor: "cinzel", titleUpper: false, lead: 1.1 },
};

/** Jeux conseillés pour chaque famille de genres, le premier pris en automatique. */
export const GENRE_FONTS: Record<CoverGenre, CoverFontSet[]> = {
  thriller: ["condensed", "modern"],
  horror: ["condensed", "epic"],
  romcom: ["script", "modern"],
  romance: ["script", "elegant"],
  fantasy: ["epic", "elegant"],
  scifi: ["modern", "condensed"],
  historical: ["elegant", "epic", "classic"],
  youth: ["modern", "script"],
  literary: ["elegant", "classic"],
};

/** Jeu réellement employé : « auto » prend le premier jeu conseillé pour le genre, sinon le classique. */
export const resolveCoverFont = (choice: CoverFontChoice, genre: CoverGenre | null): CoverFontSet =>
  choice !== "auto" ? choice : genre ? GENRE_FONTS[genre][0] : "classic";

/**
 * Jeu qui sait écrire ces textes : une police qui n'a pas toutes leurs lettres (polonais, tchèque… : les fichiers
 * embarqués n'ont que le latin de base et le français) laisse la place au classique, qui les a.
 */
export function coverFontFor(set: CoverFontSet, texts: string[], has: (file: CoverFontFile, cp: number) => boolean): CoverFontSet {
  if (set === "classic") return set;
  const spec = COVER_FONT_SPECS[set];
  const files = [spec.title, spec.author, spec.spineTitle, spec.spineAuthor];
  for (const text of texts)
    for (const ch of text.normalize("NFC")) {
      const cp = ch.codePointAt(0)!;
      if (cp <= 0x20) continue;
      if (files.some((f) => !has(f, cp))) return "classic";
    }
  return set;
}
