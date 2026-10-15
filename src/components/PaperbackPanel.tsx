// Fenêtre « Livre broché (KDP) » du menu Exporter : format, papier, ISBN, pages ajoutées. Le livre est mis
// en page dès l'ouverture et à chaque réglage changé (nombre de pages, largeur du dos), puis on enregistre
// l'intérieur et le gabarit de couverture. Les réglages sont gardés dans le projet (`print`).

import { useEffect, useRef, useState } from "react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { bookOf } from "../export/projectDocs";
import { loadPaperback } from "../export";
import { KDP_MAX_PAGES, KDP_MIN_PAGES, KDP_TRIMS, PAPER_IDS, TRIM_IDS, type PaperId, type TrimId } from "../export/printOptions";
import { fileName, type ExportedFile } from "../screenplay/export";
import type { PreparedPaperback } from "../export/paperbackPdf";

type State = { kind: "busy" } | { kind: "empty" } | { kind: "failed" } | { kind: "ready"; prepared: PreparedPaperback };

const pdfFile = (name: string, data: Uint8Array): ExportedFile => ({ name: `${fileName(name, "mondowrite")}.pdf`, extension: "pdf", mime: "application/pdf", data });

export function PaperbackPanel() {
  const t = useT();
  const k = t.paperback;
  const lang = useSettings((s) => s.lang);
  const print = useCosmos((s) => s.print);
  const setPrint = useCosmos((s) => s.setPrint);
  const ownCopyright = useCosmos((s) => s.nodes.some((n) => n.data.page === "copyright" && !!s.manuscript[n.id]?.replace(/<[^>]+>/g, "").trim()));
  const [state, setState] = useState<State>({ kind: "busy" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const run = useRef(0);

  const title = () => useCosmos.getState().title.trim() || t.home.untitled;
  const book = () => bookOf(useCosmos.getState(), { t, lang, author: useSettings.getState().author }, new Date().getFullYear());

  // Mise en page à l'ouverture et à chaque réglage (un court délai pendant la frappe).
  useEffect(() => {
    const id = ++run.current;
    setState({ kind: "busy" });
    const timer = setTimeout(async () => {
      const doc = book();
      if (!doc.sections.some((s) => s.kind === "chapter" || s.page === "prologue" || s.page === "epilogue")) {
        if (id === run.current) setState({ kind: "empty" });
        return;
      }
      try {
        const prepared = await (await loadPaperback()).preparePaperback(doc, print, k.book);
        if (id === run.current) setState({ kind: "ready", prepared });
      } catch (err) {
        console.error(err);
        if (id === run.current) setState({ kind: "failed" });
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print, lang]);

  const save = async (which: "interior" | "cover") => {
    if (state.kind !== "ready" || saving) return;
    setSaving(true);
    setMessage(t.screenplay.export.working);
    try {
      const { prepared } = state;
      const name = fmt(which === "interior" ? k.interiorName : k.coverName, { title: title() });
      const data =
        which === "interior"
          ? await prepared.save()
          : await (await loadPaperback()).buildCoverTemplate(print.trim, print.paper, prepared.pages, { title: title(), author: useSettings.getState().author.trim() }, k.cover);
      const saved = await storage.saveAs(pdfFile(name, data), which === "interior" ? k.saveInterior : k.saveCover);
      setMessage(saved ? t.screenplay.export.done : "");
    } catch (err) {
      console.error(err);
      setMessage(t.screenplay.export.failed);
    } finally {
      setSaving(false);
    }
  };

  const num = (n: number, digits = 0) => new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(n);
  const status =
    state.kind === "busy"
      ? k.computing
      : state.kind === "empty"
        ? t.exports.emptyManuscript
        : state.kind === "failed"
          ? t.screenplay.export.failed
          : fmt(k.summary, { pages: num(state.prepared.pages), spine: num(state.prepared.spine, 3), mm: num(state.prepared.spine * 25.4, 1) });

  return (
    <form className="paperback-panel replace-panel" onSubmit={(e) => e.preventDefault()}>
      <h2 id="app-dialog-title">{k.title}</h2>
      <p className="paperback-intro">{k.intro}</p>
      <div className="paperback-grid">
        <label className="replace-field">
          <span>{k.trim}</span>
          <select value={print.trim} onChange={(e) => setPrint({ trim: e.target.value as TrimId })}>
            {TRIM_IDS.map((id) => (
              <option key={id} value={id}>
                {`${KDP_TRIMS[id].width} × ${KDP_TRIMS[id].height} in (${KDP_TRIMS[id].mm})`}
              </option>
            ))}
          </select>
        </label>
        <label className="replace-field">
          <span>{k.paper}</span>
          <select value={print.paper} onChange={(e) => setPrint({ paper: e.target.value as PaperId })}>
            {PAPER_IDS.map((id) => (
              <option key={id} value={id}>
                {k.papers[id]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="replace-field">
        <span>{k.isbn}</span>
        <input type="text" inputMode="numeric" autoComplete="off" value={print.isbn} placeholder={k.isbnHint} onChange={(e) => setPrint({ isbn: e.target.value })} />
      </label>
      <div className="replace-options paperback-options">
        <label>
          <input type="checkbox" checked={print.toc} onChange={(e) => setPrint({ toc: e.target.checked })} /> {k.toc}
        </label>
        <label>
          <input type="checkbox" checked={print.dropCap} onChange={(e) => setPrint({ dropCap: e.target.checked })} /> {k.dropCap}
        </label>
        {!ownCopyright && (
          <label>
            <input type="checkbox" checked={print.fiction} onChange={(e) => setPrint({ fiction: e.target.checked })} /> {k.fiction}
          </label>
        )}
        <label>
          <input type="checkbox" checked={print.thanks} onChange={(e) => setPrint({ thanks: e.target.checked })} /> {k.thanks}
        </label>
      </div>
      {ownCopyright && <p className="paperback-note">{k.ownCopyright}</p>}
      <div className="paperback-grid">
        <label className="replace-field">
          <span>{k.website}</span>
          <input type="url" autoComplete="url" value={print.website} onChange={(e) => setPrint({ website: e.target.value })} />
        </label>
        <label className="replace-field">
          <span>{k.newsletter}</span>
          <input type="url" autoComplete="off" value={print.newsletter} onChange={(e) => setPrint({ newsletter: e.target.value })} />
        </label>
      </div>
      <label className="replace-field">
        <span>{k.alsoBy}</span>
        <textarea rows={3} value={print.alsoBy} onChange={(e) => setPrint({ alsoBy: e.target.value })} />
      </label>
      <p className="replace-count" role="status">
        {status}
        {state.kind === "ready" && state.prepared.tooFew && <span className="paperback-warning"> {fmt(k.tooFew, { n: KDP_MIN_PAGES })}</span>}
        {state.kind === "ready" && state.prepared.tooMany && <span className="paperback-warning"> {fmt(k.tooMany, { n: KDP_MAX_PAGES[print.paper] })}</span>}
      </p>
      {message && (
        <p className="replace-count" role="status">
          {message}
        </p>
      )}
      <div className="assistant-actions replace-actions">
        <button type="button" disabled={state.kind !== "ready" || saving} onClick={() => void save("cover")}>
          {k.saveCover}
        </button>
        <button type="button" className="is-primary" disabled={state.kind !== "ready" || saving} onClick={() => void save("interior")}>
          {k.saveInterior}
        </button>
      </div>
    </form>
  );
}
