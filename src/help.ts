// Aide en ligne : le guide de l'utilisateur publié sur GitHub Pages (workflow « Guide »), dans la langue de
// l'interface (français pour le français, anglais pour toute autre langue), ouvert dans le navigateur du
// système. F1 mène au chapitre de la vue où l'on est.

import { openExternal } from "./platform";
import { useSettings } from "./settings";
import { useCosmos } from "./store";

const SITE = "https://sebastienpiconnier.github.io/MondoWrite";

/** Chapitres du guide, avec l'ancre de chaque langue (identifiants des titres de docs/guide/guide.<langue>.html). */
export const GUIDE_SECTIONS = {
  start: { fr: "premiers-pas", en: "first-steps" },
  canvas: { fr: "canevas", en: "canvas" },
  bible: { fr: "bible", en: "bible" },
  plan: { fr: "plan", en: "outline" },
  manuscript: { fr: "manuscrit", en: "manuscript" },
  screenplay: { fr: "scenario", en: "screenplay" },
  export: { fr: "exporter", en: "export" },
  settings: { fr: "reglages", en: "settings" },
  shortcuts: { fr: "raccourcis", en: "shortcuts" },
} as const;
export type GuideSection = keyof typeof GUIDE_SECTIONS;

/** Adresse du guide dans la langue `lang`, au chapitre `section` s'il est donné. */
export function guideUrl(lang: string, section?: GuideSection): string {
  const l = lang === "fr" ? "fr" : "en";
  return `${SITE}/${l}/${section ? `#${GUIDE_SECTIONS[section][l]}` : ""}`;
}

/** Chapitre qui parle de ce qu'on a sous les yeux (accueil, vue du projet, fenêtre ouverte). */
export function currentSection(): GuideSection {
  const { screen, view, kind, dialog } = useCosmos.getState();
  if (screen !== "project") return "start";
  if (dialog === "shortcuts") return "shortcuts";
  if (dialog === "paperback") return "export";
  switch (view) {
    case "bible":
      return "bible";
    case "plan":
      return kind === "scenario" ? "screenplay" : "plan";
    case "manuscrit":
      return kind === "scenario" ? "screenplay" : "manuscript";
    default:
      return "canvas";
  }
}

/** Ouvre le guide ; sans chapitre précisé, à celui de la vue en cours. */
export const openGuide = (section: GuideSection | null = currentSection()) =>
  openExternal(guideUrl(useSettings.getState().lang, section ?? undefined));
