// Confirmation avant de supprimer un chapitre (croix du livre, croix du Plan). Les scènes sont conservées,
// mais le chapitre, son titre et sa page d'ouverture disparaissent : on demande avant, on peut annuler après.

import { useEffect, useRef } from "react";
import { useCosmos, planScenes } from "../store";
import { chapterNumbers, planOrder } from "../plan";
import { fmt, useT } from "../i18n";

export function ConfirmChapter() {
  const id = useCosmos((s) => s.confirmChapter);
  const plan = useCosmos((s) => s.plan);
  const nodes = useCosmos((s) => s.nodes);
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const chapter = id ? plan.chapters?.find((c) => c.id === id) : undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (chapter && !el.open) el.showModal?.();
    if (!chapter && el.open) el.close();
  }, [chapter]);

  const c = t.chapters;
  const n = chapter ? (chapterNumbers(plan, planOrder(plan, planScenes(nodes))).get(chapter.id) ?? 0) : 0;
  const name = chapter ? (chapter.title.trim() ? fmt(c.numberedTitle, { n, title: chapter.title.trim() }) : fmt(c.numbered, { n })) : "";
  const count = chapter?.scenes.length ?? 0;
  const close = () => useCosmos.getState().clearConfirmChapter();

  return (
    <dialog ref={ref} className="app-dialog is-confirm" aria-labelledby="confirm-chapter-title" onClose={close}>
      {chapter && (
        <>
          <h2 id="confirm-chapter-title">{c.confirmTitle}</h2>
          <p className="confirm-text">{fmt(count === 1 ? c.confirmTextOne : c.confirmText, { name, n: count })}</p>
          <div className="assistant-actions app-dialog-actions">
            <button type="button" autoFocus onClick={close}>
              {c.confirmNo}
            </button>
            <button
              type="button"
              className="is-danger"
              onClick={() => {
                useCosmos.getState().deletePlanChapter(chapter.id);
                close();
              }}
            >
              {c.confirmYes}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
