// « Ce qui change » d'une scène (Bible v2, lot 5) : quelques lignes libres, une par changement, avec mentions @.
// Les pastilles de verbes (apprend, reçoit, perd…) ne font qu'écrire le mot à l'endroit du curseur : une
// phrase libre reste valable. La lecture (journal, état d'un personnage, qui sait quoi) est dans changes.ts ;
// ici, on écrit seulement. Même éditeur et mêmes mentions que le corps d'une fiche (BibleBody).

import { useEffect, useId, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { richTextExtensions } from "./editorKit";
import { MentionNode } from "./MentionNode";
import { useMentionMenu } from "./useMentionMenu";
import { useCosmos } from "../store";
import { fmt, getT, useT } from "../i18n";
import { useSettings } from "../settings";
import { CHANGE_VERBS } from "../changes";
import type { CardData } from "../types";

const attributes = (title: string) => ({
  class: "scene-changes-editor",
  "aria-label": title.trim() ? fmt(getT().changes.aria, { title: title.trim() }) : getT().changes.ariaUntitled,
});

/** Un éditeur vide rend « <p></p> » : on n'écrit rien dans la carte pour si peu. */
const isEmpty = (html: string) => !html.replace(/<p>\s*<\/p>/g, "").trim();

export function SceneChanges({ card, compact = false }: { card: CardData; compact?: boolean }) {
  const t = useT().changes;
  const lang = useSettings((s) => s.lang);
  const titleId = useId();
  const mentions = useMentionMenu(card.id);
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;
  const editor = useEditor({
    extensions: [...richTextExtensions({ link: false }), Placeholder.configure({ placeholder: () => getT().changes.placeholder }), MentionNode],
    content: card.changes ?? "",
    immediatelyRender: true,
    editorProps: { attributes: attributes(card.title), handleKeyDown: (_view, event) => mentionsRef.current.handleKey(event) },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      useCosmos.getState().updateCard(card.id, { changes: isEmpty(html) ? undefined : html });
      mentionsRef.current.detect(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => mentionsRef.current.detect(ed),
    onBlur: () => mentionsRef.current.onBlur(),
  });

  // Changé ailleurs (annuler, renommage d'une carte citée) : l'éditeur suit.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const html = card.changes ?? "";
    if (html === editor.getHTML() || (!html && editor.isEmpty)) return;
    editor.commands.setContent(html, { emitUpdate: false });
  }, [card.changes, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes: attributes(card.title) } });
    editor.view.dispatch(editor.state.tr.setMeta("cosmos:lang", lang));
  }, [lang, card.title, editor]);

  /** Écrit le verbe au curseur, avec une espace avant si besoin, et une après. */
  const insertVerb = (word: string) => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from, "\n", "\u0001");
    const lead = before && !/\s/.test(before) ? " " : "";
    editor.chain().focus().insertContent(`${lead}${word} `).run();
  };

  return (
    <section className={`scene-changes${compact ? " is-compact" : ""}`} aria-labelledby={titleId}>
      <h3 id={titleId} className="scene-changes-title">
        {t.title}
      </h3>
      {!compact && <p className="scene-changes-hint">{t.hint}</p>}
      <div className="scene-changes-box">
        <EditorContent editor={editor} />
        {mentions.menu}
      </div>
      <div className="scene-changes-verbs" role="group" aria-label={t.verbsAria}>
        {CHANGE_VERBS.map((v) => (
          // Le focus reste dans le texte : la pastille écrit là où était le curseur.
          <button key={v} type="button" className="chip" onPointerDown={(e) => e.preventDefault()} onClick={() => insertVerb(t.verbs[v])}>
            {t.verbs[v]}
          </button>
        ))}
      </div>
    </section>
  );
}
