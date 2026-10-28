// (SUITE) / (CONT'D) sur la feuille à l'écran, quand un personnage reprend la parole après une action dans la
// même scène : une décoration sur son nom (le texte n'est pas touché, rien n'est écrit dans le fichier).
// Même règle que le PDF (`resumedCues`, typeset.ts). Les suites aux coupures de page sont dans pages.ts.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { ScreenplayElement } from "../model";
import { hasContd, resumedCues } from "../export/typeset";
import { PRESERVED } from "./nodes";

export interface ContinuedOptions {
  /** Réglage du projet (`scriptPdf.resumes`), relu à chaque mise à jour. */
  resumes: () => boolean;
  /** « (SUITE) » ou “(CONT'D)”, selon la langue. */
  contd: () => string;
}

/** Les éléments du document, juste ce qu'il faut pour `resumedCues` (un nœud de premier niveau = un élément). */
export function docElements(doc: PMNode): ScreenplayElement[] {
  const out: ScreenplayElement[] = [];
  doc.forEach((node) => {
    const type = (node.type.name === PRESERVED ? node.attrs.kind : node.type.name) as ScreenplayElement["type"];
    const el: ScreenplayElement = { type, text: node.type.name === PRESERVED ? String(node.attrs.text ?? "") : node.textContent };
    if (node.attrs.dual) el.dual = true;
    out.push(el);
  });
  return out;
}

export const continuedKey = new PluginKey("screenplayContinued");

export const Continued = Extension.create<ContinuedOptions>({
  name: "screenplayContinued",
  addOptions: () => ({ resumes: () => false, contd: () => "(CONT'D)" }),

  addProseMirrorPlugins() {
    const options = this.options;
    let cache: { doc: PMNode; label: string; set: DecorationSet } | null = null;
    return [
      new Plugin({
        key: continuedKey,
        props: {
          decorations(state) {
            if (!options.resumes()) return DecorationSet.empty;
            const label = options.contd();
            if (cache && cache.doc === state.doc && cache.label === label) return cache.set;
            const resumed = resumedCues(docElements(state.doc));
            const decorations: Decoration[] = [];
            let index = 0;
            state.doc.forEach((node, offset) => {
              if (resumed.has(index) && !hasContd(node.textContent, label)) {
                decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: "has-contd", "data-contd": label }));
              }
              index++;
            });
            const set = DecorationSet.create(state.doc, decorations);
            cache = { doc: state.doc, label, set };
            return set;
          },
        },
      }),
    ];
  },
});
