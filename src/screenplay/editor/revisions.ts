// Marques de révision dans l'éditeur (#18) : tant qu'une passe est ouverte, tout élément dont le texte change, ou
// qui naît, reçoit l'attribut `rev` de la passe. Les marques ne sont pas dans l'historique d'annulation. Rien
// n'est posé quand le contenu est rechargé (setContent) : seule la frappe de l'auteur marque.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Mapping, ReplaceStep } from "@tiptap/pm/transform";
import { REV_TYPES } from "../revisions";

export interface RevisionOptions {
  /** Numéro de la passe ouverte, ou null (relu à chaque transaction). */
  current: () => number | null;
}

export const revisionsKey = new PluginKey("screenplayRevisions");

export const Revisions = Extension.create<RevisionOptions>({
  name: "screenplayRevisions",
  addOptions: () => ({ current: () => null }),

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: revisionsKey,
        appendTransaction(transactions, _oldState, newState) {
          const n = options.current();
          if (n === null || !transactions.some((t) => t.docChanged)) return null;
          if (transactions.some((t) => t.getMeta("preventUpdate") || t.getMeta(revisionsKey))) return null;

          const maps = transactions.flatMap((t) => t.mapping.maps);
          const ranges: [number, number][] = [];
          let g = 0;
          for (const tr of transactions) {
            tr.steps.forEach((step, si) => {
              const index = g++;
              if (!(step instanceof ReplaceStep)) return;
              const before = tr.docs[si];
              // Tout le document remplacé d'un coup : un rechargement, pas une frappe.
              if (step.from === 0 && step.to === before.content.size) return;
              const rest = new Mapping(maps.slice(index + 1));
              step.getMap().forEach((_a, _b, from, to) => ranges.push([rest.map(from, -1), rest.map(to, 1)]));
            });
          }
          if (ranges.length === 0) return null;

          const marks = new Map<number, Record<string, unknown>>();
          const size = newState.doc.content.size;
          for (const [from, to] of ranges) {
            newState.doc.nodesBetween(Math.max(0, Math.min(from, size)), Math.max(0, Math.min(to, size)), (node, pos) => {
              if (REV_TYPES.has(node.type.name) && node.attrs.rev !== n && node.textContent !== "") marks.set(pos, node.attrs);
              return false; // premier niveau seulement
            });
          }
          if (marks.size === 0) return null;
          const tr = newState.tr;
          for (const [pos, attrs] of marks) tr.setNodeMarkup(pos, undefined, { ...attrs, rev: n });
          tr.setMeta(revisionsKey, true);
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),
    ];
  },
});
