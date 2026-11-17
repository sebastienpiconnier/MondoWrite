// Passage choisi au milieu de l'écran (#85) : la recherche, « Vérifier » et les questions de l'IA mènent à un mot
// du Manuscrit ou du Scénario. `scrollIntoView` de ProseMirror ne défile que du strict nécessaire, et le mot
// tombait tout en bas de l'écran.

import type { EditorView } from "@tiptap/pm/view";

/** Premier ancêtre qui défile vraiment en hauteur (la colonne de la page), sinon null (la fenêtre). */
function scroller(from: HTMLElement | null): HTMLElement | null {
  for (let el = from; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

/** Fait défiler pour que le début de la sélection soit au milieu de la zone visible. */
export function centerSelection(view: EditorView) {
  if (view.isDestroyed) return;
  let top: number;
  try {
    top = view.coordsAtPos(view.state.selection.from).top;
  } catch {
    return;
  }
  const box = scroller(view.dom.parentElement);
  if (box) {
    const rect = box.getBoundingClientRect();
    box.scrollBy({ top: top - (rect.top + rect.height / 2), behavior: "auto" });
  } else {
    window.scrollBy({ top: top - window.innerHeight / 2, behavior: "auto" });
  }
}
