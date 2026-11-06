// Téléphone : la largeur de l'écran, pas l'appareil (même seuil que phone.css). L'iPhone pliant ouvert, un iPad en
// Split View étroit ou une fenêtre réduite suivent la place disponible ; on ne détecte jamais un modèle.

import { useSyncExternalStore } from "react";

export const PHONE_QUERY = "(max-width: 720px)";

const query = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null);

function subscribe(onChange: () => void) {
  const mq = query();
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}

export const isPhone = () => query()?.matches ?? false;

/** Vrai sur un écran de téléphone : les quatre vues en onglets en bas de l'écran. */
export const usePhone = () => useSyncExternalStore(subscribe, isPhone, () => false);

/**
 * Vue affichée. L'ancienne vue Carnet (téléphone, avant novembre 2026) est le canevas : une position « Reprendre »
 * qui la cite y mène. `phone` est gardé pour les appelants, le téléphone a désormais les mêmes vues.
 */
export function shownView<V extends string>(view: V, _phone: boolean): V | "toile" {
  return view === "carnet" ? "toile" : view;
}
