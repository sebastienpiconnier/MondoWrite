// Lecture continue du manuscrit : tout le livre défile, dans l'ordre de lecture (pages de début, récit par
// chapitre, pages de fin). Les scènes s'affichent en texte (rapide, même pour un long roman) ; un clic sur
// l'une la rend modifiable sur place, curseur là où l'on a cliqué. Un seul éditeur à la fois.

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import { richTextExtensions } from "./editorKit";
import { FormatBar } from "./FormatBar";
import { useCosmos } from "../store";
import { fmt, getT, useT } from "../i18n";
import { chapterOf, chapterNumbers, type Plan } from "../plan";
import { draftPlaceholder } from "./SceneDraft";
import { isPageKind } from "../book";
import type { CardData } from "../types";

/** Blocs à afficher : un titre de chapitre quand il commence, puis la scène. Fonction pure. */
export function continuousBlocks(order: string[], plan: Plan): { id: string; chapter: { id: string; n: number; title: string } | null; breakBefore: boolean }[] {
  const numbers = chapterNumbers(plan, order);
  let previous: string | null | undefined;
  return order.map((id, i) => {
    const chapter = chapterOf(plan, id);
    const opens = !!chapter && chapter.id !== previous;
    // Entre deux scènes d'un même chapitre (ou hors chapitre) : le séparateur « * * * ».
    const breakBefore = i > 0 && !opens && (chapter?.id ?? null) === (previous ?? null);
    previous = chapter?.id ?? null;
    return { id, chapter: opens && chapter ? { id: chapter.id, n: numbers.get(chapter.id) ?? 0, title: chapter.title } : null, breakBefore };
  });
}

function InlineEditor({ card, at, onDone }: { card: CardData; at: { x: number; y: number } | null; onDone: () => void }) {
  const cardRef = useRef(card);
  cardRef.current = card;
  const editor = useEditor({
    extensions: [...richTextExtensions({ link: false }), Placeholder.configure({ placeholder: () => draftPlaceholder(cardRef.current) })],
    content: useCosmos.getState().manuscript[card.id] ?? "",
    immediatelyRender: true,
    editorProps: { attributes: { class: "ms-continuous-editor", "aria-label": fmt(getT().manuscript.editorAria, { title: card.title.trim() || getT().manuscript.untitled }) } },
    onUpdate: ({ editor: ed }) => useCosmos.getState().setManuscriptText(card.id, ed.getHTML()),
    onBlur: ({ event }) => {
      // La barre de mise en forme garde l'éditeur ouvert ; un clic ailleurs le referme.
      const next = (event as FocusEvent).relatedTarget as HTMLElement | null;
      if (!next?.closest(".format-bar")) onDone();
    },
  });
  // Le curseur va là où l'on a cliqué dans le texte affiché.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const pos = at ? editor.view.posAtCoords({ left: at.x, top: at.y })?.pos : undefined;
    if (pos !== undefined) editor.chain().focus().setTextSelection(pos).run();
    else editor.commands.focus("end");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  return (
    <>
      <EditorContent editor={editor} />
      {editor && <FormatBar editor={editor} revisit />}
    </>
  );
}

export function ContinuousBook({ order, cards, current, onCurrent }: { order: string[]; cards: CardData[]; current: string; onCurrent: (id: string) => void }) {
  const t = useT();
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const [editing, setEditing] = useState<{ id: string; at: { x: number; y: number } | null } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Une scène choisie dans la colonne de gauche : on défile jusqu'à elle (pas quand on vient de cliquer dedans).
  const clicked = useRef<string | null>(null);
  useEffect(() => {
    if (clicked.current === current) {
      clicked.current = null;
      return;
    }
    rootRef.current?.querySelector(`[data-scene-text="${CSS.escape(current)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [current]);

  const open = (id: string, at: { x: number; y: number } | null) => {
    clicked.current = id;
    onCurrent(id);
    setEditing({ id, at });
  };

  return (
    <div className="ms-continuous" ref={rootRef} aria-label={t.continuous.aria}>
      {continuousBlocks(order, plan).map(({ id, chapter, breakBefore }) => {
        const card = cards.find((c) => c.id === id);
        if (!card) return null;
        const html = manuscript[id] ?? "";
        const page = isPageKind(card.page) ? card.page : null;
        return (
          <section key={id} className={`ms-continuous-scene${page ? " is-page" : ""}`} data-scene-text={id}>
            {chapter && (
              <header className="ms-continuous-chapter">
                <span>{fmt(t.chapters.numbered, { n: chapter.n })}</span>
                {chapter.title.trim() && <h2>{chapter.title}</h2>}
              </header>
            )}
            {page && <h2 className="ms-continuous-page">{t.book.kinds[page]}</h2>}
            {breakBefore && !page && (
              <p className="ms-continuous-break" aria-hidden="true">
                *&#8195;*&#8195;*
              </p>
            )}
            {editing?.id === id ? (
              <InlineEditor card={card} at={editing.at} onDone={() => setEditing(null)} />
            ) : (
              <div
                className={`ms-continuous-text${html ? "" : " is-empty"}`}
                role="button"
                tabIndex={0}
                aria-label={fmt(t.draft.write, { title: card.title.trim() || t.manuscript.untitled })}
                onClick={(e) => open(id, { x: e.clientX, y: e.clientY })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(id, null);
                  }
                }}
                // HTML du manuscrit : déjà nettoyé (relu par sanitizeHtml, ou écrit par l'éditeur).
                dangerouslySetInnerHTML={{ __html: html || `<p>${escapeHtml(draftPlaceholder(card))}</p>` }}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
