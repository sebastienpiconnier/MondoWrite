// Clavier de l'éditeur de scénario (conventions Final Draft, adaptées) :
// Tab et Maj+Tab changent le type de l'élément courant, Entrée crée l'élément suivant logique,
// Retour arrière supprime un élément vide, Maj+Entrée va à la ligne dans le même élément.

import { Extension } from "@tiptap/react";
import { Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { isEditableType, type EditableType } from "./nodes";
import { isTransitionCue } from "../rules";
import { RETYPE_META, UPPERCASE, attrMemory, caseMemory } from "./autodetect";

type Dispatch = ((tr: Transaction) => void) | undefined;

export const ENTER_NEXT: Record<EditableType, EditableType> = {
  sceneHeading: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "action",
  transition: "sceneHeading",
};

export const TAB_NEXT: Record<EditableType, EditableType> = {
  sceneHeading: "action",
  action: "character",
  character: "action",
  parenthetical: "dialogue",
  dialogue: "parenthetical",
  transition: "sceneHeading",
};

export const SHIFT_TAB_NEXT: Record<EditableType, EditableType> = {
  sceneHeading: "transition",
  action: "sceneHeading",
  character: "action",
  parenthetical: "dialogue",
  dialogue: "character",
  transition: "action",
};

/** L'élément (nœud de premier niveau) qui contient le curseur, s'il est éditable. */
export function currentElement(state: EditorState): { node: PMNode; pos: number; type: EditableType } | null {
  const { $from, $to } = state.selection;
  if ($from.depth !== 1 || !$from.sameParent($to)) return null;
  const node = $from.parent;
  return isEditableType(node.type.name) ? { node, pos: $from.before(1), type: node.type.name } : null;
}

/** Vide, ou didascalie réduite à ses parenthèses. */
const isEmptyElement = (node: PMNode) =>
  node.content.size === 0 || (node.type.name === "parenthetical" && /^\(\s*\)$/.test(node.textContent));

/** Une didascalie porte ses parenthèses dans son texte : on les pose et on les retire avec le type. */
function retype(text: string, from: EditableType, to: EditableType, offset: number) {
  if (to === "parenthetical" && from !== "parenthetical" && !/^\(.*\)$/s.test(text.trim())) {
    return { text: `(${text})`, offset: offset + 1 };
  }
  if (from === "parenthetical" && to !== "parenthetical") {
    const inner = /^\((.*)\)$/s.exec(text.trim());
    if (inner) return { text: inner[1], offset: Math.min(Math.max(0, offset - 1), inner[1].length) };
  }
  return { text, offset };
}

function replaceElement(tr: Transaction, pos: number, node: PMNode, to: EditableType, offset: number, state?: EditorState): Transaction {
  const from = node.type.name as EditableType;
  // Repassé en casse libre sans avoir été retouché : le texte retrouve sa casse d'avant les majuscules.
  const memory = state ? caseMemory.getState(state) : null;
  const restore =
    memory && memory.pos === pos && UPPERCASE.has(from) && !UPPERCASE.has(to) && node.textContent === memory.upper ? memory.original : null;
  const next = retype(restore ?? node.textContent, from, to, offset);
  tr.setMeta(RETYPE_META, true);
  if (restore !== null) tr.setMeta(caseMemory, null);
  const schema = tr.doc.type.schema;
  // Le lien vers la carte et le numéro appartiennent à l'en-tête : ils ne suivent pas un changement de type,
  // mais sont retenus (attrMemory) pour qu'un retour à l'en-tête au même endroit les retrouve.
  const kept = state ? attrMemory.getState(state) : null;
  const back = kept && kept.pos === pos && kept.type === to ? kept.attrs : null;
  const own = Object.values(node.attrs).some((v) => v !== null && v !== false);
  if (back) tr.setMeta(attrMemory, null);
  else if (state && own && !(kept && kept.pos === pos)) tr.setMeta(attrMemory, { pos, type: from, attrs: node.attrs });
  const created = schema.nodes[to].create(back, next.text ? schema.text(next.text) : null);
  tr.replaceWith(pos, pos + node.nodeSize, created);
  return tr.setSelection(TextSelection.create(tr.doc, pos + 1 + next.offset));
}

/** Change le type de l'élément courant (Tab, barre d'éléments). */
export function setElementType(to: EditableType) {
  return (state: EditorState, dispatch: Dispatch): boolean => {
    const current = currentElement(state);
    if (!current) return false;
    if (current.type === to) return true;
    if (dispatch) {
      const tr = replaceElement(state.tr, current.pos, current.node, to, state.selection.$from.parentOffset, state);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/** Une action validée par Entrée devient une transition si son texte en est une (« CUT TO: », « COUPE À : »). */
const looksLikeTransition = (text: string) => !text.includes("\n") && isTransitionCue(text);

export function enter(state: EditorState, dispatch: Dispatch): boolean {
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const $from = tr.selection.$from;
  if ($from.depth !== 1 || !isEditableType($from.parent.type.name)) return false;

  let node = $from.parent;
  let type = node.type.name as EditableType;
  const pos = $from.before(1);
  const offset = $from.parentOffset;

  if (type === "action" && looksLikeTransition(node.textContent)) {
    replaceElement(tr, pos, node, "transition", offset);
    node = tr.doc.nodeAt(pos)!;
    type = "transition";
  }

  if (isEmptyElement(node)) {
    // Élément vide : Entrée le transforme (même colonne que Tab), pour enchaîner au clavier.
    replaceElement(tr, pos, node, TAB_NEXT[type], offset);
  } else {
    const text = node.textContent;
    const atEnd = offset === text.length || type === "parenthetical";
    const schema = tr.doc.type.schema;
    if (atEnd) {
      const after = pos + node.nodeSize;
      tr.insert(after, schema.nodes[ENTER_NEXT[type]].create());
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
    } else {
      // Au milieu du texte : la suite garde le type quand il se prête à plusieurs paragraphes.
      const rest = type === "action" || type === "dialogue" ? type : ENTER_NEXT[type];
      tr.split($from.pos, 1, [{ type: schema.nodes[rest] }]);
    }
  }
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

export function backspace(state: EditorState, dispatch: Dispatch): boolean {
  const current = currentElement(state);
  if (!current || !state.selection.empty || !isEmptyElement(current.node)) return false;
  const { node, pos, type } = current;
  const tr = state.tr;
  if (state.doc.childCount === 1) {
    // Dernier élément du document : on repart d'une action vide.
    if (type === "action") return false;
    tr.replaceWith(pos, pos + node.nodeSize, state.schema.nodes.action.create());
    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  } else {
    tr.delete(pos, pos + node.nodeSize);
    const first = pos === 0;
    tr.setSelection(Selection.near(tr.doc.resolve(first ? 0 : pos), first ? 1 : -1));
  }
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
}

function newline(state: EditorState, dispatch: Dispatch): boolean {
  const current = currentElement(state);
  if (!current) return false;
  // Seuls l'action et le dialogue s'écrivent sur plusieurs lignes.
  if (current.type !== "action" && current.type !== "dialogue") return true;
  if (dispatch) dispatch(state.tr.insertText("\n").scrollIntoView());
  return true;
}

export interface KeymapOptions {
  /** Échap : sortir de l'éditeur au clavier (Tab ne le permet plus). */
  onEscape: () => void;
}

export const ScreenplayKeymap = Extension.create<KeymapOptions>({
  name: "screenplayKeymap",
  // Avant le clavier par défaut de TipTap (Entrée, Retour arrière).
  priority: 1000,
  addOptions: () => ({ onEscape: () => {} }),
  addKeyboardShortcuts() {
    const run = (command: (state: EditorState, dispatch: Dispatch) => boolean) => () =>
      command(this.editor.state, this.editor.view.dispatch);
    const tab = (table: Record<EditableType, EditableType>) => () => {
      const current = currentElement(this.editor.state);
      // Dans l'éditeur, Tab ne quitte jamais le texte (voir Échap).
      return current ? run(setElementType(table[current.type]))() : true;
    };
    return {
      Tab: tab(TAB_NEXT),
      "Shift-Tab": tab(SHIFT_TAB_NEXT),
      Enter: run(enter),
      "Shift-Enter": run(newline),
      Backspace: run(backspace),
      Escape: () => {
        this.options.onEscape();
        return true;
      },
    };
  },
});
