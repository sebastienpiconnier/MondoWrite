// Mode focus d'un roman interactif (novembre 2026) : les blocs de choix sont cachés (writing.css), il ne reste que
// le texte. Le bloc reste dans le document ; cette extension empêche le curseur de s'y poser tant que l'éditeur est
// en mode focus (flèches, Retour arrière et Suppr le sélectionneraient sans qu'on le voie, et une seconde touche
// l'effacerait), comme `hiddenSynopsis.ts` pour le synopsis caché du scénario.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection, TextSelection, type EditorState } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

const key = new PluginKey("focusChoices");
const CHOICES = "sceneChoices";

const isChoices = (doc: PmNode, index: number) => doc.maybeChild(index)?.type.name === CHOICES;

/** L'éditeur est-il dans une vue en mode focus ? */
export function inFocus(view: EditorView): boolean {
  try {
    return !!(view.dom as HTMLElement).closest?.(".is-focus");
  } catch {
    return false; // éditeur pas encore monté
  }
}

/** Position juste après les blocs de choix qui suivent le nœud de premier niveau d'indice `index`. */
function afterChoices(doc: PmNode, index: number, pos: number): number {
  let at = pos;
  while (index < doc.childCount && isChoices(doc, index)) {
    at += doc.child(index).nodeSize;
    index++;
  }
  return at;
}

/** Sélection posée sur un bloc de choix caché : on la pose sur le texte voisin, dans le sens où l'on allait. */
export function moveOffChoices(state: EditorState, oldHead: number): TextSelection | null {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== CHOICES) return null;
  const doc = state.doc;
  const index = doc.resolve(sel.from).index(0);
  if (sel.from >= oldHead) {
    const after = afterChoices(doc, index, sel.from);
    const found = after < doc.content.size ? TextSelection.findFrom(doc.resolve(after), 1, true) : null;
    if (found instanceof TextSelection) return found;
  }
  const found = TextSelection.findFrom(doc.resolve(sel.from), -1, true);
  return found instanceof TextSelection ? found : null;
}

/** Retour arrière juste après un bloc de choix caché, ou Suppr juste avant : on saute par-dessus au lieu de l'effacer. */
export function jumpOverChoices(state: EditorState, dir: -1 | 1): TextSelection | null {
  const sel = state.selection;
  if (!sel.empty || sel.$from.depth !== 1) return null;
  const $from = sel.$from;
  const doc = state.doc;
  const index = $from.index(0);
  if (dir < 0) {
    if ($from.parentOffset !== 0 || index === 0 || !isChoices(doc, index - 1)) return null;
    const found = TextSelection.findFrom(doc.resolve($from.before(1)), -1, true);
    return found instanceof TextSelection ? found : TextSelection.create(doc, $from.pos);
  }
  if ($from.parentOffset !== $from.parent.content.size || !isChoices(doc, index + 1)) return null;
  const after = afterChoices(doc, index + 1, $from.after(1));
  const found = after < doc.content.size ? TextSelection.findFrom(doc.resolve(after), 1, true) : null;
  // Rien après le bloc : Suppr ne fait rien plutôt que de l'effacer.
  return found instanceof TextSelection ? found : TextSelection.create(doc, $from.pos);
}

export const FocusChoices = Extension.create({
  name: "focusChoices",
  // Avant le clavier de base (Retour arrière, Suppr) et celui du livre.
  priority: 1000,
  addKeyboardShortcuts() {
    const run = (dir: -1 | 1) => () => {
      if (!inFocus(this.editor.view)) return false;
      const next = jumpOverChoices(this.editor.state, dir);
      if (!next) return false;
      this.editor.view.dispatch(this.editor.state.tr.setSelection(next));
      return true;
    };
    return { Backspace: run(-1), Delete: run(1), "Mod-Backspace": run(-1), "Mod-Delete": run(1) };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key,
        appendTransaction(trs, oldState, newState) {
          if (!trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          if (!inFocus(editor.view)) return null;
          const next = moveOffChoices(newState, oldState.selection.head);
          return next ? newState.tr.setSelection(next) : null;
        },
      }),
    ];
  },
});
