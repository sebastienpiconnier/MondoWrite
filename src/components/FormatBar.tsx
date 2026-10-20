// Barre de mise en forme qui apparaît au-dessus d'un texte sélectionné : gras, italique, barré, titre,
// listes, case à cocher, citation et « à reprendre ». Le chemin souris et doigt des raccourcis clavier
// (Cmd/Ctrl+B, +I…) : sur un écran tactile, sélectionner un mot suffit à la faire paraître.

import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useT } from "../i18n";

interface Action {
  key: string;
  label: string;
  /** Texte du bouton (une lettre ou un symbole, mis en forme comme son effet). */
  glyph: string;
  active: boolean;
  run: () => void;
}

export function FormatBar({ editor, revisit = true, onChutier }: { editor: Editor; revisit?: boolean; /** Manuscrit : met le passage sélectionné au chutier. */ onChutier?: () => void }) {
  const f = useT().format;
  const chain = () => editor.chain().focus();
  // Abonnement à la sélection : les boutons actifs suivent le curseur.
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      heading: e.isActive("heading"),
      bullet: e.isActive("bulletList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      revisit: e.isActive("highlight"),
    }),
  });
  const actions: Action[] = [
    { key: "bold", label: f.bold, glyph: f.boldGlyph, active: on.bold, run: () => chain().toggleBold().run() },
    { key: "italic", label: f.italic, glyph: f.italicGlyph, active: on.italic, run: () => chain().toggleItalic().run() },
    { key: "strike", label: f.strike, glyph: f.strikeGlyph, active: on.strike, run: () => chain().toggleStrike().run() },
    { key: "heading", label: f.heading, glyph: f.headingGlyph, active: on.heading, run: () => chain().toggleHeading({ level: 2 }).run() },
    { key: "bullet", label: f.bullet, glyph: "•", active: on.bullet, run: () => chain().toggleBulletList().run() },
    { key: "task", label: f.task, glyph: "☐", active: on.task, run: () => chain().toggleTaskList().run() },
    { key: "quote", label: f.quote, glyph: "“", active: on.quote, run: () => chain().toggleBlockquote().run() },
    ...(revisit
      ? [{ key: "revisit", label: f.revisit, glyph: "!", active: on.revisit, run: () => chain().toggleHighlight().run() }]
      : []),
    ...(onChutier ? [{ key: "chutier", label: f.chutier, glyph: "⤓", active: false, run: onChutier }] : []),
  ];
  return (
    <BubbleMenu editor={editor} className="format-bar nodrag nopan" options={{ placement: "top" }}>
      <div role="toolbar" aria-label={f.aria}>
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`format-${a.key}${a.active ? " is-active" : ""}`}
            aria-label={a.label}
            aria-pressed={a.active}
            title={a.label}
            // Garder la sélection : le clic ne doit pas retirer le focus de l'éditeur.
            onPointerDown={(e) => e.preventDefault()}
            onClick={a.run}
          >
            <span aria-hidden="true">{a.glyph}</span>
          </button>
        ))}
      </div>
    </BubbleMenu>
  );
}
