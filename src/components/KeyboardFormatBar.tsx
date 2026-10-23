// Barre de mise en forme posée au-dessus du clavier virtuel (iPad, iPhone, Android), comme dans Notes :
// les mêmes boutons que la barre de sélection (gras, italique, barré, titre, listes, case, citation,
// « à reprendre »), sans avoir à sélectionner du texte. iPadOS ne laisse pas une app web ajouter ses propres
// boutons à la barre de raccourcis du clavier (gras, italique, souligné) : celle-ci vient juste au-dessus.
// Seulement pour les éditeurs de texte riche (cartes, Bible, manuscrit) ; l'éditeur de scénario a sa barre
// d'éléments.

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { FormatButtons, useFormatActions } from "./FormatBar";
import { isTouch } from "../platform";

/** L'éditeur TipTap qui a le focus, s'il accepte la mise en forme (TipTap pose `editor` sur son élément). */
function focusedRichEditor(): Editor | null {
  const el = document.activeElement instanceof HTMLElement ? document.activeElement.closest(".ProseMirror") : null;
  const editor = (el as (Element & { editor?: Editor }) | null)?.editor;
  if (!editor || editor.isDestroyed || !editor.isEditable) return null;
  // L'éditeur de scénario n'a ni gras ni listes : pas de barre pour lui.
  return "toggleBold" in editor.commands && "toggleBulletList" in editor.commands ? editor : null;
}

export function KeyboardFormatBar() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!isTouch()) return;
    const root = document.documentElement;
    const sync = () => {
      setOpen(root.dataset.keyboard === "open");
      setEditor(focusedRichEditor());
    };
    // Le clavier s'ouvre ou se ferme (keyboard.ts pose data-keyboard), le focus change d'éditeur.
    const watch = new MutationObserver(sync);
    watch.observe(root, { attributes: true, attributeFilter: ["data-keyboard"] });
    // À la sortie d'un champ, le focus suivant n'est connu qu'à l'image suivante.
    const later = () => requestAnimationFrame(sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", later);
    sync();
    return () => {
      watch.disconnect();
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", later);
    };
  }, []);
  if (!open || !editor) return null;
  return <KeyboardButtons key={editor.instanceId ?? "editor"} editor={editor} />;
}

function KeyboardButtons({ editor }: { editor: Editor }) {
  const actions = useFormatActions(editor);
  return (
    <div className="keyboard-format-bar">
      <FormatButtons actions={actions} />
    </div>
  );
}
