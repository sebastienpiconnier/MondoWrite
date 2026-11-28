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
      // Le bloc montré se pose après les synopsis cachés : posé entre l'en-tête et eux, il casserait la règle CSS
      // qui les cache (`.sp-sceneHeading + .sp-preserved`).
      let after = pos + node.nodeSize;
      for (let k = i + 1; k < doc.childCount && isSceneSynopsis(doc, k); k++) {
        lines.push(String(doc.child(k).attrs.text ?? "").replace(/\s*\[\[[^\]]*\]\]/g, "").trim());
        after += doc.child(k).nodeSize;
      }
      const text = lines.filter(Boolean).join(" ");
      if (text) {
        decos.push(Decoration.node(pos, pos + node.nodeSize, { "data-synopsis": text }));
        decos.push(Decoration.widget(after, () => shownSynopsis(text), { side: -1, key: `synopsis:${text}`, ignoreSelection: true }));
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

/** Note du scénario (« [[…]] » sur sa ligne), cachée par le réglage « Afficher les notes » (#169). */
const isNote = (doc: PmNode, index: number) => {
  const node = doc.maybeChild(index);
  return !!node && node.type.name === "preserved" && node.attrs.kind === "note";
};

/** Ce nœud de premier niveau est-il caché : synopsis d'une scène, ou note quand les notes sont cachées ? */
const hiddenAt = (doc: PmNode, index: number, notes: boolean) => isSceneSynopsis(doc, index) || (notes && isNote(doc, index));

/** Position juste après les nœuds cachés qui suivent l'élément de premier niveau finissant à `pos`. */
function afterHidden(doc: PmNode, pos: number, notes: boolean): number {
  let index = doc.resolve(pos).index(0);
  let at = pos;
  while (index < doc.childCount && hiddenAt(doc, index, notes)) {
    at += doc.child(index).nodeSize;
    index++;
  }
  return at;
}

/** Sélection sur un synopsis ou une note cachés : on la pose sur le texte voisin, dans le sens où l'on allait. */
function moveOff(state: EditorState, oldHead: number, notes: boolean): TextSelection | null {
  const sel = state.selection;
  if (!(sel instanceof NodeSelection)) return null;
  const doc = state.doc;
  const index = doc.resolve(sel.from).index(0);
  if (!hiddenAt(doc, index, notes)) return null;
  const forward = sel.from >= oldHead;
  if (forward) {
    const after = afterHidden(doc, sel.from, notes);
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
function jumpOver(state: EditorState, dir: -1 | 1, notes: boolean): TextSelection | null {
  const sel = state.selection;
  if (!sel.empty || sel.$from.depth !== 1) return null;
  const $from = sel.$from;
  const doc = state.doc;
  const index = $from.index(0);
  if (dir < 0) {
    if ($from.parentOffset !== 0 || index === 0 || !hiddenAt(doc, index - 1, notes)) return null;
    const found = TextSelection.findFrom(doc.resolve($from.before(1)), -1, true);
    return found instanceof TextSelection ? found : null;
  }
  if ($from.parentOffset !== $from.parent.content.size || !hiddenAt(doc, index + 1, notes)) return null;
  const after = afterHidden(doc, $from.after(1), notes);
  const found = after < doc.content.size ? TextSelection.findFrom(doc.resolve(after), 1, true) : null;
  // Rien après le synopsis : Suppr ne fait rien plutôt que de l'effacer.
  return found instanceof TextSelection ? found : TextSelection.create(doc, $from.pos);
}

export interface HiddenSynopsisOptions {
  /** Notes cachées (réglage « Afficher les notes » décoché, #169) : relu à chaque geste. */
  notesHidden: () => boolean;
}

export const HiddenSynopsis = Extension.create<HiddenSynopsisOptions>({
  name: "hiddenSynopsis",
  addOptions() {
    return { notesHidden: () => false };
  },
  // Avant le clavier de base (Retour arrière, Suppr) et celui du scénario.
  priority: 1000,
  addKeyboardShortcuts() {
    const run = (dir: -1 | 1) => () => {
      const next = jumpOver(this.editor.state, dir, this.options.notesHidden());
      if (!next) return false;
      this.editor.view.dispatch(this.editor.state.tr.setSelection(next));
      return true;
    };
    return { Backspace: run(-1), Delete: run(1), "Mod-Backspace": run(-1), "Mod-Delete": run(1) };
  },
  addProseMirrorPlugins() {
    const notesHidden = this.options.notesHidden;
    return [
      new Plugin({
        key,
        appendTransaction(trs, oldState, newState) {
          if (!trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
          const next = moveOff(newState, oldState.selection.head, notesHidden());
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
