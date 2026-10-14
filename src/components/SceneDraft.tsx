// Le texte d'une scène de roman, là où l'on voit sa carte : un aperçu sur le canevas et dans la Bible (le
// canevas reste léger même avec un long manuscrit), et un éditeur dans la carte agrandie. C'est le même
// texte que dans la vue Manuscrit (manuscrit/<id>.md) : rien n'est recopié.

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { richTextExtensions } from "./editorKit";
import { FormatBar } from "./FormatBar";
import { MentionNode } from "./MentionNode";
import { useCosmos } from "../store";
import { fmt, getT, useT } from "../i18n";
import { useSettings } from "../settings";
import { countWords } from "../manuscript";
import { plainText } from "../search";
import type { CardData } from "../types";

/** Longueur de l'aperçu (caractères) : quelques lignes, le reste est dans la carte agrandie. */
const EXCERPT = 280;

/** Début du texte d'une scène, coupé à un mot. Fonction pure. */
export function draftExcerpt(html: string | undefined, max = EXCERPT): string {
  const text = plainText(html ?? "");
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Texte indicatif d'une scène vide : son synopsis s'il en a un (la note de plan en filigrane). */
export const draftPlaceholder = (card: CardData | undefined): string => card?.fiche?.synopsis?.trim() || getT().manuscript.placeholder;

/** Aperçu : le début du texte et son nombre de mots ; un clic ouvre la carte en grand pour écrire. */
export function DraftPreview({ card, className = "" }: { card: CardData; className?: string }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const html = useCosmos((s) => s.manuscript[card.id]);
  const words = countWords(html);
  const excerpt = draftExcerpt(html);
  const title = card.title.trim() || t.manuscript.untitled;
  return (
    <button
      type="button"
      className={`draft-preview ${className}${excerpt ? "" : " is-empty"}`}
      aria-label={fmt(t.draft.write, { title })}
      onClick={() => useCosmos.getState().expandCard(card.id)}
    >
      {excerpt ? <span className="draft-text">{excerpt}</span> : <span className="draft-text">{t.draft.empty}</span>}
      {words > 0 && (
        <span className="draft-words">
          {fmt(new Intl.PluralRules(lang).select(words) === "one" ? t.manuscript.wordsOne : t.manuscript.wordsMany, { n: new Intl.NumberFormat(lang).format(words) })}
        </span>
      )}
    </button>
  );
}

const attributes = (title: string) => ({ class: "draft-editor", "aria-label": fmt(getT().manuscript.editorAria, { title }) });

/** Éditeur du texte de la scène, dans la carte agrandie. */
export function DraftEditor({ card, autofocus = false }: { card: CardData; autofocus?: boolean }) {
  const lang = useSettings((s) => s.lang);
  const cardRef = useRef(card);
  cardRef.current = card;
  const title = card.title.trim() || getT().manuscript.untitled;
  const editor = useEditor({
    extensions: [
      ...richTextExtensions({ link: false }),
      // Fonction : relue à chaque rendu (langue, synopsis modifié à côté).
      Placeholder.configure({ placeholder: () => draftPlaceholder(cardRef.current) }),
      MentionNode,
    ],
    content: useCosmos.getState().manuscript[card.id] ?? "",
    immediatelyRender: true,
    autofocus: autofocus ? "end" : false,
    editorProps: { attributes: attributes(title) },
    onUpdate: ({ editor: ed }) => useCosmos.getState().setManuscriptText(card.id, ed.getHTML()),
  });

  // Texte changé ailleurs (case cochée depuis « À faire », vue Manuscrit) : l'éditeur suit.
  const stored = useCosmos((s) => s.manuscript[card.id] ?? "");
  useEffect(() => {
    if (!editor || editor.isDestroyed || stored === editor.getHTML() || (stored === "" && editor.isEmpty)) return;
    editor.commands.setContent(stored, { emitUpdate: false });
  }, [stored, editor]);

  // Langue, titre ou synopsis changés : on met à jour ce que TipTap a figé à la création.
  const synopsis = card.fiche?.synopsis;
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes: attributes(title) } });
    editor.view.dispatch(editor.state.tr.setMeta("cosmos:lang", lang));
  }, [lang, title, synopsis, editor]);

  return (
    <div className="draft-body">
      <EditorContent editor={editor} />
      {editor && <FormatBar editor={editor} revisit />}
    </div>
  );
}
