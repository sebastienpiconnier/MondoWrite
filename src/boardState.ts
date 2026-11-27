// Ruban agrandi (#173) : ouvert ou non, sa hauteur, groupes de pistes repliés. Réglage de l'appareil, jamais dans le projet.

import { create } from "zustand";

const BOARD_KEY = "mondowrite.board";
export const BOARD_MIN = 140;
const BOARD_DEFAULT = 300;

interface BoardState {
  open: boolean;
  height: number;
  folded: string[];
  setOpen: (open: boolean) => void;
  setHeight: (height: number) => void;
  toggleFold: (group: string) => void;
}

function readBoard(): Pick<BoardState, "open" | "height" | "folded"> {
  try {
    const raw = JSON.parse(localStorage.getItem(BOARD_KEY) ?? "{}") as Record<string, unknown>;
    return {
      open: raw.open === true,
      height: typeof raw.height === "number" && raw.height >= BOARD_MIN ? Math.round(raw.height) : BOARD_DEFAULT,
      folded: Array.isArray(raw.folded) ? raw.folded.filter((g): g is string => typeof g === "string").slice(0, 12) : [],
    };
  } catch {
    return { open: false, height: BOARD_DEFAULT, folded: [] };
  }
}

export const useBoard = create<BoardState>((set, get) => {
  const save = () => {
    const { open, height, folded } = get();
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify({ open, height, folded }));
    } catch {
      /* stockage refusé : l'état vaut pour la séance */
    }
  };
  return {
    ...readBoard(),
    setOpen: (open) => {
      set({ open });
      save();
    },
    setHeight: (height) => {
      set({ height: Math.max(BOARD_MIN, Math.round(height)) });
      save();
    },
    toggleFold: (group) => {
      const folded = get().folded;
      set({ folded: folded.includes(group) ? folded.filter((g) => g !== group) : [...folded, group] });
      save();
    },
  };
});

