// Fichier modifié ici ET ailleurs (autre appareil par iCloud, autre logiciel) : le bandeau dit en clair ce qui s'est
// passé, sans nom de fichier, et laisse choisir la version à garder. Un conflit à la fois, le nombre des suivants à côté.

import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { storage } from "../storage";
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
  // iCloud est nommé quand le projet est synchronisé par lui ; sinon (Dropbox, un autre logiciel) « ailleurs ».
  const icloud = storage.inIcloud?.() ?? false;
  const values = {
    where: icloud ? c.whereIcloud : c.whereOther,
    title: subject.kind === "card" || subject.kind === "manuscript" ? titleOf(subject.id) : "",
  };
  // copy : la version de l'app est gardée à côté (changé des deux côtés) ; sinon, supprimé ici et changé ailleurs.
  const changed = Boolean(first.copy);
  const message = fmt((changed ? c.changed : c.deleted)[subject.kind], values);

  return (
    <div className="app-alert is-conflict" role="alert">
      <span className="conflict-text">
        <span>
          {message} {changed && c.question}
          {conflicts.length > 1 && <span className="conflict-more"> {fmt(c.more, { n: conflicts.length - 1 })}</span>}
        </span>
        {changed && <span className="conflict-note">{c.note}</span>}
      </span>
      <span className="app-alert-actions">
        <button type="button" className="ghost-button" onClick={() => void resolve(first.path, "mine")}>
          {changed ? c.keepMine : c.deleteAnyway}
        </button>
        <button type="button" className="ghost-button" onClick={() => void resolve(first.path, "disk")}>
          {changed ? (icloud ? c.keepIcloud : c.keepOther) : c.keepIt}
        </button>
      </span>
    </div>
  );
}
