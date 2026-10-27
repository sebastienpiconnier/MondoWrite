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

/** Vrai sur un écran de téléphone : le Carnet remplace le canevas et le Plan. */
export const usePhone = () => useSyncExternalStore(subscribe, isPhone, () => false);

/** Vue affichée : sur téléphone, le canevas et le Plan cèdent la place au Carnet ; ailleurs, le Carnet est le canevas. */
export function shownView<V extends string>(view: V, phone: boolean): V | "carnet" | "toile" {
  if (phone) return view === "toile" || view === "plan" ? "carnet" : view;
  return view === "carnet" ? "toile" : view;
}
