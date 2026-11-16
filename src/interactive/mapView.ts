// Carte des choix ouverte ou non dans le Plan (lot 5) : état d'affichage de la session, jamais enregistré. Il survit
// à un passage par une autre vue, et « Voir sur la carte des choix » (onglet « Vérifier ») l'ouvre sur une scène.

import { create } from "zustand";
import { useCosmos } from "../store";

export const useChoiceMapView = create<{ open: boolean; focus: string | null }>(() => ({ open: false, focus: null }));

export const setChoiceMapOpen = (open: boolean) => useChoiceMapView.setState({ open });

/** Ouvre le Plan sur la carte des choix, la scène `focus` au centre. */
export function showOnChoiceMap(focus: string | null = null) {
  useChoiceMapView.setState({ open: true, focus });
  useCosmos.getState().setView("plan");
}
