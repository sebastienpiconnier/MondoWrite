// Langues disponibles et détection. Sans dépendance vers les réglages
// (settings.ts l'importe : pas d'import circulaire).
//
// Deux sortes de langues :
// - les langues tenues par le projet (français, référence, et anglais) : complètes, TypeScript refuse de
//   compiler tant qu'une chaîne de fr.ts manque dans en.ts ;
// - les langues de la communauté (TRANSLATING.md) : une traduction peut être partielle. Ce qui n'est pas
//   encore traduit s'affiche en anglais (`complete`), et le menu des Réglages dit la part traduite.
//   Nouvelle langue : `npm run i18n -- new de`, qui crée le fichier et l'inscrit ci-dessous.

import { fr, type Messages } from "./fr";
import { en } from "./en";
import { allStrings, complete, FREE_LISTS, missingPaths, translatedShare } from "./coverage";
// i18n:imports (ligne repère pour scripts/i18n.mjs, ne pas retirer)

export { allStrings, complete, FREE_LISTS };

/** Une chaîne, une liste ou un groupe de Messages, chacun facultatif : une traduction en cours. */
export type DeepPartial<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly DeepPartial<U>[]
    : { [K in keyof T]?: DeepPartial<T[K]> };

/** Fichier d'une langue de la communauté : au moins son nom, dans la langue elle-même. */
export type Translation = DeepPartial<Messages> & { meta: { name: string } };

/** Langues de la communauté, par étiquette BCP 47 (`de`, `pt-BR`). */
const COMMUNITY = {
  // i18n:community (ligne repère pour scripts/i18n.mjs, ne pas retirer)
} as const satisfies Record<string, Translation>;

/** Chaînes encore en anglais dans une traduction (chemins), voir coverage.ts. */
export const untranslated = (partial: unknown, reference: Messages = en, french: Messages = fr) => missingPaths(partial, reference, french);
/** Part traduite, de 0 à 1 (les chaînes identiques partout, « PDF », ne comptent pas). */
export const coverage = (partial: unknown) => translatedShare(partial, en, fr);

export const DICTIONARIES = {
  fr,
  en,
  ...(Object.fromEntries(Object.entries(COMMUNITY).map(([code, t]) => [code, complete(en, t)])) as { [K in keyof typeof COMMUNITY]: Messages }),
} satisfies Record<string, Messages>;
export type Lang = keyof typeof DICTIONARIES;
export const LANGS = Object.keys(DICTIONARIES) as Lang[];

/** Langues de la communauté inscrites (partielles ou non), avec leur fichier tel qu'écrit. */
export const COMMUNITY_LANGS: Readonly<Record<string, Translation>> = COMMUNITY;

const coverageCache = new Map<string, number>();
/** Part traduite d'une langue (1 pour le français et l'anglais), calculée à la première demande. */
export function langCoverage(code: string): number {
  if (!(code in COMMUNITY)) return 1;
  let share = coverageCache.get(code);
  if (share === undefined) coverageCache.set(code, (share = coverage(COMMUNITY_LANGS[code])));
  return share;
}

/**
 * Part traduite à partir de laquelle une langue de la communauté est proposée (menu des Réglages, langue du
 * système au premier lancement). En développement (`npm run dev`), toutes le sont, pour que le traducteur
 * voie son travail. Une langue déjà choisie reste valable même sous le seuil.
 */
export const MIN_COVERAGE = 0.5;
const DEV = (() => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
})();
/** Langues proposées : tenues, ou de la communauté traduites à MIN_COVERAGE au moins. */
export const offeredLangs = (): Lang[] => LANGS.filter((code) => DEV || langCoverage(code) >= MIN_COVERAGE);

export const isLang = (v: unknown): v is Lang => typeof v === "string" && Object.prototype.hasOwnProperty.call(DICTIONARIES, v);

/** Langue disponible pour une étiquette du système : la variante exacte (pt-BR), sinon la langue de base (pt). */
export function matchLang(tag: string | undefined, langs: readonly string[] = offeredLangs()): Lang | null {
  if (!tag) return null;
  const wanted = tag.toLowerCase().replace(/_/g, "-");
  const exact = langs.find((l) => l.toLowerCase() === wanted);
  if (exact) return exact as Lang;
  const base = wanted.split("-")[0];
  const same = langs.find((l) => l.toLowerCase() === base);
  return (same as Lang | undefined) ?? null;
}

/** Langue du système si elle est disponible, sinon anglais. */
export function detectLang(): Lang {
  const prefs = typeof navigator !== "undefined" ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const tag of prefs) {
    const found = matchLang(tag);
    if (found) return found;
  }
  return "en";
}
