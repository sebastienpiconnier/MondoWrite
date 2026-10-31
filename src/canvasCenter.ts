// Centre de la vue du canevas, en coordonnées du canevas, pour une fenêtre ouverte hors de lui (« Du vrac aux
// cartes » depuis le menu IA de la barre du haut). Toile s'y inscrit tant qu'elle est affichée ; sinon rien.

let getter: (() => { x: number; y: number } | undefined) | null = null;

/** Toile donne sa fonction (null en se démontant). */
export function setCanvasCenter(fn: (() => { x: number; y: number } | undefined) | null): void {
  getter = fn;
}

/** Centre de la vue, ou undefined si le canevas n'est pas affiché. */
export const canvasCenter = (): { x: number; y: number } | undefined => getter?.() ?? undefined;
