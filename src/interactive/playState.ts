// Mode Lecture (lot 3) : d'où partir, et le chemin lu pendant la séance (#103). État d'affichage, rien n'est enregistré.

import { create } from "zustand";
import { useCosmos } from "../store";
import { storage } from "../storage";
import type { Pick } from "./playTrail";

/** Chemin lu : le projet et la scène de départ, puis les choix faits (pour reprendre après une correction). */
export interface Trail {
  project: string | null;
  from: string | null;
  picks: Pick[];
}

/** Scène d'où partir (null : le début) et dernier chemin lu dans la séance. */
export const usePlay = create<{ from: string | null; trail: Trail | null }>(() => ({ from: null, trail: null }));

/** Ouvre le mode Lecture, depuis le début ou depuis une scène. */
export function openPlay(from: string | null = null) {
  usePlay.setState({ from });
  useCosmos.getState().setDialog("play");
}

/** Projet sélectionné (le chemin d'un autre projet n'est jamais repris). */
export const playProject = (): string | null => storage.current?.() ?? null;

/** Chemin à reprendre pour cette lecture, ou null : même projet, même départ, au moins un choix. */
export function trailFor(from: string | null): Trail | null {
  const trail = usePlay.getState().trail;
  return trail && trail.picks.length > 0 && trail.from === from && trail.project === playProject() ? trail : null;
}
