// Marque `ia` des éditeurs de texte (cartes, Bible, manuscrit) : un passage proposé par l'IA en mode Atelier et
// accepté par l'auteur. Rendu `<span data-ia="<id>">…</span>` (souligné en pointillé, couleur `--ia-mark`), gardé
// tel quel dans le Markdown (règle turndown de storage/markdown.ts), accepté par sanitizeHtml avec un identifiant
// sûr seulement. « Je l'ai repris » la retire (commande `unsetIa`), le texte reste.

import { Mark, mergeAttributes } from "@tiptap/react";
import { isIaId } from "../atelier";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    ia: {
      /** Retire la marque de l'IA de la sélection (et des passages entiers qu'elle touche). */
      unsetIa: () => ReturnType;
    };
  }
}

export const IaMark = Mark.create({
  name: "ia",
  // Le texte tapé juste après un passage proposé est celui de l'auteur : la marque ne s'étend pas.
  inclusive: false,
  addAttributes() {
    return {
      id: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const id = el.getAttribute("data-ia");
          return isIaId(id) ? id : null;
        },
        renderHTML: (attrs: Record<string, unknown>) => (isIaId(attrs.id) ? { "data-ia": attrs.id } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-ia]", getAttrs: (el) => (isIaId((el as HTMLElement).getAttribute("data-ia")) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "ia-mark" }), 0];
  },
  addCommands() {
    return {
      unsetIa:
        () =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.marks.ia;
          if (!type) return false;
          const { from, to } = state.selection;
          // Identifiants des passages touchés par la sélection (ou sous le curseur) : on les retire en entier.
          const ids = new Set<string>();
          const at = (pos: number) => state.doc.resolve(pos).marks().forEach((m) => m.type === type && ids.add(m.attrs.id));
          state.doc.nodesBetween(from, to, (node) => {
            node.marks.forEach((m) => m.type === type && ids.add(m.attrs.id));
          });
          at(from);
          if (ids.size === 0) return false;
          state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            const m = node.marks.find((mk) => mk.type === type && ids.has(mk.attrs.id));
            if (m) tr.removeMark(pos, pos + node.nodeSize, m);
          });
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

/** La sélection (ou le curseur) touche-t-elle un passage proposé par l'IA ? */
export function selectionHasIa(state: import("@tiptap/pm/state").EditorState): boolean {
  const type = state.schema.marks.ia;
  if (!type) return false;
  const { from, to, empty } = state.selection;
  if (empty) return state.doc.resolve(from).marks().some((m) => m.type === type);
  return state.doc.rangeHasMark(from, to, type);
}
