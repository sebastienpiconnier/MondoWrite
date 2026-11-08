// Barre de mise en forme sur la sélection : ce qu'elle montre selon l'appareil (fonction pure, testée).
// Sur une tablette tactile (iPad), elle croisait le menu du système (Couper, Copier, Coller…) avec une rangée de
// mises en forme qui se tapent aussi en Markdown : elle n'y garde que les actions sur le passage (créer une fiche,
// note, synonymes, commenter, chutier, Atelier). Sur téléphone, il n'y a pas de bulle du tout (FormatBar.tsx).

/** Boutons de pure mise en forme (gras, italique, barré, intertitre, listes, case, citation). */
export const FORMAT_KEYS: ReadonlySet<string> = new Set(["bold", "italic", "strike", "heading", "bullet", "task", "quote"]);

/** Les boutons de la bulle : tous à la souris, sans la mise en forme au doigt. */
export function bubbleActions<A extends { key: string }>(actions: A[], touch: boolean): A[] {
  return touch ? actions.filter((a) => !FORMAT_KEYS.has(a.key)) : actions;
}
