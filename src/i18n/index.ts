// Mini-système de traduction, sans dépendance.
// - Les textes vivent dans fr.ts (référence) et en.ts, tenus complets par TypeScript ; les langues de la
//   communauté sont des fichiers `Translation` (partiels, complétés par l'anglais), inscrits dans langs.ts
//   par `npm run i18n -- new <code>` (voir TRANSLATING.md).
// - Les composants lisent les textes avec useT() ; le code hors React avec getT().
// - La langue choisie est un réglage de l'appareil (voir settings.ts), jamais stockée
//   dans le projet : un projet écrit en français s'ouvre aussi dans l'interface anglaise.

import type { Messages } from "./fr";
import { DICTIONARIES } from "./langs";
import { useSettings } from "../settings";

export type { Messages };
export { DICTIONARIES, LANGS, langCoverage, offeredLangs, detectLang, isLang, type Lang } from "./langs";

/** Remplace les {variables} : fmt("Type : {type}", { type: "Lieu" }). */
export function fmt(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

export function useT(): Messages {
  return DICTIONARIES[useSettings((s) => s.lang)];
}

export function getT(): Messages {
  return DICTIONARIES[useSettings.getState().lang];
}
