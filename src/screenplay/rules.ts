// Règles de détection Fountain (fountain.io/syntax), partagées par le parseur et le sérialiseur :
// le sérialiseur s'en sert pour savoir quand un marqueur de forçage est nécessaire.

/** Note de lien vers une carte, posée sur un en-tête de scène. */
export const LINK_RE = /\s*\[\[cosmos:([A-Za-z0-9_-]+)\]\]/;

/** Numéro de scène en fin d'en-tête : #12#, #12A#, #I-1-A#. */
export const SCENE_NUMBER_RE = /\s*#([A-Za-z0-9.-]+)#\s*$/;

const HEADING_RE = /^(?:int\.?\/ext|ext\.?\/int|int|ext|est|i\/e)[. ]/i;

// Une clé ne commence pas par un marqueur Fountain et ne contient pas de note : sinon un en-tête
// forcé en première ligne (« .PHARE [[cosmos:id]] ») serait pris pour une page de titre.
export const TITLE_KEY_RE = /^([^\s:.!@>#=~(/[\]][^:[\]]*):[ \t]*(.*)$/;

/** Clés de page de titre de la spécification Fountain et des logiciels courants (sans la casse). */
const TITLE_KEYS = new Set([
  "title", "credit", "author", "authors", "source", "draft date", "date", "contact", "copyright",
  "notes", "revision", "watermark", "format", "font", "tl", "tc", "tr", "cc", "bl", "br",
]);
export const isTitleKey = (key: string): boolean => TITLE_KEYS.has(key.trim().toLowerCase());

export const isBlank = (line: string): boolean => line.trim() === "";

/** En majuscules, avec au moins une lettre (« R2D2 » oui, « 23 » non). Les accents sont gérés. */
const isUpper = (s: string): boolean => /\p{L}/u.test(s) && s === s.toUpperCase();

/** INT, EXT, EST, INT./EXT, EXT./INT, INT/EXT ou I/E suivi d'un point ou d'une espace. */
export const isNaturalHeading = (line: string): boolean => HEADING_RE.test(line.trim());

/** Majuscules finissant par « TO: ». Les transitions françaises (« COUPE À : ») doivent être forcées. */
export const isNaturalTransition = (line: string): boolean => {
  const s = line.trim();
  return isUpper(s) && s.endsWith("TO:");
};

/** Nom en majuscules ; les extensions entre parenthèses (V.O., cont'd) et le ^ final sont ignorés. */
export const isNaturalCharacter = (line: string): boolean => {
  let name = line.trim().replace(/\s*\^$/, "");
  if (/^[~([]/.test(name)) return false;
  for (;;) {
    const shorter = name.replace(/\s*\([^()]*\)$/, "");
    if (shorter === name) break;
    name = shorter;
  }
  return name !== "" && isUpper(name);
};

export const isPageBreak = (line: string): boolean => /^={3,}$/.test(line.trim());

export const isCentered = (line: string): boolean => /^>.*<$/.test(line.trim());

/** Une ligne qui ouvre un élément de structure et coupe donc un paragraphe d'action. */
export const startsStructure = (line: string): boolean => {
  const s = line.trim();
  return s.startsWith("#") || s.startsWith("=") || s.startsWith("/*") || isCentered(s) || isStandaloneNote(s);
};

/** Une note seule sur sa ligne : [[…]] sans autre texte autour. */
export const isStandaloneNote = (text: string): boolean => {
  const s = text.trim();
  return s.length >= 4 && s.startsWith("[[") && s.endsWith("]]") && !s.slice(2, -2).includes("]]");
};
