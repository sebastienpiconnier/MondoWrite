// Carte « soulevée » par un appui long (doigt, stylet ou souris) : elle est sélectionnée pour être déplacée et
// porte une ombre. Seule la toile écrit ici ; CardNode lit. Perdre la sélection la repose (voir CardNode).

import { create } from "zustand";

interface LiftedState {
  id: string | null;
  set: (id: string | null) => void;
}

export const useLifted = create<LiftedState>((set) => ({ id: null, set: (id) => set({ id }) }));
