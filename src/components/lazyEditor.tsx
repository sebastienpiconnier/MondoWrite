// Texte riche créé à la demande : tant qu'on n'y écrit pas, on montre le HTML que l'éditeur afficherait
// (StaticBody) ; au clic, au toucher ou au focus, l'éditeur TipTap prend sa place (LiveBody) et le curseur se
// pose là où l'on a touché. Sert aux cartes du canevas et aux fiches de la Bible, nombreuses à l'écran : créer
// un éditeur coûte une dizaine de millisecondes, et un projet en montrait des centaines d'un coup.

import { useEffect, useLayoutEffect, useRef } from "react";
import { EditorContent, type Editor, type UseEditorOptions } from "@tiptap/react";
import { cardStaticBody } from "./cardStatic";
import { useStableEditor } from "./useStableEditor";

/** Où poser le curseur quand l'éditeur arrive : au point touché, au début ou à la fin. */
export type FocusTarget = "start" | "end" | { x: number; y: number; mouse?: boolean };

/** Le texte de la carte, sans éditeur : un clic, un toucher ou le focus au clavier crée l'éditeur. */
export function StaticBody({ html, className, label, placeholder, disabled = false, link = true, onActivate }: { html: string; className: string; label: string; placeholder: string; disabled?: boolean; link?: boolean; onActivate: (at: FocusTarget) => void }) {
  const body = cardStaticBody(html, link);
  // Doigt : le focus arrive avant le toucher terminé ; c'est le toucher qui place le curseur, pas le focus.
  const pointing = useRef(false);
  return (
    <div>
      <div
        className={`tiptap ProseMirror ${className} card-static`}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        // Souris : dès l'appui, pour que le curseur se pose là où l'on a cliqué. Doigt et stylet : au toucher
        // terminé (click), pour qu'un appui long (soulever la carte) n'ouvre pas le clavier.
        onPointerDown={(e) => {
          pointing.current = true;
          if (!disabled && e.pointerType === "mouse" && e.button === 0) onActivate({ x: e.clientX, y: e.clientY, mouse: true });
        }}
        onPointerCancel={() => (pointing.current = false)}
        onClick={(e) => {
          pointing.current = false;
          if (!disabled) onActivate({ x: e.clientX, y: e.clientY });
        }}
        onFocus={() => {
          if (!disabled && !pointing.current) onActivate("end");
        }}
        dangerouslySetInnerHTML={{ __html: body.empty ? `<p class="is-empty is-editor-empty" data-placeholder="${escapeAttr(placeholder)}"><br class="ProseMirror-trailingBreak"></p>` : body.html }}
      />
    </div>
  );
}

const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** L'éditeur de la carte, créé à la demande ; le curseur se pose là où l'on a touché. */
export function LiveBody({ options, at, onEditor }: { options: UseEditorOptions; at: FocusTarget; onEditor: (editor: Editor | null) => void }) {
  const editor = useStableEditor(options);
  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);
  // Avant l'image suivante : la frappe qui suit le clic (ou Entrée dans le titre) arrive dans le texte.
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (typeof at === "string") {
      editor.commands.focus(at);
      return;
    }
    const place = () => {
      if (editor.isDestroyed || editor.isFocused) return;
      const found = editor.view.posAtCoords({ left: at.x, top: at.y });
      editor.commands.focus(found ? found.pos : "end");
    };
    // Souris : l'éditeur est là avant que le bouton ne s'enfonce vraiment (mousedown), c'est lui qui le reçoit et
    // pose le curseur (et permet de sélectionner en glissant). On ne le place nous-mêmes que s'il n'a rien reçu.
    if (at.mouse) {
      const frame = requestAnimationFrame(() => requestAnimationFrame(place));
      return () => cancelAnimationFrame(frame);
    }
    place();
    // Le premier rendu seulement : ensuite, c'est l'éditeur qui suit le curseur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  return <EditorContent editor={editor} />;
}

