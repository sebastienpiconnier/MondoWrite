// Lire le récit fil par fil (#117) dans un éditeur (livre du Manuscrit, feuille du Scénario) : décorations
// seulement, le document n'est ni coupé ni modifié. Les nœuds des scènes hors du fil sont cachés ; devant
// chaque scène gardée qui suit des scènes sautées, une ligne dit l'écart (« 3 scènes plus loin · environ
// 12 pages »). Le filtre est posé par une transaction (`setThreadFold`), comme le filtre par personnage.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/** Ce que reçoit l'éditeur : scènes gardées, et le texte de l'écart devant une scène (rien : pas d'écart). */
export interface ThreadFold {
  kept: ReadonlySet<string>;
  /**
   * Scènes connues quand le filtre a été posé : une scène née depuis (coupure, Entrée deux fois) reste montrée,
   * pour que le texte qu'on écrit ne disparaisse jamais sous le curseur.
   */
  known: ReadonlySet<string>;
  gap: (id: string) => string | null;
}

interface FoldState {
  fold: ThreadFold | null;
  set: DecorationSet;
}

export const threadFoldKey = new PluginKey<FoldState>("threadFold");

/** Une scène commence-t-elle à ce nœud de premier niveau ? Son identifiant (null : une scène sans carte), sinon undefined. */
export type SceneStart = (node: PMNode) => string | null | undefined;

function gapWidget(text: string) {
  return () => {
    const el = document.createElement("div");
    el.className = "thread-gap";
    el.setAttribute("contenteditable", "false");
    el.textContent = text;
    return el;
  };
}

function decorate(doc: PMNode, fold: ThreadFold | null, start: SceneStart): DecorationSet {
  if (!fold) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  // Avant la première scène (page de titre, sections), rien n'appartient au fil.
  let inKept = false;
  doc.forEach((node, pos) => {
    const id = start(node);
    if (id !== undefined) {
      inKept = id !== null && (fold.kept.has(id) || !fold.known.has(id));
      const gap = inKept && id && fold.kept.has(id) ? fold.gap(id) : null;
      if (gap) decorations.push(Decoration.widget(pos, gapWidget(gap), { side: -1, key: `gap-${id}-${gap}` }));
    }
    if (!inKept) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "is-thread-hidden" }));
  });
  return DecorationSet.create(doc, decorations);
}

/** Pose (ou retire, avec null) le filtre. */
export const setThreadFold = (state: EditorState, fold: ThreadFold | null): Transaction => state.tr.setMeta(threadFoldKey, { fold });

export const ThreadFoldExtension = Extension.create<{ start: SceneStart }>({
  name: "threadFold",
  addOptions: () => ({ start: () => undefined }),
  addProseMirrorPlugins() {
    const start = this.options.start;
    return [
      new Plugin<FoldState>({
        key: threadFoldKey,
        state: {
          init: (): FoldState => ({ fold: null, set: DecorationSet.empty }),
          apply(tr, value) {
            const meta = tr.getMeta(threadFoldKey) as { fold: ThreadFold | null } | undefined;
            if (meta) return { fold: meta.fold, set: decorate(tr.doc, meta.fold, start) };
            // Le texte change : les décorations suivent (une scène née d'une coupure reste visible, voir `known`).
            if (tr.docChanged && value.fold) return { fold: value.fold, set: decorate(tr.doc, value.fold, start) };
            return value;
          },
        },
        props: { decorations: (state) => threadFoldKey.getState(state)?.set },
      }),
    ];
  },
});
