// Fenêtre d'une note de bas de page (1.13.0) : posée sous l'appel choisi dans le texte (clic, toucher, ou flèches
// jusqu'à lui), elle montre et modifie son texte. Entrée ou Échap rendent la main au texte, juste après l'appel ;
// une note laissée vide disparaît. Le champ ne prend le focus que si on vient de poser la note ou de cliquer
// dessus : passer sur l'appel aux flèches ne vole pas le clavier.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditorState, type Editor } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { fmt, useT } from "../i18n";
import { FOOTNOTE_MAX } from "../footnotes";

/** Rang (à partir de 1) de l'appel en `pos` parmi les appels du document. */
function rankOf(editor: Editor, pos: number): number {
  let n = 0;
  let rank = 0;
  editor.state.doc.descendants((node, at) => {
    if (node.type.name !== "footnote") return;
    n++;
    if (at === pos) rank = n;
  });
  return rank;
}

export function FootnotePopover({ editor }: { editor: Editor }) {
  const t = useT().footnotes;
  const chosen = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const sel = e.state.selection;
      return sel instanceof NodeSelection && sel.node.type.name === "footnote" ? { pos: sel.from, text: String(sel.node.attrs.text ?? "") } : null;
    },
    equalityFn: (a, b) => a?.pos === b?.pos && a?.text === b?.text,
  });
  const field = useRef<HTMLTextAreaElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  // Un clic sur un appel : le champ prendra le focus (le clic sélectionne l'appel juste après).
  useEffect(() => {
    const dom = editor.view.dom;
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(".footnote-ref")) editor.storage.footnote.focusNext = true;
    };
    dom.addEventListener("mousedown", onDown);
    return () => dom.removeEventListener("mousedown", onDown);
  }, [editor]);

  useLayoutEffect(() => {
    if (!chosen) {
      setPlace(null);
      return;
    }
    // Sous l'appel, dans la fenêtre ; suivi quand la page défile ou que la fenêtre change de taille.
    const measure = () => {
      if (editor.isDestroyed) return;
      const el = editor.view.nodeDOM(chosen.pos);
      if (!(el instanceof HTMLElement)) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - 16);
      setPlace({ left: Math.max(8, Math.min(r.left - 20, window.innerWidth - width - 8)), top: Math.min(r.bottom + 8, window.innerHeight - 180) });
    };
    measure();
    if (editor.storage.footnote.focusNext) {
      editor.storage.footnote.focusNext = false;
      requestAnimationFrame(() => field.current?.focus());
    }
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [chosen?.pos, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!chosen || !place) return null;
  const pos = chosen.pos;

  const setText = (text: string) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "footnote") return;
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, text: text.replace(/\n/g, " ").slice(0, FOOTNOTE_MAX) });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    editor.view.dispatch(tr);
  };
  /** Rend la main au texte juste après l'appel ; une note vide est retirée. */
  const done = (focus = true) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "footnote") return;
    const tr = editor.state.tr;
    if (!String(node.attrs.text ?? "").trim()) {
      tr.delete(pos, pos + node.nodeSize);
      tr.setSelection(TextSelection.create(tr.doc, pos));
    } else tr.setSelection(TextSelection.create(tr.doc, pos + node.nodeSize));
    editor.view.dispatch(tr);
    if (focus) editor.view.focus();
  };
  const remove = () => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "footnote") return;
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize);
    tr.setSelection(TextSelection.create(tr.doc, pos));
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const rank = rankOf(editor, pos);
  return createPortal(
    <div className="footnote-pop nodrag nopan" role="dialog" aria-label={fmt(t.title, { n: rank })} style={{ left: place.left, top: place.top }} onPointerDown={(e) => e.stopPropagation()}>
      <label className="footnote-pop-label" htmlFor="footnote-pop-field">
        {fmt(t.title, { n: rank })}
      </label>
      <textarea
        id="footnote-pop-field"
        ref={field}
        rows={3}
        value={chosen.text}
        maxLength={FOOTNOTE_MAX}
        placeholder={t.placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          // Le focus part ailleurs que dans la fenêtre (ni le bouton Supprimer) : une note vide disparaît.
          if (!(e.relatedTarget instanceof Element && e.relatedTarget.closest(".footnote-pop"))) {
            const node = editor.state.doc.nodeAt(pos);
            if (node?.type.name === "footnote" && !String(node.attrs.text ?? "").trim()) done(false);
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done();
          }
        }}
      />
      <div className="footnote-pop-foot">
        <span className="footnote-pop-hint">{t.hint}</span>
        <button type="button" className="ghost-button is-danger" onClick={remove}>
          {t.remove}
        </button>
      </div>
    </div>,
    document.body,
  );
}
