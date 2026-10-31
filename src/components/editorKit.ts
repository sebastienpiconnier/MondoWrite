// Extensions communes aux éditeurs de texte (cartes, Bible, manuscrit) : la même mise en forme partout.
// - Markdown à la frappe : **gras**, *italique*, ~~barré~~, `# ` titre, `- ` liste, `1. ` liste numérotée,
//   `> ` citation, `[ ] ` case à cocher, ==à reprendre== (règles de saisie de TipTap).
// - Markdown au collage : un texte brut en Markdown arrive mis en forme (MarkdownPaste).
// - Cases à cocher (listes de tâches), enregistrées en Markdown standard `- [ ]` / `- [x]`.
// - « À reprendre » : un passage surligné, comme les marques de NEO (Cmd/Ctrl+Maj+X), enregistré en <mark>.
// Raccourcis : Cmd/Ctrl+B gras, +I italique, +Maj+X à reprendre, +Maj+9 case à cocher, +Maj+8 liste,
// +Maj+7 liste numérotée, +Maj+B citation, +Alt+1 à 3 titres.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Highlight from "@tiptap/extension-highlight";
import Strike from "@tiptap/extension-strike";
import { markdownToHtml } from "../storage/markdown";
import { looksLikeMarkdown, markdownSource } from "../markdownText";
import { useSettings } from "../settings";
import { smartType, typographyMode } from "../typography";

/** Texte brut collé en Markdown : converti en texte mis en forme. Le HTML collé garde son chemin habituel. */
export const MarkdownPaste = Extension.create({
  name: "cosmosMarkdownPaste",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("cosmosMarkdownPaste"),
        props: {
          handlePaste: (_view, event) => {
            const data = event.clipboardData;
            if (!data || data.types.includes("text/html")) return false;
            const text = data.getData("text/plain");
            if (!text || !looksLikeMarkdown(text)) return false;
            const html = markdownToHtml(markdownSource(text));
            if (!html) return false;
            editor.commands.insertContent(html);
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * Typographie automatique (typography.ts) : guillemets, apostrophe, points de suspension, tiret et, en
 * français, espaces insécables. Le mode est relu à chaque frappe (réglage de l'appareil, langue). Rien
 * dans le code (`code`), et rien pendant une saisie composée, que ProseMirror ne passe pas ici.
 */
export const Typography = Extension.create({
  name: "cosmosTypography",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("cosmosTypography"),
        props: {
          handleTextInput: (view, from, to, text) => {
            const { writing, lang } = useSettings.getState();
            const mode = typographyMode(writing.typography, lang);
            if (mode === "off" || from !== to) return false;
            const $from = view.state.doc.resolve(from);
            if ($from.parent.type.spec.code || $from.marks().some((m) => m.type.name === "code")) return false;
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
            const edit = smartType(before, text, mode);
            if (!edit) return false;
            view.dispatch(view.state.tr.insertText(edit.insert, from - edit.remove, to));
            return true;
          },
        },
      }),
    ];
  },
});

/** « À reprendre » : Cmd/Ctrl+Maj+X en plus du raccourci d'origine. */
const Revisit = Highlight.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Shift-x": () => this.editor.commands.toggleHighlight(),
    };
  },
});

/**
 * Barré : Cmd/Ctrl+Maj+D, à la place de Cmd/Ctrl+Maj+S de TipTap (sur Mac, ⇧⌘S est « Enregistrer sous » ou
 * « Dupliquer » ; ⇧⌘X, l'usage de Google Docs, est déjà « à reprendre » ; ⇧⌘5 lance la capture d'écran).
 * Le Markdown `~~texte~~` à la frappe reste celui de TipTap.
 */
const StrikeD = Strike.extend({
  addKeyboardShortcuts() {
    return { "Mod-Shift-d": () => this.editor.commands.toggleStrike() };
  },
});

export function richTextExtensions({ link = true }: { link?: boolean } = {}) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, strike: false, ...(link ? {} : { link: false }) }),
    StrikeD,
    TaskList,
    TaskItem.configure({ nested: true }),
    Revisit,
    MarkdownPaste,
    Typography,
  ];
}
