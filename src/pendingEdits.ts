// Frappes en attente d'être poussées dans le store (fiches de la Bible).
// Chaque lettre tapée dans une fiche passait par `updateCard` : nouvelle liste de cartes, étape d'historique,
// rendu de toute la Bible. Sur un gros projet, c'était le lag de la saisie. Les éditeurs gardent maintenant leur
// texte et le poussent après une courte pause, en quittant le champ, ou quand le projet va s'enregistrer ou
// changer d'état (`flushPendingEdits`). Rien n'est perdu : tout ce qui lit le projet vide d'abord cette file.

const pending = new Set<() => void>();

/** Inscrit une fonction qui pousse une frappe en attente dans le store ; rend de quoi la retirer. */
export function registerPendingEdit(flush: () => void): () => void {
  pending.add(flush);
  return () => {
    pending.delete(flush);
  };
}

/** Pousse toutes les frappes en attente dans le store. À appeler avant de lire, d'enregistrer ou d'annuler. */
export function flushPendingEdits(): void {
  for (const flush of [...pending]) flush();
}
