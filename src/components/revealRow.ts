// Recherche dans le Plan ou le séquencier (#85) : la ligne de la scène trouvée, au milieu de l'écran et marquée un
// instant, sans changer de vue. La ligne porte `data-scene` (identifiant de sa carte).
// Une scène rangée dans un bloc replié (acte, séquence, sous-séquence, saison, épisode) n'a pas de ligne : le
// séquencier déplie d'abord ce qui la contient (#153, événement `REVEAL_SCENE`), puis la ligne est montrée.

const FOUND_MS = 1600;
/** Images d'attente au plus, le temps que la vue se dessine ou que le bloc se déplie. */
const TRIES = 20;

/** Demande au séquencier de déplier ce qui contient la scène (detail : identifiant de sa carte). */
export const REVEAL_SCENE = "mondowrite:reveal-scene";

/**
 * Montre la ligne de cette scène dans la vue Plan ; faux si elle n'y est pas (chronologie, scène sans ligne, bloc
 * replié : le dépliage est alors demandé). `mark` : marquée un instant (recherche) ; sans, seulement au milieu et
 * avec le focus (retour d'une autre vue, #144).
 */
export function revealPlanRow(id: string, mark = true): boolean {
  const row = document.querySelector<HTMLElement>(`.sequencer [data-scene="${CSS.escape(id)}"]`);
  if (!row) {
    window.dispatchEvent(new CustomEvent(REVEAL_SCENE, { detail: id }));
    return false;
  }
  row.scrollIntoView({ block: "center" });
  if (mark) {
    row.classList.add("is-found");
    window.setTimeout(() => row.classList.remove("is-found"), FOUND_MS);
  }
  // Le focus va à la ligne (clavier, lecteur d'écran) sans la faire défiler de nouveau.
  if (!row.hasAttribute("tabindex")) row.setAttribute("tabindex", "-1");
  row.focus({ preventScroll: true });
  return true;
}

/** Comme `revealPlanRow`, en attendant quelques images que la ligne paraisse (vue qui arrive, bloc qui se déplie). */
export function revealPlanRowSoon(id: string, mark = true, stillThere: () => boolean = () => true): void {
  let tries = 0;
  const show = () => {
    if (!stillThere()) return;
    if (!revealPlanRow(id, mark) && tries++ < TRIES) requestAnimationFrame(show);
  };
  requestAnimationFrame(show);
}
