// Ruban agrandi (#173) : ouvert ou non, sa hauteur, groupes de pistes repliés. Réglage de l'appareil, jamais dans le projet.

import { create } from "zustand";

const BOARD_KEY = "mondowrite.board";
export const BOARD_MIN = 140;
const BOARD_DEFAULT = 240;

/** Zoom du ruban agrandi : rang dans `FRISE_SCALES`, ou −1 pour « toute la largeur ». */
export const FIT_ZOOM = -1;

interface BoardState {
  open: boolean;
  height: number;
  folded: string[];
  zoom: number;
  setZoom: (zoom: number) => void;
  setOpen: (open: boolean) => void;
  setHeight: (height: number) => void;
  toggleFold: (group: string) => void;
}

function readBoard(): Pick<BoardState, "open" | "height" | "folded" | "zoom"> {
  try {
    const raw = JSON.parse(localStorage.getItem(BOARD_KEY) ?? "{}") as Record<string, unknown>;
    return {
      open: raw.open === true,
      height: typeof raw.height === "number" && raw.height >= BOARD_MIN ? Math.round(raw.height) : BOARD_DEFAULT,
      folded: Array.isArray(raw.folded) ? raw.folded.filter((g): g is string => typeof g === "string").slice(0, 12) : [],
      zoom: Number.isInteger(raw.zoom) && (raw.zoom as number) >= FIT_ZOOM && (raw.zoom as number) <= 3 ? (raw.zoom as number) : FIT_ZOOM,
    };
  } catch {
    return { open: false, height: BOARD_DEFAULT, folded: [], zoom: FIT_ZOOM };
  }
}

export const useBoard = create<BoardState>((set, get) => {
  const save = () => {
    const { open, height, folded, zoom } = get();
    try {
      localStorage.setItem(BOARD_KEY, JSON.stringify({ open, height, folded, zoom }));
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
    setZoom: (zoom) => {
      set({ zoom });
      save();
    },
    toggleFold: (group) => {
      const folded = get().folded;
      set({ folded: folded.includes(group) ? folded.filter((g) => g !== group) : [...folded, group] });
      save();
    },
  };
});

