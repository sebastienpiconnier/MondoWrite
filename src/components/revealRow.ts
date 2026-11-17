// Recherche dans le Plan ou le séquencier (#85) : la ligne de la scène trouvée, au milieu de l'écran et marquée un
// instant, sans changer de vue. La ligne porte `data-scene` (identifiant de sa carte).

const FOUND_MS = 1600;

/** Montre la ligne de cette scène dans la vue Plan ; faux si elle n'y est pas (chronologie, scène sans ligne). */
export function revealPlanRow(id: string): boolean {
  const row = document.querySelector<HTMLElement>(`.sequencer [data-scene="${CSS.escape(id)}"]`);
  if (!row) return false;
  row.scrollIntoView({ block: "center" });
  row.classList.add("is-found");
  window.setTimeout(() => row.classList.remove("is-found"), FOUND_MS);
  // Le focus va à la ligne (clavier, lecteur d'écran) sans la faire défiler de nouveau.
  if (!row.hasAttribute("tabindex")) row.setAttribute("tabindex", "-1");
  row.focus({ preventScroll: true });
  return true;
}
