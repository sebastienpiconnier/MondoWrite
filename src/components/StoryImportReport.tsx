// Import d'une histoire Twee ou Ink (#96) : ce que l'import a fait de la logique de Twine (macros converties en faits,
// conditions et choix ; gardées en commentaire du bloc de choix ; passages techniques ignorés). État d'affichage du
// store (`storyReport`) : rien n'est enregistré.

import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";

export function StoryImportReport() {
  const t = useT().interactive.import;
  const report = useCosmos((s) => s.storyReport);
  if (!report || report.converted + report.kept + report.skipped === 0) return null;
  const part = (pair: readonly string[], n: number) => (n === 1 ? pair[0] : fmt(pair[1], { n }));
  const parts = [
    part(t.scenes, report.scenes),
    report.converted > 0 && part(t.converted, report.converted),
    report.kept > 0 && part(t.kept, report.kept),
    report.skipped > 0 && part(t.skipped, report.skipped),
  ].filter((x): x is string => !!x);
  return (
    <div className="app-alert scriv-report" role="status">
      <div className="scriv-report-body">
        <p>
          <strong>{t.reportTitle}</strong> {parts.join(", ")}.
        </p>
      </div>
      <span className="app-alert-actions">
        <button type="button" className="ghost-button" onClick={() => useCosmos.getState().dismissStoryReport()}>
          {t.dismiss}
        </button>
      </span>
    </div>
  );
}
