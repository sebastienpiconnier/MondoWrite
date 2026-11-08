// Barre de mise en forme posée sur le clavier (téléphone tactile) : décisions pures, testées.
// Sur iPhone, la bulle au-dessus de la sélection entrait en concurrence avec le menu du système (Couper, Copier,
// Coller…), qui se pose au même endroit, et sortait de l'écran à droite. Sur un téléphone, les boutons vont donc
// dans une rangée collée au clavier, qui défile de côté (voir FormatDock.tsx).

/** Boutons qui n'agissent que sur une sélection : sans texte choisi, la barre du clavier ne les montre pas. */
export const SELECTION_ONLY: ReadonlySet<string> = new Set(["comment", "chutier"]);

/** Les boutons de la barre du clavier : tous, sauf ceux qui demandent une sélection quand il n'y en a pas. */
export function dockActions<A extends { key: string }>(actions: A[], hasSelection: boolean): A[] {
  return hasSelection ? actions : actions.filter((a) => !SELECTION_ONLY.has(a.key));
}

/** Marge gardée entre le curseur et le haut de la barre, en pixels. */
export const CARET_MARGIN = 12;

/**
 * De combien faire défiler pour que le curseur reste au-dessus de la barre (0 si rien ne le cache).
 * Le système ne le remonte qu'au-dessus du clavier, sans voir la barre posée dessus.
 */
export function hiddenCaret(caretBottom: number, dockTop: number, margin = CARET_MARGIN): number {
  return Math.max(0, Math.ceil(caretBottom + margin - dockTop));
}
