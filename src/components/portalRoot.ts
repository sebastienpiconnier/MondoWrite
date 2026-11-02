// Où poser un menu flottant (createPortal) : dans la fenêtre native ouverte qui contient son bouton, sinon dans
// <body>. Une fenêtre ouverte par showModal() est dans la couche du dessus et rend inerte tout ce qui est hors
// d'elle : un menu posé dans <body> passait dessous et ne répondait plus (carte agrandie, 1.13.1). Le menu garde
// sa position fixe : une fenêtre native n'a ni transform ni filtre, donc la fenêtre reste son repère.
export function portalRoot(anchor: Element | null | undefined): HTMLElement {
  const dialog = anchor?.closest("dialog[open]");
  return dialog instanceof HTMLElement ? dialog : document.body;
}
