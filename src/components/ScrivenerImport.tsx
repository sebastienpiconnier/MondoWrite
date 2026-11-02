// Import d'un projet Scrivener (docs/plan-import-scrivener.md) :
// - ScrivenerChoice : la fenêtre qui liste les dossiers de premier niveau avant l'import, une case chacun, tout
//   coché (le Manuscrit est toujours importé, la Corbeille jamais) ;
// - ScrivenerReportNotice : ce que l'import a repris, et sous « Ce qui n'a pas été repris » ce qu'il a laissé.
// États d'affichage du store (`scrivenerChoice`, `scrivenerReport`) : rien n'est enregistré.

import { useEffect, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import type { ScrivenerReport } from "../import/scrivener/mapping";

export function ScrivenerChoice() {
  const t = useT().scrivener;
  const choice = useCosmos((s) => s.scrivenerChoice);
  const ref = useRef<HTMLDialogElement>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  useEffect(() => {
    const d = ref.current;
    if (choice && d && !d.open) {
      setOff(new Set());
      d.showModal();
    }
    if (!choice && d?.open) d.close();
  }, [choice]);
  if (!choice) return null;
  const toggle = (uuid: string, on: boolean) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (on) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  return (
    <dialog ref={ref} className="app-dialog scriv-choice" aria-labelledby="scriv-choice-title" onClose={() => useCosmos.getState().cancelScrivenerImport()}>
      <h2 id="scriv-choice-title">{fmt(t.chooseTitle, { name: choice.source.name })}</h2>
      {choice.folders.length > 0 ? (
        <>
          <p className="scriv-intro">{t.chooseIntro}</p>
          <ul className="scriv-folders">
            {choice.folders.map((f) => (
              <li key={f.uuid}>
                <label>
                  <input type="checkbox" checked={!off.has(f.uuid)} onChange={(e) => toggle(f.uuid, e.target.checked)} />
                  <span className="scriv-folder-title">{f.title}</span>
                  <span className="scriv-folder-count">{f.count === 1 ? t.countOne : fmt(t.count, { n: f.count })}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="scriv-intro">{t.nothingElse}</p>
      )}
      <div className="assistant-actions app-dialog-actions">
        <button type="button" onClick={() => ref.current?.close()}>
          {t.cancel}
        </button>
        <button type="button" className="is-primary" onClick={() => void useCosmos.getState().confirmScrivenerImport([...off])}>
          {t.import}
        </button>
      </div>
    </dialog>
  );
}

type Counted = Exclude<keyof ScrivenerReport, "excluded" | "statuses" | "labels" | "unsupported" | "skippedFolders" | "emptySketches" | "trash">;
const ORDER: Counted[] = ["chapters", "scenes", "characters", "places", "ideas", "documents", "images", "links", "keywords", "comments", "footnotes", "wires"];

export function ScrivenerReportNotice() {
  const t = useT().scrivener;
  const report = useCosmos((s) => s.scrivenerReport);
  if (!report) return null;
  const parts = ORDER.filter((k) => report[k] > 0).map((k) => (report[k] === 1 ? t.parts[k][0] : fmt(t.parts[k][1], { n: report[k] })));
  const list = (items: { label: string; count: number }[]) => items.map((i) => fmt(t.item, { label: i.label, n: i.count })).join(", ");
  const left = [
    report.excluded.length > 0 && fmt(t.leftExcluded, { list: report.excluded.join(", ") }),
    report.statuses.length > 0 && fmt(t.leftStatuses, { list: list(report.statuses) }),
    report.labels.length > 0 && fmt(t.leftLabels, { list: list(report.labels) }),
    report.emptySketches > 0 && fmt(t.leftSketches, { n: report.emptySketches }),
    report.unsupported.length > 0 && fmt(t.leftUnsupported, { list: report.unsupported.join(", ") }),
    report.trash > 0 && fmt(t.leftTrash, { n: report.trash }),
    report.skippedFolders.length > 0 && fmt(t.leftFolders, { list: report.skippedFolders.join(", ") }),
    t.leftAlways,
  ].filter((x): x is string => !!x);
  return (
    <div className="app-alert scriv-report" role="status">
      <div className="scriv-report-body">
        <p>
          <strong>{t.reportTitle}</strong> {parts.join(", ")}.
        </p>
        <details className="scriv-left">
          <summary>{t.left}</summary>
          <ul>
            {left.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </div>
      <span className="app-alert-actions">
        <button type="button" className="ghost-button" onClick={() => useCosmos.getState().dismissScrivenerReport()}>
          {t.dismiss}
        </button>
      </span>
    </div>
  );
}
