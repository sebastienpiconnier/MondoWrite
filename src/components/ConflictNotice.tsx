// Fichier modifié hors de MondoWrite pendant que l'auteur le modifiait ici : le bandeau dit lequel, où
// sa version a été gardée, et lui laisse choisir. Un conflit à la fois, le nombre des suivants à côté.

import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { conflictSubject } from "../conflicts";

export function ConflictNotice() {
  const t = useT();
  const conflicts = useCosmos((s) => s.conflicts);
  const nodes = useCosmos((s) => s.nodes);
  const trash = useCosmos((s) => s.trash);
  const resolve = useCosmos((s) => s.resolveConflict);
  const first = conflicts[0];
  if (!first) return null;

  const c = t.conflict;
  const subject = conflictSubject(first.path);
  const titleOf = (id: string) => (nodes.find((n) => n.id === id)?.data ?? trash.find((x) => x.id === id))?.title.trim() || t.bible.untitled;
  const what =
    subject.kind === "card"
      ? fmt(c.card, { title: titleOf(subject.id) })
      : subject.kind === "manuscript"
        ? fmt(c.manuscript, { title: titleOf(subject.id) })
        : c[subject.kind];
  const message = first.copy ? fmt(c.changed, { what, file: first.copy }) : fmt(c.deleted, { what });

  return (
    <div className="app-alert is-conflict" role="alert">
      <span>
        {message}
        {conflicts.length > 1 && <span className="conflict-more"> {fmt(c.more, { n: conflicts.length - 1 })}</span>}
      </span>
      <span className="app-alert-actions">
        <button type="button" className="ghost-button" onClick={() => void resolve(first.path, "mine")}>
          {c.keepMine}
        </button>
        <button type="button" className="ghost-button" onClick={() => void resolve(first.path, "disk")}>
          {c.keepDisk}
        </button>
      </span>
    </div>
  );
}
