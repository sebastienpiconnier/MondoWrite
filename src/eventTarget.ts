// Cible d'un événement clavier ou presse-papiers, pour les raccourcis et le collage du canevas.

/** Champs où une frappe ou un collage reste au champ (le canevas ne fait rien). */
export const EDITABLE = "input, textarea, select, [contenteditable='true'], dialog";

/**
 * Élément visé par un événement clavier ou presse-papiers. WebKit (app Mac, iPad) peut viser le nœud de
 * texte sous le curseur : on remonte à son élément. Le champ qui a le focus compte aussi, sinon un collage
 * dans une carte agrandie passait pour un collage sur le canevas (et créait une carte Idée en plus).
 */
export function eventElement(e: Event): Element | null {
  const t = e.target as Node | null;
  const el = t instanceof Element ? t : (t?.parentElement ?? null);
  const active = typeof document !== "undefined" ? document.activeElement : null;
  if (active instanceof Element && active !== document.body && active.closest(EDITABLE) && !el?.closest(EDITABLE)) return active;
  return el;
}
