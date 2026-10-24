// Filtre par personnage dans l'éditeur du Scénario : décorations seulement (classes sur les nœuds), le
// document n'est ni coupé ni modifié. Le filtre est posé par une transaction (`setCharacterFilter`).

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { filterElements, type CharacterFilter } from "../../review/filter";
import { PRESERVED } from "./nodes";

interface FilterState {
  filter: CharacterFilter | null;
  set: DecorationSet;
}

export const characterFilterKey = new PluginKey<FilterState>("characterFilter");

/** Un nœud de premier niveau lu comme un élément du scénario (type et texte). */
const asElement = (node: PMNode) =>
  node.type.name === PRESERVED ? { type: String(node.attrs.kind), text: String(node.attrs.text ?? "") } : { type: node.type.name, text: node.textContent };

function decorate(doc: PMNode, filter: CharacterFilter | null): DecorationSet {
  if (!filter) return DecorationSet.empty;
  const nodes: { node: PMNode; pos: number }[] = [];
  doc.forEach((node, pos) => nodes.push({ node, pos }));
  const seen = filterElements(nodes.map((n) => asElement(n.node)), filter);
  const decorations: Decoration[] = [];
  nodes.forEach(({ node, pos }, i) => {
    if (seen[i] === "hide") decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "is-filter-hidden" }));
    else if (seen[i] === "dim") decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: "is-filter-dim" }));
  });
  return DecorationSet.create(doc, decorations);
}

/** Pose (ou retire, avec null) le filtre. */
export const setCharacterFilter = (state: EditorState, filter: CharacterFilter | null): Transaction => state.tr.setMeta(characterFilterKey, { filter });

export const CharacterFilterExtension = Extension.create({
  name: "characterFilter",
  addProseMirrorPlugins() {
    return [
      new Plugin<FilterState>({
        key: characterFilterKey,
        state: {
          init: (): FilterState => ({ filter: null, set: DecorationSet.empty }),
          apply(tr, value) {
            const meta = tr.getMeta(characterFilterKey) as { filter: CharacterFilter | null } | undefined;
            if (meta) return { filter: meta.filter, set: decorate(tr.doc, meta.filter) };
            // Le texte change : une réplique écrite peut faire entrer une scène dans le filtre.
            if (tr.docChanged && value.filter) return { filter: value.filter, set: decorate(tr.doc, value.filter) };
            return value;
          },
        },
        props: { decorations: (state) => characterFilterKey.getState(state)?.set },
      }),
    ];
  },
});
