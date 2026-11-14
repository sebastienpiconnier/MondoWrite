// Réglages de la couverture complète du livre broché (#78), gardés dans le projet sous `coverDesign` dans
// cosmos.json, à part de `print` : une version d'avant garde ce bloc comme clé inconnue, alors que `cleanPrint`
// d'une version d'avant viderait des clés ajoutées à `print`. Module léger (lu par le store). Les clés et les
// valeurs sont écrites dans le fichier : ne jamais les renommer ni les traduire.

import { COVER_FONTS, type CoverFontChoice } from "./coverFonts";

/** Cadrage de l'image dans le premier plat, quand ses proportions ne sont pas celles du livre. */
export const COVER_CROPS = ["top", "center", "bottom"] as const;
export type CoverCrop = (typeof COVER_CROPS)[number];
/** Place du titre sur le premier plat ; le nom de l'auteur va à l'opposé. */
export const COVER_TITLE_PLACES = ["top", "bottom"] as const;
export type CoverTitlePlace = (typeof COVER_TITLE_PLACES)[number];
/** Fond de la quatrième : la couleur du dos, ou l'image floutée et assombrie. */
export const COVER_BACKS = ["color", "image"] as const;
export type CoverBack = (typeof COVER_BACKS)[number];

export interface CoverDesign {
  crop: CoverCrop;
  titlePlace: CoverTitlePlace;
  /** Le titre et le nom sont déjà dessinés sur l'image (générée avec « Écrire le titre ») : l'app ne les écrit pas sur le premier plat. */
  titleOnImage: boolean;
  back: CoverBack;
  /** Couleur du dos et du fond de la quatrième, « #rrggbb » ; vide : tirée du bord de l'image. */
  spineColor: string;
  /** Présentation de l'auteur (parcours du profil) au dos. */
  bio: boolean;
  /** Ombre portée douce sous le titre et le nom du premier plat, pour les détacher de l'image. */
  shadow: boolean;
  /** Polices du titre et du nom (coverFonts.ts) ; « auto » : selon le genre de la couverture. */
  font: CoverFontChoice;
}

export const DEFAULT_COVER_DESIGN: CoverDesign = { crop: "center", titlePlace: "top", titleOnImage: false, back: "color", spineColor: "", bio: true, shadow: true, font: "auto" };

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Réglages relus (cosmos.json) : toute valeur inconnue reprend sa valeur par défaut. */
export function cleanCoverDesign(raw: unknown): CoverDesign {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_COVER_DESIGN;
  return {
    crop: pick(COVER_CROPS, p.crop, d.crop),
    titlePlace: pick(COVER_TITLE_PLACES, p.titlePlace, d.titlePlace),
    titleOnImage: typeof p.titleOnImage === "boolean" ? p.titleOnImage : d.titleOnImage,
    back: pick(COVER_BACKS, p.back, d.back),
    spineColor: isHexColor(p.spineColor) ? p.spineColor.toLowerCase() : "",
    bio: typeof p.bio === "boolean" ? p.bio : d.bio,
    shadow: typeof p.shadow === "boolean" ? p.shadow : d.shadow,
    font: pick(COVER_FONTS, p.font, d.font),
  };
}

/** Ce qui s'écrit dans cosmos.json : rien tant que l'auteur n'a rien changé. */
export const coverDesignToMeta = (d: CoverDesign): CoverDesign | undefined => {
  const clean = cleanCoverDesign(d);
  return JSON.stringify(clean) === JSON.stringify(DEFAULT_COVER_DESIGN) ? undefined : clean;
};
