// Barre de mise en forme posée sur le clavier (téléphone tactile) : décisions pures, testées.
// Sur iPhone, la bulle au-dessus de la sélection entrait en concurrence avec le menu du système (Couper, Copier,
// Coller…), qui se pose au même endroit, et sortait de l'écran à droite. Sur un téléphone, les boutons vont donc
// dans une rangée collée au clavier, qui défile de côté (voir FormatDock.tsx).

/** Boutons qui n'agissent que sur une sélection : sans texte choisi, la barre du clavier ne les montre pas. */
export const SELECTION_ONLY: ReadonlySet<string> = new Set(["comment", "chutier"]);

/**
 * Les boutons de la barre du clavier. Là où l'on peut commenter (texte d'une scène), « à reprendre » n'y est pas :
 * sur un téléphone, les deux faisaient doublon (demande de l'auteur, novembre 2026) ; le raccourci et la bulle de
 * l'ordinateur le gardent. Sans sélection, ni Commenter ni Chutier.
 */
export function dockActions<A extends { key: string }>(actions: A[], hasSelection: boolean): A[] {
  const canComment = actions.some((a) => a.key === "comment");
  const kept = canComment ? actions.filter((a) => a.key !== "revisit") : actions;
  return hasSelection ? kept : kept.filter((a) => !SELECTION_ONLY.has(a.key));
}

/** Bords de la rangée : des boutons cachés à gauche (`before`) ou à droite (`more`), à 2 px près. */
export function rowEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): { before: boolean; more: boolean } {
  return { before: scrollLeft > 2, more: scrollLeft + clientWidth < scrollWidth - 2 };
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
