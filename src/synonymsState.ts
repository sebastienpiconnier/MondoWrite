// Synonymes (#16) : ce que la fenêtre « Synonymes » doit montrer et comment remplacer le mot. État d'affichage,
// rien n'est enregistré. `openSynonyms` lit le mot sous le curseur d'un éditeur (ou la sélection, si c'est un mot).

import { create } from "zustand";
import type { Editor } from "@tiptap/react";
import { wordBounds } from "./thesaurus";
import { useCosmos } from "./store";

export interface SynonymsTarget {
  /** Mot tel qu'écrit dans le texte, "" s'il n'y en a pas sous le curseur. */
  word: string;
  /** Remplace le mot par ce texte (la casse est déjà celle du mot remplacé). */
  replace: (text: string) => void;
  /** Rend le focus à l'éditeur. */
  refocus: () => void;
}

export const useSynonyms = create<{ target: SynonymsTarget | null }>(() => ({ target: null }));

/** Ouvre la fenêtre pour le mot du curseur. Rend vrai : le raccourci est pris même sans mot (la fenêtre l'explique). */
export function openSynonyms(editor: Editor): boolean {
  const { state } = editor;
  const { from, to, empty, $from } = state.selection;
  let range: { from: number; to: number } | null = null;
  if (!empty) {
    const text = state.doc.textBetween(from, to, " ", "￼");
    if (/^[\p{L}\p{M}'’-]+$/u.test(text)) range = { from, to };
  } else if ($from.parent.isTextblock) {
    const text = $from.parent.textBetween(0, $from.parent.content.size, undefined, "￼");
    const b = wordBounds(text, $from.parentOffset);
    if (b) range = { from: $from.start() + b.from, to: $from.start() + b.to };
  }
  const word = range ? state.doc.textBetween(range.from, range.to) : "";
  useSynonyms.setState({
    target: {
      word,
      replace: (text) => {
        if (!range) return;
        editor.view.dispatch(editor.state.tr.insertText(text, range.from, range.to).scrollIntoView());
      },
      refocus: () => editor.view.focus(),
    },
  });
  useCosmos.getState().setDialog("synonyms");
  return true;
}
