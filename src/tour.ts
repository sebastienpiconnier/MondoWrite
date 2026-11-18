// Visite guidée : quelques étapes, chacune dans une vue, pour montrer le passage du chaos au monde ordonné.
// Données pures (vue et clé du texte) ; les textes sont dans `t.tour.steps`.

import type { ProjectKind } from "./types";

export type TourView = "toile" | "bible" | "plan" | "manuscrit";

export interface TourStep {
  /** Clé du texte dans `t.tour.steps` (variante scénario dans `t.tour.scenario`, si elle existe). */
  key: "cards" | "sources" | "bible" | "plan" | "write" | "files";
  view: TourView;
}

export const TOUR_STEPS: readonly TourStep[] = [
  { key: "cards", view: "toile" },
  { key: "sources", view: "toile" },
  { key: "bible", view: "bible" },
  { key: "plan", view: "plan" },
  { key: "write", view: "manuscrit" },
  { key: "files", view: "toile" },
];

/**
 * Visite d'un roman interactif (ouverte avec l'exemple « Le Puits », et depuis les Réglages dans un tel roman) :
 * la carte des choix, les blocs de choix, les faits, les sections du livre, « Vérifier », la lecture et les exports.
 * Textes dans `t.interactive.tour.steps`.
 */
export interface StoryTourStep {
  key: "map" | "choices" | "facts" | "sections" | "check" | "play";
  view: TourView;
}

export const STORY_TOUR_STEPS: readonly StoryTourStep[] = [
  { key: "map", view: "toile" },
  { key: "choices", view: "manuscrit" },
  { key: "facts", view: "manuscrit" },
  { key: "sections", view: "plan" },
  { key: "check", view: "manuscrit" },
  { key: "play", view: "plan" },
];

/** Étape suivante, ou null après la dernière. */
export const nextStep = (step: number, total: number = TOUR_STEPS.length): number | null => (step + 1 < total ? step + 1 : null);
export const prevStep = (step: number): number => Math.max(0, step - 1);

/** Texte d'une étape selon le type de projet (le scénario a parfois sa propre version). */
export function stepText<T extends Record<string, { title: string; body: string }>>(steps: T, scenario: Partial<T>, key: keyof T, kind: ProjectKind) {
  return (kind === "scenario" && scenario[key]) || steps[key];
}
