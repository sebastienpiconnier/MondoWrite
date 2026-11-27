// Import d'un scénario (#169) : combien de synopsis en trop sont devenus des notes. État d'affichage du store
// (`notesReport`) : rien n'est enregistré.

import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";

export function NotesImportReport() {
  const t = useT();
  const n = useCosmos((s) => s.notesReport);
  if (n <= 0) return null;
  return (
    <div className="app-alert scriv-report" role="status">
      <div className="scriv-report-body">
        <p>
          <strong>{t.screenplay.notesImportedTitle}</strong> {n === 1 ? t.screenplay.notesImported[0] : fmt(t.screenplay.notesImported[1], { n })}
        </p>
      </div>
      <span className="app-alert-actions">
        <button type="button" className="ghost-button" onClick={() => useCosmos.getState().dismissNotesReport()}>
          {t.interactive.import.dismiss}
        </button>
      </span>
    </div>
  );
}
