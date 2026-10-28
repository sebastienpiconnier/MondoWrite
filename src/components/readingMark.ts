// Lecture à voix haute : le bloc en cours de lecture est surligné (décoration, rien n'est écrit dans le texte).
// Partagé par l'éditeur de scénario et celui du livre ; le moteur (useReader) pose le rang du bloc.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const readingKey = new PluginKey<number | null>("readingMark");

/** Surligne le bloc de premier niveau `index` (null : plus rien). */
export const setReadingMark = (state: EditorState, index: number | null): Transaction => state.tr.setMeta(readingKey, { index }).setMeta("addToHistory", false);

export const ReadingMark = Extension.create({
  name: "readingMark",
  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: readingKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta = tr.getMeta(readingKey) as { index: number | null } | undefined;
            return meta ? meta.index : value;
          },
        },
        props: {
          decorations(state) {
            const index = readingKey.getState(state);
            if (index === null || index === undefined || index >= state.doc.childCount) return DecorationSet.empty;
            let pos = 0;
            for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
            const node = state.doc.child(index);
            return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: "is-reading" })]);
          },
        },
      }),
    ];
  },
});
