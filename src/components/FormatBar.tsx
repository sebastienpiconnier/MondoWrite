// Barre de mise en forme qui apparaît au-dessus d'un texte sélectionné : gras, italique, barré, titre,
// listes, case à cocher, citation et « à reprendre ». Le chemin souris et doigt des raccourcis clavier
// (Cmd/Ctrl+B, +I…) : sur un écran tactile, sélectionner un mot suffit à la faire paraître.

import type { ReactNode } from "react";
import type { EditorState } from "@tiptap/pm/state";
import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useT } from "../i18n";

interface Action {
  key: string;
  label: string;
  /** Texte du bouton (une lettre ou un symbole, mis en forme comme son effet). */
  glyph: ReactNode;
  active: boolean;
  run: () => void;
}

/** Pictogrammes des boutons « Créer un personnage » et « Créer un lieu ». */
const PERSON = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
    <circle cx="8" cy="5" r="3" />
    <path d="M2.5 14c0-3 2.4-5 5.5-5s5.5 2 5.5 5z" />
  </svg>
);
/** Chutier : un bac où le passage descend (il quitte le texte sans être perdu), avec son nom en toutes lettres. */
const TRAY = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5v6.5" />
    <path d="M5.2 5.4 8 8.2l2.8-2.8" />
    <path d="M1.8 9.5h3.4l.9 1.7h3.8l.9-1.7h3.4V14H1.8z" />
  </svg>
);
const PLACE = (
  <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
    <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5A4.5 4.5 0 0 0 8 1.5zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4z" />
  </svg>
);

interface FormatOptions {
  revisit?: boolean;
  /** Manuscrit : met le passage sélectionné au chutier. */
  onChutier?: () => void;
  /** Manuscrit : crée une fiche personnage ou lieu du nom sélectionné (`name` rend "" si ce n'est pas un nom possible). */
  onCreate?: { name: (state: EditorState) => string; run: (type: "personnage" | "lieu") => void };
}

/** Les boutons de mise en forme d'un éditeur, état actif compris (barre de sélection et barre du clavier). */
export function useFormatActions(editor: Editor, { revisit = true, onChutier, onCreate }: FormatOptions = {}): Action[] {
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
      nameable: onCreate ? onCreate.name(e.state) !== "" : false,
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
    ...(onCreate && on.nameable
      ? [
          { key: "create-personnage", label: f.createCharacter, glyph: PERSON, active: false, run: () => onCreate.run("personnage") },
          { key: "create-lieu", label: f.createPlace, glyph: PLACE, active: false, run: () => onCreate.run("lieu") },
        ]
      : []),
    ...(onChutier
      ? [
          {
            key: "chutier",
            label: f.chutier,
            glyph: (
              <>
                {TRAY}
                <span className="format-text">{f.chutierShort}</span>
              </>
            ),
            active: false,
            run: onChutier,
          },
        ]
      : []),
  ];
  return actions;
}

/** Les boutons eux-mêmes : le clic garde la sélection et le focus dans l'éditeur (le clavier reste ouvert). */
export function FormatButtons({ actions }: { actions: Action[] }) {
  const f = useT().format;
  return (
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
  );
}

export function FormatBar({ editor, ...options }: { editor: Editor } & FormatOptions) {
  const actions = useFormatActions(editor, options);
  return (
    <BubbleMenu editor={editor} className="format-bar nodrag nopan" options={{ placement: "top" }}>
      <FormatButtons actions={actions} />
    </BubbleMenu>
  );
}
