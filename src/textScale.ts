// Taille du texte du système (Dynamic Type) sur iPad et iPhone. Les textes de l'interface sont en rem :
// on agrandit la taille de base de la page dans le rapport de la taille choisie dans Réglages > Accessibilité >
// Affichage et taille du texte. 17 pt est la taille par défaut d'iOS pour le corps de texte.
// Sur ordinateur (macOS n'a pas Dynamic Type, Windows et Linux non plus) et dans le navigateur, rien ne change.
// Le canevas, la page du manuscrit et la feuille du scénario gardent leurs tailles : le canevas se zoome, et les
// pages mesurent leur hauteur en em.

import { isMobileOS } from "./platform";

const IOS_BODY = 17;
const BASE = 16;
/** Au-delà, la mise en page de l'interface (barres, boutons) ne suit plus : on plafonne. */
export const MAX_SCALE = 1.6;
export const MIN_SCALE = 0.85;

/** Rapport entre la taille de texte du système et la taille par défaut, borné. */
export function textScale(systemBodyPx: number): number {
  if (!Number.isFinite(systemBodyPx) || systemBodyPx <= 0) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, systemBodyPx / IOS_BODY));
}

/** Taille du corps de texte du système, ou null si le moteur ne la donne pas (tout sauf WebKit sur iOS). */
function systemBodySize(): number | null {
  if (typeof CSS === "undefined" || !CSS.supports?.("font", "-apple-system-body")) return null;
  const probe = document.createElement("span");
  probe.style.font = "-apple-system-body";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const size = parseFloat(getComputedStyle(probe).fontSize);
  probe.remove();
  return Number.isFinite(size) ? size : null;
}

/** À appeler une fois, après le chargement du document. */
export function watchTextScale() {
  if (!isMobileOS()) return;
  const apply = () => {
    const size = systemBodySize();
    if (size === null) return;
    const scale = textScale(size);
    document.documentElement.style.fontSize = `${BASE * scale}px`;
    document.documentElement.style.setProperty("--text-scale", String(scale));
  };
  apply();
  // On change la taille dans les Réglages, puis on revient dans l'app.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") apply();
  });
}
