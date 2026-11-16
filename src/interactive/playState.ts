// Mode Lecture (lot 3) : d'où partir. État d'affichage, rien n'est enregistré.

import { create } from "zustand";
import { useCosmos } from "../store";

/** Scène d'où partir (null : le début). */
export const usePlay = create<{ from: string | null }>(() => ({ from: null }));

/** Ouvre le mode Lecture, depuis le début ou depuis une scène. */
export function openPlay(from: string | null = null) {
  usePlay.setState({ from });
  useCosmos.getState().setDialog("play");
}
