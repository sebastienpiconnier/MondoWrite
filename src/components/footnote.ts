// Nœud TipTap `footnote` (1.13.0, footnotes.ts) : l'appel d'une note de bas de page dans le texte d'une scène
// (éditeurs `prose` : manuscrit, carte Scène agrandie). Un atome en ligne, sans contenu : son texte est un attribut,
// son numéro un compteur CSS (`.footnote-ref::after`), donc toujours juste quand on en ajoute ou en retire une.
// Cmd/Ctrl + Alt + F en pose une au curseur (après la sélection) et la choisit : `FootnotePopover` l'édite.

import { Node, mergeAttributes } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { cleanNote } from "../footnotes";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    footnote: {
      /** Pose un appel de note après la sélection (ou au curseur) et le sélectionne, prêt à être écrit. */
      insertFootnote: (text?: string) => ReturnType;
    };
  }
  interface Storage {
    footnote: { focusNext: boolean };
  }
}

export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addStorage: () => ({ focusNext: false }),
  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (el: HTMLElement) => cleanNote(el.getAttribute("data-footnote") ?? ""),
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-footnote": cleanNote(String(attrs.text ?? "")) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "footnote-ref" })];
  },
  addCommands() {
    return {
      insertFootnote:
        (text = "") =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes.footnote;
          if (!type) return false;
          const at = state.selection.to;
          if (!state.doc.resolve(at).parent.inlineContent) return false;
          if (dispatch) {
            tr.insert(at, type.create({ text: cleanNote(text) }));
            tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView();
            this.storage.focusNext = true;
            dispatch(tr);
          }
          return true;
        },
    };
  },
  addKeyboardShortcuts() {
    return { "Mod-Alt-f": () => this.editor.commands.insertFootnote() };
  },
});
