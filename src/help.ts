// Aide en ligne : le guide de l'utilisateur publié sur GitHub Pages (workflow « Guide »), dans la langue de
// l'interface (français pour le français, anglais pour toute autre langue), ouvert dans le navigateur du
// système. F1 mène au chapitre de la vue où l'on est.

import { openExternal } from "./platform";
import { useSettings } from "./settings";
import { useCosmos } from "./store";
import { isPhone, shownView } from "./components/usePhone";

const SITE = "https://sebastienpiconnier.github.io/MondoWrite";

/** Chapitres du guide, avec l'ancre de chaque langue (identifiants des titres h2 ou h3 de docs/guide/guide.<langue>.html). */
export const GUIDE_SECTIONS = {
  start: { fr: "premiers-pas", en: "first-steps" },
  paths: { fr: "parcours", en: "paths" },
  canvas: { fr: "canevas", en: "canvas" },
  // Carnet de l'iPhone : une partie (h3) du chapitre Réglages, à son ancre propre.
  carnet: { fr: "carnet", en: "notebook" },
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
export function currentSection(phone = isPhone()): GuideSection {
  const { screen, view: stored, kind, dialog } = useCosmos.getState();
  // La vue affichée, pas celle du store : sur téléphone, le canevas et le Plan sont le Carnet.
  const view = shownView(stored, phone);
  if (screen !== "project") return "start";
  if (dialog === "shortcuts") return "shortcuts";
  if (dialog === "paperback") return "export";
  switch (view) {
    case "bible":
      return "bible";
    case "carnet":
      return "carnet";
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
