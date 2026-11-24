// Fenêtre « Lire le synopsis seul » (#147, dialogue `synopsis`) : en-têtes et synopsis du récit à la suite, et
// leur export (PDF, Word, Markdown). Un titre de scène y mène dans le Manuscrit ou le Scénario.

import { useMemo, useState } from "react";
import { exportDocument } from "../export";
import { SCENE_AT, useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { planScenes } from "../projectState";
import { planOrder } from "../plan";
import { novelSynopsis, screenplaySynopsis, synopsisDoc, type SynopsisRow } from "../synopsisView";

type Format = "pdf" | "docx" | "md";

export function SynopsisDialog() {
  const t = useT();
  const s = t.synopsisView;
  const kind = useCosmos((st) => st.kind);
  const screenplay = useCosmos((st) => st.screenplay);
  const nodes = useCosmos((st) => st.nodes);
  const plan = useCosmos((st) => st.plan);
  const title = useCosmos((st) => st.title);
  const author = useSettings((st) => st.author);
  const lang = useSettings((st) => st.lang);
  const [message, setMessage] = useState("");

  const rows = useMemo<SynopsisRow[]>(() => {
    if (kind === "scenario") return screenplay ? screenplaySynopsis(screenplay.elements, { ...t.screenplay.preserved, untitled: t.screenplay.untitledScene }) : [];
    const cards = new Map(nodes.filter((n) => n.data.type === "scene").map((n) => [n.id, { title: n.data.title, synopsis: n.data.fiche?.synopsis ?? "" }]));
    return novelSynopsis(planOrder(plan, planScenes(nodes)), plan, cards, {
      chapter: (n, x) => (x ? fmt(t.chapters.numberedTitle, { n, title: x }) : fmt(t.chapters.numbered, { n })),
      untitled: t.plan.untitled,
    });
  }, [kind, screenplay, nodes, plan, t]);

  const go = (r: SynopsisRow) => {
    const st = useCosmos.getState();
    st.setDialog(null);
    if (r.cardId) st.openInManuscript(r.cardId);
    else if (r.at !== undefined) st.openInManuscript(`${SCENE_AT}${r.at}`);
  };

  const save = async (format: Format) => {
    setMessage(s.working);
    try {
      const doc = synopsisDoc(rows, { title: fmt(s.fileTitle, { title: title || "MondoWrite" }), author, lang, heading: s.title, empty: s.empty });
      const file = await exportDocument(doc, format, { name: doc.title, paper: useCosmos.getState().paper, contents: s.title });
      setMessage((await storage.saveAs(file, s.formats[format])) ? s.done : "");
    } catch (err) {
      console.error(err);
      setMessage(s.failed);
    }
  };

  return (
    <div className="synopsis-view">
      <h2 id="app-dialog-title">{s.title}</h2>
      <p className="sp-detail">{kind === "scenario" ? s.introScript : s.introNovel}</p>
      {rows.length === 0 ? (
        <p className="sp-empty">{s.none}</p>
      ) : (
        <ol className="synopsis-list">
          {rows.map((r, k) => (
            <li key={k} className={`synopsis-row is-${r.kind}`}>
              {r.kind === "scene" ? (
                <>
                  <button type="button" className="link-button synopsis-title" onClick={() => go(r)}>
                    {r.number}. {r.title}
                  </button>
                  <p className={r.synopsis ? "" : "is-empty"}>{r.synopsis || s.empty}</p>
                </>
              ) : (
                <>
                  <h3>{r.title}</h3>
                  {r.synopsis && <p>{r.synopsis}</p>}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="synopsis-actions">
        <span>{s.export}</span>
        {(["pdf", "docx", "md"] as const).map((f) => (
          <button key={f} type="button" className="ghost-button" disabled={rows.length === 0} onClick={() => void save(f)}>
            {s.formats[f]}
          </button>
        ))}
        <span className="sp-detail" role="status">
          {message}
        </span>
      </div>
    </div>
  );
}
