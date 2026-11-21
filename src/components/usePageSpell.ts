// Correcteur orthographique dans le texte des scènes (manuscrit, scénario, carte Scène agrandie) : il suit le
// réglage de l'appareil en direct (writingAids.ts), et s'arrête quand LanguageTool vérifie pendant la frappe. Le reste de l'app hérite de l'attribut posé sur <html>.

import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { useSettings } from "../settings";
import { spellOnInPages } from "../writingAids";
import { ltLive } from "../languagetool/api";

/** Vrai si le texte des scènes est corrigé ; pose l'attribut sur l'éditeur donné, s'il y en a un. */
export function usePageSpell(editor?: Editor | null): boolean {
  const on = useSettings((s) => spellOnInPages(s.writing.spellcheck, ltLive(s.languageTool)));
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dom.setAttribute("spellcheck", String(on));
  }, [editor, on]);
  return on;
}
