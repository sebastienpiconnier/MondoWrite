// Volets escamotables du scénario (liste des scènes à gauche, infos à droite) : le choix est gardé d'une fois sur
// l'autre sur l'appareil, comme pour le manuscrit. Petit écran : les volets sont des tiroirs, fermés au départ.

import { useState } from "react";

const KEY = "mondowrite.screenplay.panels";
export type ScreenplayPanels = { scenes: boolean; side: boolean };

function read(): ScreenplayPanels {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") return { scenes: raw.scenes !== false, side: raw.side !== false };
  } catch {
    /* ignoré */
  }
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  return { scenes: !phone, side: !phone };
}

export function usePanels(): [ScreenplayPanels, (key: keyof ScreenplayPanels) => void] {
  const [panels, setPanels] = useState(read);
  const toggle = (key: keyof ScreenplayPanels) =>
    setPanels((p) => {
      const next = { ...p, [key]: !p[key] };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* stockage indisponible : le choix vaut pour la session */
      }
      return next;
    });
  return [panels, toggle];
}
