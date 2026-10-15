// Aide en ligne : le guide de l'utilisateur (PDF, docs/guide/ du dépôt GitHub), dans la langue de l'interface
// (français pour le français, anglais pour toute autre langue). Ouvert dans le navigateur du système.

import { openExternal } from "./platform";
import { useSettings } from "./settings";
import { REPO } from "./updates";

/** Adresse du guide dans la langue `lang` (page GitHub qui affiche le PDF). */
export const guideUrl = (lang: string) =>
  `https://github.com/${REPO}/blob/main/docs/guide/MondoWrite-guide-${lang === "fr" ? "fr" : "en"}.pdf`;

export const openGuide = () => openExternal(guideUrl(useSettings.getState().lang));
