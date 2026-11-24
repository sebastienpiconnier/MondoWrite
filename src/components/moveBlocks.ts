// Déplacer des lignes au clavier (#145) : le paragraphe du curseur, ou toutes les lignes de la sélection, montent
// ou descendent d'un cran, comme dans un traitement de texte (Alt Maj ↑ ↓). Pur : la commande reçoit l'état de
// ProseMirror et rend la transaction, ou null si le déplacement n'a pas lieu. Chaque éditeur dit ce qui forme
// un bloc (une réplique entière dans le scénario), ce qui peut bouger et ce par-dessus quoi l'on peut passer.

import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { PRESERVED } from "../screenplay/editor/nodes";
import { Extension } from "@tiptap/core";
import { SCENE_MARK } from "../bookDoc";

export interface MoveRules {
  /** Bloc de premier niveau auquel appartient l'enfant `i` du document : [premier, dernier + 1). */
  unit: (doc: PMNode, i: number) => [number, number];
  /** Les enfants [a, b) peuvent-ils bouger ? */
  movable: (doc: PMNode, a: number, b: number) => boolean;
  /** Peut-on passer par-dessus le bloc [na, nb), vers le haut (-1) ou le bas (1) ? */
  canPass: (doc: PMNode, na: number, nb: number, dir: -1 | 1) => boolean;
}

/** Position du début de l'enfant `i` du document. */
function posOf(doc: PMNode, i: number): number {
  let pos = 0;
  for (let k = 0; k < i; k++) pos += doc.child(k).nodeSize;
  return pos;
}

function children(doc: PMNode, a: number, b: number): PMNode[] {
  const out: PMNode[] = [];
  for (let k = a; k < b; k++) out.push(doc.child(k));
  return out;
}

export function moveBlocks(state: EditorState, dir: -1 | 1, rules: MoveRules): Transaction | null {
  const { doc, selection } = state;
  if (doc.childCount < 2) return null;
  const { from, to } = selection;
  const first = doc.resolve(from).index(0);
  // La fin d'une sélection posée juste après un bloc (sélection d'un nœud entier) n'appartient pas au suivant.
  const last = to > from ? doc.resolve(to - 1).index(0) : first;
  const a = rules.unit(doc, Math.min(first, doc.childCount - 1))[0];
  const b = rules.unit(doc, Math.min(last, doc.childCount - 1))[1];
  if (!rules.movable(doc, a, b)) return null;
  let start: number;
  let end: number;
  let nodes: PMNode[];
  let shift: number;
  if (dir === -1) {
    if (a === 0) return null;
    const [na] = rules.unit(doc, a - 1);
    if (!rules.canPass(doc, na, a, -1)) return null;
    start = posOf(doc, na);
    end = posOf(doc, b);
    nodes = [...children(doc, a, b), ...children(doc, na, a)];
    shift = -(posOf(doc, a) - start);
  } else {
    if (b >= doc.childCount) return null;
    const [, nb] = rules.unit(doc, b);
    if (!rules.canPass(doc, b, nb, 1)) return null;
    start = posOf(doc, a);
    end = posOf(doc, nb);
    nodes = [...children(doc, b, nb), ...children(doc, a, b)];
    shift = posOf(doc, nb) - posOf(doc, b);
  }
  const tr = state.tr.replaceWith(start, end, Fragment.fromArray(nodes));
  const anchor = selection.anchor + shift;
  const head = selection.head + shift;
  try {
    tr.setSelection(selection instanceof NodeSelection ? NodeSelection.create(tr.doc, from + shift) : TextSelection.create(tr.doc, anchor, head));
  } catch {
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(head, tr.doc.content.size))));
  }
  return tr.scrollIntoView();
}

const single = (_doc: PMNode, i: number): [number, number] => [i, i + 1];

/**
 * Livre (Manuscrit, carte Scène agrandie) : un paragraphe, une liste, une image… Jamais un repère de scène ni un
 * bloc de choix. Un bloc franchit un repère (il passe dans la scène voisine), sauf vers le haut avant la première
 * scène (un texte hors de toute scène ne s'enregistre pas) ou derrière un bloc de choix (toujours en fin de scène).
 */
export const BOOK_MOVE: MoveRules = {
  unit: single,
  movable: (doc, a, b) => children(doc, a, b).every((n) => n.type.name !== SCENE_MARK && n.type.name !== "sceneChoices"),
  canPass: (doc, na, _nb, dir) => {
    const n = doc.child(na);
    if (n.type.name === "sceneChoices") return false;
    if (n.type.name !== SCENE_MARK || dir === 1) return true;
    const before = children(doc, 0, na);
    return before.some((x) => x.type.name === SCENE_MARK) && before[before.length - 1]?.type.name !== "sceneChoices";
  },
};

const SPEECH = new Set(["character", "parenthetical", "dialogue"]);
const isHiddenSynopsis = (doc: PMNode, i: number) => {
  const n = doc.child(i);
  return n.type.name === PRESERVED && n.attrs.kind === "synopsis" && i > 0 && doc.child(i - 1).type.name === "sceneHeading";
};

/**
 * Scénario : une réplique (personnage, didascalies, dialogue) se déplace d'un seul coup, un en-tête avec son
 * synopsis caché. Ne bougent que l'action, les répliques et les transitions, jamais un en-tête (l'ordre des scènes
 * se change dans la liste des scènes). On passe par-dessus un en-tête (la ligne change de scène), pas par-dessus
 * une section, un saut de page ou une note.
 */
export const SCREENPLAY_MOVE: MoveRules = {
  unit: (doc, i) => {
    const name = doc.child(i).type.name;
    if (name === "sceneHeading" || isHiddenSynopsis(doc, i)) {
      let a = i;
      if (name !== "sceneHeading") a = i - 1;
      let b = a + 1;
      while (b < doc.childCount && isHiddenSynopsis(doc, b)) b++;
      return [a, b];
    }
    if (!SPEECH.has(name)) return [i, i + 1];
    let a = i;
    while (a > 0 && doc.child(a).type.name !== "character" && SPEECH.has(doc.child(a - 1).type.name)) a--;
    let b = a + 1;
    while (b < doc.childCount && (doc.child(b).type.name === "parenthetical" || doc.child(b).type.name === "dialogue")) b++;
    return [a, Math.max(b, i + 1)];
  },
  movable: (doc, a, b) => children(doc, a, b).every((n) => ["action", "character", "parenthetical", "dialogue", "transition"].includes(n.type.name)),
  canPass: (doc, na) => doc.child(na).type.name !== PRESERVED,
};

/**
 * Raccourcis : Alt Maj ↑ ↓ partout, et Ctrl Maj ↑ ↓ (celui de Word sur Mac). Sans effet possible (premier bloc,
 * en-tête de scène…), la touche est quand même prise : rien ne doit sélectionner le texte à la place.
 */
export const MoveBlocks = Extension.create<{ rules: MoveRules }>({
  name: "cosmosMoveBlocks",
  addOptions: () => ({ rules: BOOK_MOVE }),
  addKeyboardShortcuts() {
    const go = (dir: -1 | 1) => () => {
      // WebKit (Mac, iPad) : la sélection de ProseMirror peut retarder sur celle de la page juste après un clic.
      (this.editor.view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.();
      const tr = moveBlocks(this.editor.state, dir, this.options.rules);
      if (tr) this.editor.view.dispatch(tr);
      return true;
    };
    return { "Alt-Shift-ArrowUp": go(-1), "Alt-Shift-ArrowDown": go(1), "Ctrl-Shift-ArrowUp": go(-1), "Ctrl-Shift-ArrowDown": go(1) };
  },
});
