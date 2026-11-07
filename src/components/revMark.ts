// Marque `rev` du texte des scènes (#22) : le passage tapé ou collé pendant une passe de révision ouverte. Rendu
// `<span data-rev="<n>">…</span>`, gardé dans le Markdown (règle turndown de storage/markdown.ts), accepté par
// sanitizeHtml avec un numéro sûr seulement. Le plugin marque ce que l'auteur insère ; un contenu rechargé
// (setContent, updateState) ne marque rien. Les marques ne sont pas dans l'historique d'annulation.
// Une passe plus récente remplace la marque d'une plus ancienne sur le même texte (`excludes` par défaut).

import { Extension, Mark, mergeAttributes } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Mapping, ReplaceStep } from "@tiptap/pm/transform";
import { isRevNumber } from "../novelRevisions";
import { useCosmos } from "../store";

export const RevMark = Mark.create({
  name: "rev",
  // Le texte tapé juste après un passage marqué ne le prolonge pas : seule la passe ouverte marque.
  inclusive: false,
  addAttributes() {
    return {
      n: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const n = el.getAttribute("data-rev");
          return isRevNumber(n) ? n : null;
        },
        renderHTML: (attrs: Record<string, unknown>) => (isRevNumber(attrs.n) ? { "data-rev": attrs.n } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-rev]", getAttrs: (el) => (isRevNumber((el as HTMLElement).getAttribute("data-rev")) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "rev-mark" }), 0];
  },
});

export const novelRevisionKey = new PluginKey("novelRevisions");

export interface NovelRevisionOptions {
  /** Numéro de la passe ouverte, ou null (relu à chaque transaction). */
  current: () => number | null;
}

export const NovelRevisions = Extension.create<NovelRevisionOptions>({
  name: "novelRevisions",
  addOptions: () => ({ current: () => useCosmos.getState().revisions.current }),
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: novelRevisionKey,
        appendTransaction(transactions, _old, newState) {
          const n = options.current();
          const type = newState.schema.marks.rev;
          if (n === null || !type || !transactions.some((t) => t.docChanged)) return null;
          if (transactions.some((t) => t.getMeta("preventUpdate") || t.getMeta(novelRevisionKey))) return null;

          const maps = transactions.flatMap((t) => t.mapping.maps);
          const ranges: [number, number][] = [];
          let g = 0;
          for (const tr of transactions) {
            tr.steps.forEach((step, si) => {
              const index = g++;
              if (!(step instanceof ReplaceStep)) return;
              // Tout le document remplacé d'un coup : un rechargement, pas une frappe.
              if (step.from === 0 && step.to === tr.docs[si].content.size) return;
              const rest = new Mapping(maps.slice(index + 1));
              step.getMap().forEach((_a, _b, from, to) => {
                if (to > from) ranges.push([rest.map(from, -1), rest.map(to, 1)]);
              });
            });
          }
          if (ranges.length === 0) return null;

          const size = newState.doc.content.size;
          const tr = newState.tr;
          const mark = type.create({ n: String(n) });
          for (const [from, to] of ranges) {
            const a = Math.max(0, Math.min(from, size));
            const b = Math.max(0, Math.min(to, size));
            if (b > a) tr.addMark(a, b, mark);
          }
          if (!tr.docChanged && tr.steps.length === 0) return null;
          tr.setMeta(novelRevisionKey, true);
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
    ];
  },
});
