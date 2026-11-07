// Annuaire de noms (#17) : pour qui la fenêtre « Proposer un nom » choisit, et ce qu'elle fait du nom choisi.
// État d'affichage, rien n'est enregistré : le nom n'entre dans le projet que sur le clic de l'auteur.

import { create } from "zustand";
import { useCosmos } from "./store";
import type { NameKind } from "./names";

export interface NamesTarget {
  /** Ce qu'on cherche au départ. */
  kind: NameKind;
  /** Reçoit le nom choisi. */
  onPick: (name: string) => void;
}

export const useNames = create<{ target: NamesTarget | null }>(() => ({ target: null }));

export function openNames(target: NamesTarget) {
  useNames.setState({ target });
  useCosmos.getState().setDialog("names");
}

/** Pour une carte : le nom choisi devient son titre (les mentions suivent, par updateCard). */
export function openNamesForCard(cardId: string) {
  openNames({ kind: "full", onPick: (name) => useCosmos.getState().updateCard(cardId, { title: name }) });
}
