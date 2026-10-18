// Mode focus du manuscrit, côté éditeur : la phrase ou le paragraphe en cours reste en pleine encre, le
// reste s'estompe (décorations ProseMirror, rien n'est écrit dans le texte). Le mode « ligne » est un
// voile posé par Manuscript.tsx autour de la ligne du curseur, et la machine à écrire y est gérée aussi.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { sentenceAt, type FocusHighlight } from "../focusText";

export const focusKey = new PluginKey<DecorationSet>("cosmosFocus");

/** Premier ancêtre qui défile vraiment (null : c'est la fenêtre qui défile). */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

/** Machine à écrire : amène la ligne du curseur aux deux cinquièmes de la zone qui défile. Renvoie la nouvelle position du curseur. */
export function centerCaret(view: EditorView): { top: number; bottom: number } | null {
  let caret: { top: number; bottom: number };
  try {
    caret = view.coordsAtPos(view.state.selection.head);
  } catch {
    return null;
  }
  const scroller = scrollParent(view.dom);
  const box = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.visualViewport?.height ?? window.innerHeight };
  const delta = caret.top - (box.top + box.height * 0.4);
  if (Math.abs(delta) > 1) {
    if (scroller) scroller.scrollTop += delta;
    else window.scrollBy(0, delta);
    try {
      caret = view.coordsAtPos(view.state.selection.head);
    } catch {
      /* position inchangée */
    }
  }
  return caret;
}

export const FocusWriting = Extension.create<{ mode: () => FocusHighlight; typewriter: () => boolean }>({
  name: "cosmosFocus",
  addOptions: () => ({ mode: () => "off" as FocusHighlight, typewriter: () => false }),
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: focusKey,
        props: {
          // Saisie : ProseMirror veut amener le curseur dans la fenêtre (et WebKit le fait de lui-même). En
          // machine à écrire, on prend la main pour le tenir aux deux cinquièmes, après la mise à jour du DOM.
          handleScrollToSelection(view) {
            if (!options.typewriter()) return false;
            requestAnimationFrame(() => {
              if (!view.isDestroyed) centerCaret(view);
            });
            return true;
          },
          decorations(state) {
            const mode = options.mode();
            if (mode !== "sentence" && mode !== "paragraph") return null;
            const { $head } = state.selection;
            if ($head.depth < 1) return null;
            // Le bloc de premier niveau du curseur (paragraphe, titre, liste entière).
            const start = $head.before(1);
            const node = state.doc.nodeAt(start);
            if (!node) return null;
            if (mode === "paragraph") return DecorationSet.create(state.doc, [Decoration.node(start, start + node.nodeSize, { class: "is-focus-on" })]);
            // Phrase : dans le bloc de texte du curseur ; un caractère par feuille pour garder les positions.
            const parent = $head.parent;
            if (!parent.isTextblock) return null;
            const text = parent.textBetween(0, parent.content.size, undefined, "￼");
            let { from, to } = sentenceAt(text, $head.parentOffset);
            // Curseur juste après l'espace qui suit un point : on garde la phrase qu'on vient de finir en pleine encre.
            if (to <= from) ({ from, to } = sentenceAt(text, text.slice(0, $head.parentOffset).trimEnd().length));
            if (to <= from) return null;
            const base = $head.start();
            return DecorationSet.create(state.doc, [Decoration.inline(base + from, base + to, { class: "is-focus-on" })]);
          },
        },
      }),
    ];
  },
});
