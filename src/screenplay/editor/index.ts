// Extensions TipTap de l'éditeur de scénario, assemblées.

import { CharacterFilterExtension } from "./characterFilter";
import { FocusWriting } from "../../components/focusWriting";
import type { FocusHighlight } from "../../focusText";
import type { Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Autodetect } from "./autodetect";
import { ScreenplayKeymap } from "./keymap";
import { Pages, type PagesOptions } from "./pages";
import { Continued, type ContinuedOptions } from "./continued";
import { ReadingMark } from "../../components/readingMark";
import {
  Action,
  Character,
  Dialogue,
  Doc,
  Parenthetical,
  Preserved,
  SceneHeading,
  Transition,
  isEditableType,
  type EditableType,
} from "./nodes";

export { toDoc, fromDoc } from "./convert";
export { currentElement, setElementType } from "./keymap";
export { isEditableType, type EditableType, type PreservedKind } from "./nodes";

export interface ScreenplayEditorOptions {
  locale: () => string;
  /** Texte indicatif d'un élément vide (i18n, relu à chaque rendu). */
  placeholder: (type: EditableType) => string;
  onEscape: () => void;
  /** Aspect « pages » : géométrie de la page courante, et écran assez large ou non. */
  pages?: PagesOptions;
  /** Mode focus : mise en valeur de la phrase ou du paragraphe, machine à écrire (mêmes réglages que le manuscrit). */
  focus?: { mode: () => FocusHighlight; typewriter: () => boolean };
  /** (SUITE) quand un personnage reprend après une action (réglage du projet, relu à chaque mise à jour). */
  continued?: ContinuedOptions;
}

export function screenplayExtensions(options: ScreenplayEditorOptions): Extensions {
  return [
    Doc,
    Action,
    SceneHeading,
    Character,
    Parenthetical,
    Dialogue,
    Transition,
    Preserved,
    // De StarterKit on ne garde que le texte, l'historique et le curseur entre deux blocs non éditables.
    StarterKit.configure({
      document: false,
      paragraph: false,
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      codeBlock: false,
      horizontalRule: false,
      hardBreak: false,
      bold: false,
      italic: false,
      strike: false,
      underline: false,
      code: false,
      link: false,
      dropcursor: false,
      trailingNode: false,
    }),
    Placeholder.configure({
      showOnlyCurrent: true,
      placeholder: ({ node }) => (isEditableType(node.type.name) ? options.placeholder(node.type.name) : ""),
    }),
    ScreenplayKeymap.configure({ onEscape: options.onEscape }),
    Autodetect.configure({ locale: options.locale }),
    ...(options.pages ? [Pages.configure(options.pages)] : []),
    ...(options.focus ? [FocusWriting.configure(options.focus)] : []),
    ...(options.continued ? [Continued.configure(options.continued)] : []),
    CharacterFilterExtension,
    ReadingMark,
  ];
}
