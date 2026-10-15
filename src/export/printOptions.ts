// Réglages du livre broché (formats, papier, ISBN, pages de fin), gardés dans le projet sous `print` dans
// cosmos.json. Module léger, à part de la mise en page (paperback.ts), pour que le store le lise sans
// charger le reste. Les clés et valeurs sont écrites dans le fichier : ne jamais les renommer.

/** Formats proposés (pouces) : corps du texte en points, marge extérieure en pouces. */
export const KDP_TRIMS = {
  "5x8": { width: 5, height: 8, size: 10.5, outside: 0.6, mm: "127 × 203 mm" },
  "5.25x8": { width: 5.25, height: 8, size: 10.75, outside: 0.6, mm: "133 × 203 mm" },
  "5.5x8.5": { width: 5.5, height: 8.5, size: 11, outside: 0.65, mm: "140 × 216 mm" },
  "6x9": { width: 6, height: 9, size: 11.5, outside: 0.75, mm: "152 × 229 mm" },
} as const;
export type TrimId = keyof typeof KDP_TRIMS;
export const TRIM_IDS = Object.keys(KDP_TRIMS) as TrimId[];

/** Papier : épaisseur d'une page (pouces), qui fait la largeur du dos. */
export const KDP_PAPER = { white: 0.002252, cream: 0.0025, groundwood: 0.00235 } as const;
export type PaperId = keyof typeof KDP_PAPER;
export const PAPER_IDS = Object.keys(KDP_PAPER) as PaperId[];
export const KDP_MAX_PAGES: Record<PaperId, number> = { white: 828, cream: 776, groundwood: 812 };
export const KDP_MIN_PAGES = 24;
/** En dessous, KDP refuse tout texte sur le dos. */
export const SPINE_TEXT_PAGES = 79;

/** Grand fond minimal de KDP selon le nombre de pages (pouces). */
export const gutterMin = (pages: number) => (pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875);
/** Grand fond posé : le minimum plus un quart de pouce, pour que rien ne se perde dans la reliure. */
export const gutterFor = (pages: number) => gutterMin(pages) + 0.25;
/** Largeur du dos (pouces). */
export const spineInches = (pages: number, paper: PaperId) => pages * KDP_PAPER[paper];

/** Réglages du livre broché, gardés dans le projet (`print` de cosmos.json). */
export interface PrintOptions {
  trim: TrimId;
  paper: PaperId;
  isbn: string;
  /** Mention « Ceci est une œuvre de fiction » sur la page de copyright par défaut. */
  fiction: boolean;
  toc: boolean;
  dropCap: boolean;
  /** Mot au lecteur à la fin du livre (« Merci de votre lecture »). */
  thanks: boolean;
  website: string;
  newsletter: string;
  /** « Du même auteur » : un titre par ligne. */
  alsoBy: string;
}

export const DEFAULT_PRINT: PrintOptions = { trim: "5x8", paper: "cream", isbn: "", fiction: true, toc: false, dropCap: true, thanks: false, website: "", newsletter: "", alsoBy: "" };

const text = (v: unknown, max: number, lines = false) => {
  if (typeof v !== "string") return "";
  const s = lines ? v.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 40).join("\n") : v.replace(/\s+/g, " ").trim();
  return s.slice(0, max);
};
const flag = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Réglages relus (cosmos.json) : toute valeur inconnue reprend sa valeur par défaut. */
export function cleanPrint(raw: unknown): PrintOptions {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    trim: TRIM_IDS.includes(p.trim as TrimId) ? (p.trim as TrimId) : DEFAULT_PRINT.trim,
    paper: PAPER_IDS.includes(p.paper as PaperId) ? (p.paper as PaperId) : DEFAULT_PRINT.paper,
    isbn: text(p.isbn, 40),
    fiction: flag(p.fiction, DEFAULT_PRINT.fiction),
    toc: flag(p.toc, DEFAULT_PRINT.toc),
    dropCap: flag(p.dropCap, DEFAULT_PRINT.dropCap),
    thanks: flag(p.thanks, DEFAULT_PRINT.thanks),
    website: text(p.website, 200),
    newsletter: text(p.newsletter, 200),
    alsoBy: text(p.alsoBy, 2000, true),
  };
}

/** Ce qui s'écrit dans cosmos.json : rien tant que l'auteur n'a rien changé. */
export const printToMeta = (p: PrintOptions): PrintOptions | undefined => (JSON.stringify(cleanPrint(p)) === JSON.stringify(DEFAULT_PRINT) ? undefined : cleanPrint(p));

