// Fenêtre « Exporter le scénario en PDF » (menu Exporter) : tout le scénario ou le texte d'un personnage
// (ses scènes, ses répliques surlignées), ce qu'on imprime en plus du format standard (page de titre,
// synopsis, sections, notes), un en-tête et un filigrane. Les choix sont gardés dans le projet (`scriptPdf`).
// L'aperçu dessine la première page avec la même composition que le PDF (typeset.ts, pur et léger) ; le PDF
// lui-même et ses polices ne sont chargés qu'à l'enregistrement.

import { useMemo, useState, type CSSProperties } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { LAYOUTS } from "../screenplay/layout";
import { exportScreenplay } from "../screenplay/export";
import { typeset, type TypesetLine } from "../screenplay/export/typeset";
import { fillHeader, type ScriptPrint } from "../screenplay/export/scriptPrint";
import { speakingNames } from "../review/filter";

const titleField = (titlePage: Record<string, string>, ...names: string[]) =>
  Object.entries(titlePage).find(([key]) => names.includes(key.trim().toLowerCase()))?.[1]?.replace(/\s+/g, " ").trim() ?? "";

export function ScriptPdfPanel() {
  const t = useT();
  const k = t.scriptPdf;
  const lang = useSettings((s) => s.lang);
  const author = useSettings((s) => s.author);
  const screenplay = useCosmos((s) => s.screenplay);
  const projectTitle = useCosmos((s) => s.title);
  const paper = useCosmos((s) => s.paper);
  const sceneNumbers = useCosmos((s) => s.sceneNumbers);
  const underlineHeadings = useCosmos((s) => s.underlineHeadings);
  const options = useCosmos((s) => s.scriptPdf);
  const setOptions = useCosmos((s) => s.setScriptPdf);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const layout = LAYOUTS[paper];
  const elements = screenplay?.elements ?? [];
  const titlePage = screenplay?.titlePage ?? {};

  const speakers = useMemo(() => speakingNames(elements, lang), [elements, lang]);
  const names = options.character && !speakers.includes(options.character) ? [...speakers, options.character] : speakers;
  const title = titleField(titlePage, "title") || projectTitle.trim() || t.home.untitled;
  const header = fillHeader(options.header, {
    date: new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date()),
    title,
    author: author.trim() || titleField(titlePage, "author", "authors"),
  });
  const strings = { more: t.screenplay.more, contd: t.screenplay.contd };
  const first = useMemo(
    () =>
      typeset(elements, layout, lang, strings, {
        numberScenes: sceneNumbers,
        underlineHeadings,
        synopsis: options.synopsis,
        sections: options.sections,
        notes: options.notes,
        character: options.character,
        breaks: options.breaks,
        resumes: options.resumes,
      })[0] ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elements, layout, lang, sceneNumbers, underlineHeadings, options.synopsis, options.sections, options.notes, options.character, options.breaks, options.resumes],
  );

  const set = (patch: Partial<ScriptPrint>) => {
    setMessage("");
    setOptions(patch);
  };

  const save = async () => {
    if (!screenplay || saving) return;
    setSaving(true);
    setMessage(t.screenplay.export.working);
    try {
      const file = await exportScreenplay(screenplay, "pdf", {
        title: options.character ? fmt(k.nameCharacter, { title, character: options.character }) : projectTitle,
        paper,
        locale: lang,
        strings,
        numberScenes: sceneNumbers,
        underlineHeadings,
        print: { ...options, header },
      });
      const saved = await storage.saveAs(file, "PDF");
      setMessage(saved ? t.screenplay.export.done : "");
    } catch (err) {
      console.error(err);
      setMessage(t.screenplay.export.failed);
    } finally {
      setSaving(false);
    }
  };

  const checks: [keyof ScriptPrint & ("titlePage" | "synopsis" | "sections" | "notes"), string][] = [
    ["titlePage", k.titlePage],
    ["synopsis", k.synopsis],
    ["sections", k.sections],
    ["notes", k.notes],
  ];

  return (
    <div className="spdf">
      <form
        className="spdf-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="app-dialog-title">{k.title}</h2>
        <fieldset>
          <legend>{k.content}</legend>
          <label className="spdf-choice">
            <input type="radio" name="spdf-content" checked={!options.character} onChange={() => set({ character: "" })} />
            {k.all}
          </label>
          <label className="spdf-choice">
            <input type="radio" name="spdf-content" checked={!!options.character} disabled={names.length === 0} onChange={() => set({ character: names[0] ?? "" })} />
            {k.character}
          </label>
          {options.character && (
            <div className="spdf-indent">
              <select aria-label={k.characterAria} value={options.character} onChange={(e) => set({ character: e.target.value })}>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="spdf-hint">{k.characterHint}</p>
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>{k.alsoPrint}</legend>
          {checks.map(([key, label]) => (
            <label key={key} className="spdf-choice">
              <input type="checkbox" checked={options[key]} onChange={(e) => set({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
          <p className="spdf-hint">{k.standardHint}</p>
        </fieldset>
        {/* (À SUIVRE) et (SUITE) : aussi sur la feuille à l'écran, même réglage. */}
        <fieldset>
          <legend>{k.continued}</legend>
          <label className="spdf-choice">
            <input type="checkbox" checked={options.breaks} onChange={(e) => set({ breaks: e.target.checked })} />
            {k.breaks}
          </label>
          <label className="spdf-choice">
            <input type="checkbox" checked={options.resumes} onChange={(e) => set({ resumes: e.target.checked })} />
            {k.resumes}
          </label>
          <p className="spdf-hint">{k.continuedHint}</p>
        </fieldset>
        <fieldset>
          <legend>{k.onEachPage}</legend>
          <label className="spdf-field">
            {k.header}
            <input type="text" value={options.header} placeholder={k.headerPlaceholder} maxLength={120} onChange={(e) => set({ header: e.target.value })} />
          </label>
          <label className="spdf-field">
            {k.watermark}
            <input type="text" value={options.watermark} placeholder={k.watermarkPlaceholder} maxLength={60} onChange={(e) => set({ watermark: e.target.value })} />
          </label>
          <p className="spdf-hint">{k.placeholdersHint}</p>
        </fieldset>
        <div className="spdf-actions">
          <p className="spdf-hint">{k.kept}</p>
          <p className="spdf-status" role="status">
            {message}
          </p>
          <div className="spdf-buttons">
            <button type="button" className="spdf-close" onClick={() => useCosmos.getState().setDialog(null)}>
              {t.gallery.close}
            </button>
            <button type="submit" className="is-primary" disabled={!screenplay || saving}>
              {k.save}
            </button>
          </div>
        </div>
      </form>
      <section className="spdf-preview" aria-label={k.preview}>
        {first ? <PagePreview lines={first.lines} layout={layout} header={header} watermark={options.watermark.trim()} /> : <p className="muted">{k.previewEmpty}</p>}
      </section>
    </div>
  );
}

/** Une page dessinée en `em` comme le PDF : 1em = une ligne de 12 points, 0,6em = un caractère de Courier. */
function PagePreview({ lines, layout, header, watermark }: { lines: TypesetLine[]; layout: (typeof LAYOUTS)["a4"]; header: string; watermark: string }) {
  const w = layout.width * 6;
  const h = layout.height * 6;
  const left = layout.margin.left * 6;
  const top = layout.margin.top * 6;
  const angle = (Math.atan2(h, w) * 180) / Math.PI;
  const room = Math.floor((layout.width - layout.margin.left - layout.margin.right) * 10) - 2;
  return (
    <div className="spdf-page" style={{ "--w": w, "--h": h } as CSSProperties} aria-hidden="true">
      {watermark && (
        <span className="spdf-watermark" style={{ transform: `translate(-50%, -50%) rotate(-${angle}deg)`, fontSize: `${Math.max(2, Math.min(8, (Math.hypot(w, h) * 0.7) / (watermark.length * 0.6)))}em` }}>
          {watermark}
        </span>
      )}
      {header && (
        <span className="spdf-line" style={{ left: `${left}em`, top: "3em" }}>
          {header.length > room ? `${header.slice(0, room - 1)}…` : header}
        </span>
      )}
      {lines.map((line, i) => (
        <span
          key={i}
          className={`spdf-line${line.bold ? " is-bold" : ""}${line.gray ? " is-gray" : ""}${line.highlight ? " is-lit" : ""}${line.underline ? " is-underline" : ""}`}
          style={{ left: `${left + line.column * 0.6}em`, top: `${top + line.row}em` }}
        >
          {line.text}
        </span>
      ))}
    </div>
  );
}
