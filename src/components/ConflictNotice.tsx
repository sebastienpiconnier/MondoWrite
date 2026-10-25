// Projet modifié ici ET ailleurs (autre appareil par iCloud, autre logiciel) : un seul message simple, quel que soit le
// fichier en cause, et un choix qui vaut pour tous les fichiers en conflit d'un coup.

import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { storage } from "../storage";

export function ConflictNotice() {
  const t = useT();
  const conflicts = useCosmos((s) => s.conflicts);
  const resolve = useCosmos((s) => s.resolveConflict);
  if (conflicts.length === 0) return null;

  const c = t.conflict;
  // iCloud est nommé quand le projet est synchronisé par lui ; sinon (Dropbox, un autre logiciel) « ailleurs ».
  const icloud = storage.inIcloud?.() ?? false;
  const keep = async (side: "mine" | "disk") => {
    for (const { path } of [...conflicts]) await resolve(path, side);
  };

  return (
    <div className="app-alert is-conflict" role="alert">
      <span className="conflict-text">
        <span>{fmt(c.message, { where: icloud ? c.whereIcloud : c.whereOther })}</span>
        <span className="conflict-note">{c.note}</span>
      </span>
      <span className="app-alert-actions">
        <button type="button" className="ghost-button" onClick={() => void keep("mine")}>
          {c.keepMine}
        </button>
        <button type="button" className="ghost-button" onClick={() => void keep("disk")}>
          {icloud ? c.keepIcloud : c.keepOther}
        </button>
      </span>
    </div>
  );
}
