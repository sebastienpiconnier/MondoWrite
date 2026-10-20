// Mode focus du scénario, côté vue : redessine la mise en valeur quand le réglage change, tient la ligne du
// curseur aux deux cinquièmes en machine à écrire et rend la position du voile du mode « ligne ».
// Même comportement que celui du manuscrit (BookEditor), pour la feuille de cinéma.

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { centerCaret, focusKey } from "./focusWriting";
import type { FocusHighlight } from "../focusText";

export function useFocusFollow(editor: Editor | null, focusMode: boolean, typewriter: boolean, highlight: FocusHighlight): { top: number; bottom: number } | null {
  const [veil, setVeil] = useState<{ top: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(focusKey, Date.now()));
    const follow = () => {
      if (!focusMode || editor.isDestroyed) return setVeil(null);
      const { view } = editor;
      const page = view.dom.closest<HTMLElement>(".sp-page");
      if (!page) return;
      let caret: { top: number; bottom: number } | null;
      try {
        caret = typewriter ? centerCaret(view) : view.coordsAtPos(view.state.selection.head);
      } catch {
        return;
      }
      if (!caret) return;
      if (highlight !== "line") return setVeil(null);
      const top = page.getBoundingClientRect().top;
      setVeil({ top: caret.top - top - 2, bottom: caret.bottom - top + 2 });
    };
    follow();
    editor.on("selectionUpdate", follow);
    editor.on("update", follow);
    editor.on("focus", follow);
    return () => {
      editor.off("selectionUpdate", follow);
      editor.off("update", follow);
      editor.off("focus", follow);
    };
  }, [editor, focusMode, typewriter, highlight]);

  return veil;
}
