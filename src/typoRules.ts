// Règles typographiques propres à chaque langue : guillemets, espaces avant la ponctuation, tiret,
// apostrophe, césure, séparateur des tableaux CSV. Une seule table, lue par :
// - la typographie à la frappe (typography.ts, smartType) ;
// - le test des dictionnaires (src/i18n/__tests__/typography.test.ts), qui vérifie que les textes
//   d'interface de chaque langue suivent ses règles ;
// - les exports (césure du livre broché, CSV des statistiques) et quelques textes composés dans le code.
// Données pures, sans dépendance. Sources : usages décrits par l'Imprimerie nationale (français), le
// Chicago Manual of Style et New Hart's Rules (anglais), le Duden (allemand), la RAE (espagnol), et le
// tableau « Quotation mark » de Wikipédia pour les autres langues.

/** Espace insécable (avant « : » et dans les guillemets français). */
export const NBSP = " ";
/** Espace fine insécable (avant ; ! ? en français). */
export const NNBSP = " ";

export type HighPunct = ";" | ":" | "!" | "?";

export interface TypoRules {
  /** Guillemets de premier niveau : ouvrant, fermant. */
  quotes: readonly [string, string];
  /** Guillemets d'une citation dans la citation. */
  inner: readonly [string, string];
  /** Espace à l'intérieur des guillemets (insécable en français), sinon rien. */
  quoteSpace: string;
  /** Espace à poser avant une ponctuation haute (français), absente sinon. */
  before: Partial<Record<HighPunct, string>>;
  /** Tiret que donnent deux traits d'union : cadratin (—) ou demi-cadratin (–) selon l'usage. */
  dash: "—" | "–";
  /** Apostrophe tapée en début de mot : guillemet simple ouvrant en anglais, apostrophe ailleurs. */
  wordStartQuote: string;
  /** Motifs de césure du paquet `hyphen` déjà vérifiés et cités dans THIRD-PARTY-NOTICES.md. */
  hyphen?: "fr" | "en-us" | "en-gb";
  /** Virgule décimale : un tableau CSV prend « ; » pour séparateur. */
  decimalComma: boolean;
}

const plain = (quotes: readonly [string, string], inner: readonly [string, string], extra: Partial<TypoRules> = {}): TypoRules => ({
  quotes,
  inner,
  quoteSpace: "",
  before: {},
  dash: "—",
  wordStartQuote: "’",
  decimalComma: true,
  ...extra,
});

const GUILLEMETS = ["«", "»"] as const;
const ENGLISH = ["“", "”"] as const;
const ENGLISH_SINGLE = ["‘", "’"] as const;
const LOW_HIGH = ["„", "“"] as const;
const LOW_HIGH_SINGLE = ["‚", "‘"] as const;
const LOW_RIGHT = ["„", "”"] as const;
const SWEDISH = ["”", "”"] as const;
const SWEDISH_SINGLE = ["’", "’"] as const;

/**
 * Règles par langue (étiquette BCP 47 en minuscules). Une variante régionale (pt-br, de-ch) n'est écrite que
 * si elle diffère de la langue de base. Ajouter une langue : une ligne ici, et ses tests dans
 * src/__tests__/typo-rules.test.ts.
 */
export const TYPO_RULES: Record<string, TypoRules> = {
  fr: {
    quotes: GUILLEMETS,
    inner: ENGLISH,
    quoteSpace: NBSP,
    before: { ";": NNBSP, "!": NNBSP, "?": NNBSP, ":": NBSP },
    dash: "—",
    wordStartQuote: "’",
    hyphen: "fr",
    decimalComma: true,
  },
  en: plain(ENGLISH, ENGLISH_SINGLE, { wordStartQuote: "‘", hyphen: "en-us", decimalComma: false }),
  "en-gb": plain(ENGLISH_SINGLE, ENGLISH, { wordStartQuote: "‘", dash: "–", hyphen: "en-gb", decimalComma: false }),
  de: plain(LOW_HIGH, LOW_HIGH_SINGLE, { dash: "–" }),
  "de-ch": plain(GUILLEMETS, ["‹", "›"], { dash: "–" }),
  es: plain(GUILLEMETS, ENGLISH),
  it: plain(GUILLEMETS, ENGLISH),
  pt: plain(GUILLEMETS, ENGLISH),
  "pt-br": plain(ENGLISH, ENGLISH_SINGLE),
  ca: plain(GUILLEMETS, ENGLISH),
  nl: plain(ENGLISH, ENGLISH_SINGLE, { dash: "–" }),
  sv: plain(SWEDISH, SWEDISH_SINGLE, { dash: "–" }),
  fi: plain(SWEDISH, SWEDISH_SINGLE, { dash: "–" }),
  da: plain(["»", "«"], ["›", "‹"], { dash: "–" }),
  nb: plain(GUILLEMETS, ENGLISH_SINGLE, { dash: "–" }),
  pl: plain(LOW_RIGHT, GUILLEMETS, { dash: "–" }),
  cs: plain(LOW_HIGH, LOW_HIGH_SINGLE, { dash: "–" }),
  ro: plain(LOW_RIGHT, GUILLEMETS),
  hu: plain(LOW_RIGHT, ["»", "«"], { dash: "–" }),
  ru: plain(GUILLEMETS, LOW_HIGH),
  uk: plain(GUILLEMETS, LOW_HIGH),
  tr: plain(ENGLISH, ENGLISH_SINGLE),
};

/** Langues qui ont leurs règles, dans l'ordre de la table (pour un menu). */
export const TYPO_LANGS = Object.keys(TYPO_RULES);

/**
 * Règles d'une langue : la variante exacte (pt-BR), sinon la langue de base (pt), sinon l'anglais.
 * Une langue sans règles reçoit celles de l'anglais : guillemets “ ”, aucune espace ajoutée.
 */
export function typoCode(lang: string): string {
  const tag = lang.toLowerCase().replace(/_/g, "-");
  if (tag in TYPO_RULES) return tag;
  const base = tag.split("-")[0];
  return base in TYPO_RULES ? base : "en";
}

export const typoRules = (lang: string): TypoRules => TYPO_RULES[typoCode(lang)];

/** Texte entre les guillemets de la langue, avec ses espaces. */
export function quote(text: string, lang: string): string {
  const r = typoRules(lang);
  return `${r.quotes[0]}${r.quoteSpace}${text}${r.quoteSpace}${r.quotes[1]}`;
}

/** Ponctuation haute précédée de l'espace de la langue : `punct(":", "fr")` = insécable + « : ». */
export const punct = (mark: HighPunct, lang: string): string => `${typoRules(lang).before[mark] ?? ""}${mark}`;

/** Séparateur d'un tableau CSV dans cette langue (« ; » là où la virgule est décimale). */
export const csvSeparator = (lang: string): string => (typoRules(lang).decimalComma ? ";" : ",");

/** Tous les caractères de guillemet que la langue emploie (premier et second niveau, apostrophe). */
export function quoteMarks(lang: string): Set<string> {
  const r = typoRules(lang);
  return new Set([...r.quotes, ...r.inner, "’", r.wordStartQuote]);
}

/** Nom d'une langue dans la langue `inLang` (« allemand », « German »), avec une capitale ; le code à défaut. */
export function languageName(code: string, inLang: string): string {
  let name = code;
  try {
    name = new Intl.DisplayNames([inLang, "en"], { type: "language" }).of(code) ?? code;
  } catch {
    // Intl.DisplayNames absent ou code refusé : on garde le code.
  }
  return name.charAt(0).toLocaleUpperCase(inLang) + name.slice(1);
}

/** Langues du menu « Typographie à la frappe », triées par leur nom dans la langue de l'interface. */
export function typoOptions(inLang: string): { code: string; language: string; quotes: string }[] {
  return TYPO_LANGS.map((code) => {
    const [open, close] = TYPO_RULES[code].quotes;
    return { code, language: languageName(code, inLang), quotes: `${open}…${close}` };
  }).sort((a, b) => a.language.localeCompare(b.language, inLang));
}
