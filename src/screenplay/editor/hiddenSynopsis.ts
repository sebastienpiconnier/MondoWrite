// Synopsis d'une scène, caché dans la feuille (novembre 2026) : il s'écrit dans le volet de droite, comme dans le
// Manuscrit. Il reste un nœud du document (la ligne « = … » sous l'en-tête du Fountain), mais invisible ; cette
// extension empêche le curseur de s'y poser (flèches, Retour arrière, Suppr le sélectionneraient sans qu'on le voie,
// et une seconde touche l'effacerait). Le synopsis d'un épisode (sous une section) reste visible et n'est pas touché.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";

const key = new PluginKey("hiddenSynopsis");
const shownKey = new PluginKey("shownSynopsis");

/**
 * Synopsis montré sous l'en-tête (#147, réglage `writing.showSynopsis`) : le texte est porté par l'en-tête
 * (`data-synopsis`) et montré juste après lui par un bloc à part (widget `.sp-shown-synopsis`), présenté comme le
 * synopsis d'un épisode : encadré gris et libellé « Synopsis ». Le bloc n'est visible qu'avec `.show-synopsis` sur la
 * feuille ; il n'est pas un nœud du document, donc ni le PDF ni le compte des pages ne le voient. Le synopsis s'écrit
 * toujours dans l'onglet Scène.
 */
function synopsisDecorations(doc: PmNode): DecorationSet {
  const decos: Decoration[] = [];
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const node = doc.child(i);
    if (node.type.name === "sceneHeading") {
      const lines: string[] = [];
      for (let k = i + 1; k < doc.childCount && isSceneSynopsis(doc, k); k++) lines.push(String(doc.child(k).attrs.text ?? "").replace(/\s*\[\[[^\]]*\]\]/g, "").trim());
      const text = lines.filter(Boolean).join(" ");
      if (text) {
        decos.push(Decoration.node(pos, pos + node.nodeSize, { "data-synopsis": text }));
        decos.push(Decoration.widget(pos + node.nodeSize, () => shownSynopsis(text), { side: -1, key: `synopsis:${text}`, ignoreSelection: true }));
      }
    }
    pos += node.nodeSize;
  }
  return DecorationSet.create(doc, decos);
}

/** Bloc du synopsis montré sous l'en-tête : texte seul, libellé posé par la feuille de style (`--sp-label-synopsis`). */
function shownSynopsis(text: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "sp-shown-synopsis";
  box.contentEditable = "false";
  box.textContent = text;
  return box;
}

/** Ce nœud de premier niveau est-il le synopsis d'une scène (sous son en-tête, ou sous un autre synopsis de scène) ? */
export function isSceneSynopsis(doc: PmNode, index: number): boolean {
  const node = doc.maybeChild(index);
  if (!node || node.type.name !== "preserved" || node.attrs.kind !== "synopsis") return false;
  for (let i = index - 1; i >= 0; i--) {
    const before = doc.child(i);
    if (before.type.name === "sceneHeading") return true;
    if (before.type.name !== "preserved" || before.attrs.kind !== "synopsis") return false;
  }
  return false;
}

/** Position juste après les synopsis cachés qui suivent l'élément de premier niveau finissant à `pos`. */
export function afterHiddenSynopses(doc: PmNode, pos: number): number {
  const $pos = doc.resolve(pos);
  let index = $pos.index(0);
  let at = pos;
  while (index < doc.childCount && isSceneSynopsis(doc, index)) {
    at += doc.child(index).nodeSize;
    index++;
  }
  return at;
}

/** Sélection sur un synopsis caché : on la pose sur le texte voisin, dans le sens où l'on allait. */
function moveOff(state: EditorState, oldHead: number): TextSelection | null {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection)) return null;
  const doc = state.doc;
  const index = doc.resolve(sel.from).index(0);
  if (!isSceneSynopsis(doc, index)) return null;
  const forward = sel.from >= oldHead;
  if (forward) {
    const after = afterHiddenSynopses(doc, sel.from);
    const found = TextSelection.findFrom(doc.resolve(Math.min(after, doc.content.size)), 1, true);
    if (found instanceof TextSelection) return found;
  }
  const found = TextSelection.findFrom(doc.resolve(sel.from), -1, true);
  return found instanceof TextSelection ? found : null;
}

/**
 * Retour arrière au début de l'élément qui suit un synopsis caché, ou Suppr au bout de l'en-tête qui le précède :
 * ProseMirror effacerait le nœud voisin (un atome) sans qu'on le voie. On saute par-dessus à la place.
 */
function jumpOver(state: EditorState, dir: -1 | 1): TextSelection | null {
  const sel = state.selection;
  if (!sel.empty || sel.$from.depth !== 1) return null;
  const $from = sel.$from;
  const doc = state.doc;
  const index = $from.index(0);
  if (dir < 0) {
    if ($from.parentOffset !== 0 || index === 0 || !isSceneSynopsis(doc, index - 1)) return null;
    const found = TextSelection.findFrom(doc.resolve($from.before(1)), -1, true);
    return found instanceof TextSelection ? found : null;
  }
  if ($from.parentOffset !== $from.parent.content.size || !isSceneSynopsis(doc, index + 1)) return null;
  const after = afterHiddenSynopses(doc, $from.after(1));
  const found = after < doc.content.size ? TextSelection.findFrom(doc.resolve(after), 1, true) : null;
  // Rien après le synopsis : Suppr ne fait rien plutôt que de l'effacer.
  return found instanceof TextSelection ? found : TextSelection.create(doc, $from.pos);
}

export const HiddenSynopsis = Extension.create({
  name: "hiddenSynopsis",
  // Avant le clavier de base (Retour arrière, Suppr) et celui du scénario.
  priority: 1000,
  addKeyboardShortcuts() {
    const run = (dir: -1 | 1) => () => {
      const next = jumpOver(this.editor.state, dir);
      if (!next) return false;
      this.editor.view.dispatch(this.editor.state.tr.setSelection(next));
      return true;
    };
    return { Backspace: run(-1), Delete: run(1), "Mod-Backspace": run(-1), "Mod-Delete": run(1) };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        appendTransaction(trs, oldState, newState) {
          if (!trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          const next = moveOff(newState, oldState.selection.head);
          return next ? newState.tr.setSelection(next) : null;
        },
      }),
      new Plugin({
        key: shownKey,
        state: {
          init: (_, state) => synopsisDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? synopsisDecorations(tr.doc) : old),
        },
        props: { decorations: (state) => shownKey.getState(state) },
      }),
    ];
  },
});
