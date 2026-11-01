// Choix du gabarit (Plan d'un roman, séquencier d'un scénario) : les gabarits livrés, puis « Mes gabarits »
// (gardés sur l'appareil, proposés dans tous les projets), « Créer un gabarit… » et, gabarit de l'auteur en
// place, « Modifier les cases… ». L'éditeur est une fenêtre native (<dialog>) : Échap la ferme, le focus y reste.
// Échange (1.12.0, templateFile.ts) : « Exporter ce gabarit… » (livré ou de l'auteur) et l'export d'un gabarit de la
// bibliothèque écrivent un fichier Markdown ; « Importer un gabarit… » lit Markdown, texte ou JSON et ouvre
// l'éditeur prérempli : rien n'entre dans le projet ni dans la bibliothèque sans « Utiliser dans ce projet ».

import { useEffect, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { newId } from "../projectState";
import { beatText, templateBeats, type CustomTemplate, type PlanTemplate } from "../plan";
import { storage } from "../storage";
import { parseTemplateText, TEMPLATE_IMPORT_EXTENSIONS, templateFileName, templateToMarkdown, type TemplateFile } from "../templateFile";

interface Props {
  /** Gabarit en place ; null : aucun (scénario). */
  value: PlanTemplate | null;
  /** Gabarits livrés proposés, dans l'ordre du menu. */
  options: readonly PlanTemplate[];
  /** Scénario : « Aucun » en tête. */
  allowNone?: boolean;
  /** Cases de l'auteur en place (gabarit « perso »). */
  custom?: CustomTemplate;
  onBuiltin: (template: PlanTemplate | null) => void;
}

interface Row {
  key?: string;
  /** Case du gabarit en place dont elle vient : ses scènes la suivent. */
  from?: string;
  label: string;
  hint: string;
  /** Identifiant de la ligne pour React (une case nouvelle n'a pas encore de clé). */
  id: string;
}

const NEW = "__new";
const EDIT = "__edit";
const MINE = "mine:";
const IMPORT = "__import";
const EXPORT = "__export";
/** Durée d'affichage du message d'import ou d'export. */
const NOTICE_MS = 6000;

export function TemplatePicker({ value, options, allowNone = false, custom, onBuiltin }: Props) {
  const t = useT();
  const p = t.plan;
  const e = p.editor;
  const saved = useSettings((s) => s.templates);
  const [editing, setEditing] = useState<{ name: string; rows: Row[]; keep: boolean; imported?: string } | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (editing && d && !d.open) d.showModal();
  }, [editing]);

  const dict = p.beats as Record<string, { label: string; hint: string }>;
  // Les cases d'un gabarit, à reprendre dans l'éditeur (sans clé : elles en recevront dans le projet).
  const rowsOf = (template: PlanTemplate | null, withKey: boolean): Row[] =>
    template
      ? templateBeats(template, custom).map((key) => {
          const { label, hint } = beatText(key, dict, custom);
          return { ...(withKey ? { key } : { from: key }), label, hint, id: newId() };
        })
      : [];

  const apply = (name: string, rows: { key?: string; from?: string; label: string; hint?: string }[]) => useCosmos.getState().setCustomTemplate(name, rows);

  const exportTemplate = async (tpl: TemplateFile) => {
    try {
      const name = templateFileName(tpl.name, e.namePlaceholder);
      const ok = await storage.saveAs({ name, extension: "md", mime: "text/markdown", data: new TextEncoder().encode(templateToMarkdown(tpl)) }, p.exportLabel);
      if (ok) setNotice({ text: p.exported, error: false });
    } catch {
      setNotice({ text: p.exportFailed, error: true });
    }
  };

  const importTemplate = async () => {
    const file = await storage.pickTextFile(p.fileLabel, TEMPLATE_IMPORT_EXTENSIONS).catch(() => null);
    if (!file) return;
    const tpl = parseTemplateText(file.text, file.name);
    if (!tpl) return setNotice({ text: p.importFailed, error: true });
    setNotice(null);
    setEditing({ name: tpl.name, rows: tpl.beats.map((b) => ({ label: b.label, hint: b.hint ?? "", id: newId() })), keep: true, imported: file.name });
  };

  const onChange = (v: string) => {
    if (v === IMPORT) return void importTemplate();
    if (v === EXPORT) {
      if (!value || value === "libre") return;
      const name = value === "perso" ? custom?.name || p.templates.perso : p.templates[value];
      return void exportTemplate({ name, beats: rowsOf(value, true).map((r) => ({ label: r.label, ...(r.hint ? { hint: r.hint } : {}) })) });
    }
    if (v === NEW) {
      const base = value && value !== "libre" ? rowsOf(value, false) : [];
      setEditing({ name: "", rows: base.length > 0 ? base : [{ label: "", hint: "", id: newId() }], keep: true });
      return;
    }
    if (v === EDIT) {
      setEditing({ name: custom?.name ?? "", rows: rowsOf("perso", true), keep: false });
      return;
    }
    if (v.startsWith(MINE)) {
      const tpl = saved.find((s) => s.id === v.slice(MINE.length));
      if (tpl) apply(tpl.name, tpl.beats);
      return;
    }
    // Les cases de l'auteur gardées dans le projet (roman) : on y revient.
    if (v === "perso") {
      if (value !== "perso") onBuiltin("perso");
      return;
    }
    onBuiltin(v ? (v as PlanTemplate) : null);
  };

  const close = () => {
    dialogRef.current?.close();
    setEditing(null);
  };
  const update = (id: string, patch: Partial<Row>) => setEditing((ed) => (ed ? { ...ed, rows: ed.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : ed));
  const move = (i: number, by: number) =>
    setEditing((ed) => {
      if (!ed) return ed;
      const rows = [...ed.rows];
      const j = i + by;
      if (j < 0 || j >= rows.length) return ed;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...ed, rows };
    });
  const named = editing?.rows.filter((r) => r.label.trim()) ?? [];

  const save = () => {
    if (!editing || named.length === 0) return;
    const name = editing.name.trim() || e.namePlaceholder;
    if (editing.keep) useSettings.getState().saveTemplate({ id: newId(), name, beats: named.map((r) => ({ label: r.label.trim(), ...(r.hint.trim() ? { hint: r.hint.trim() } : {}) })) });
    apply(name, named.map((r) => ({ key: r.key, from: r.from, label: r.label, hint: r.hint })));
    close();
  };

  return (
    <>
      <label className="plan-template">
        {p.template}
        <select value={value === "perso" ? "perso" : (value ?? "")} onChange={(ev) => onChange(ev.target.value)}>
          {allowNone && <option value="">{p.noTemplate}</option>}
          {options.map((key) => (
            <option key={key} value={key}>
              {p.templates[key]}
            </option>
          ))}
          <optgroup label={p.mine}>
            {custom && <option value="perso">{custom.name || p.templates.perso}</option>}
            {saved.filter((s) => !(value === "perso" && custom && s.name === custom.name)).map((s) => (
              <option key={s.id} value={`${MINE}${s.id}`}>
                {s.name || p.templates.perso}
              </option>
            ))}
            <option value={NEW}>{p.newTemplate}</option>
            {value === "perso" && <option value={EDIT}>{p.editTemplate}</option>}
            <option value={IMPORT}>{p.importTemplate}</option>
            {value && value !== "libre" && <option value={EXPORT}>{p.exportTemplate}</option>}
          </optgroup>
        </select>
      </label>
      {notice && (
        <span className={`tpl-notice${notice.error ? " is-error" : ""}`} role="status">
          {notice.text}
        </span>
      )}
      {editing && (
        <dialog ref={dialogRef} className="app-dialog tpl-editor" aria-labelledby="tpl-editor-title" onClose={() => setEditing(null)}>
          <h2 id="tpl-editor-title">{e.title}</h2>
          <p className="tpl-intro">{e.intro}</p>
          {editing.imported && (
            <p className="tpl-imported" role="status">
              {fmt(e.imported, { file: editing.imported })}
            </p>
          )}
          <label className="tpl-name">
            <span>{e.name}</span>
            <input type="text" value={editing.name} placeholder={e.namePlaceholder} autoFocus onChange={(ev) => setEditing({ ...editing, name: ev.target.value })} />
          </label>
          <h3 className="tpl-beats-title">{e.beats}</h3>
          <ol className="tpl-rows">
            {editing.rows.map((r, i) => (
              <li key={r.id} className="tpl-row">
                <span className="tpl-num" aria-hidden="true">
                  {i + 1}
                </span>
                <input type="text" value={r.label} placeholder={e.labelPlaceholder} aria-label={fmt(e.label, { n: i + 1 })} onChange={(ev) => update(r.id, { label: ev.target.value })} />
                <input type="text" className="tpl-hint" value={r.hint} placeholder={e.hintPlaceholder} aria-label={fmt(e.hint, { n: i + 1 })} onChange={(ev) => update(r.id, { hint: ev.target.value })} />
                <span className="tpl-row-actions">
                  <button type="button" className="icon-button" disabled={i === 0} aria-label={fmt(e.up, { label: r.label || i + 1 })} onClick={() => move(i, -1)}>
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button type="button" className="icon-button" disabled={i === editing.rows.length - 1} aria-label={fmt(e.down, { label: r.label || i + 1 })} onClick={() => move(i, 1)}>
                    <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={fmt(e.remove, { label: r.label || i + 1 })}
                    onClick={() => setEditing({ ...editing, rows: editing.rows.filter((x) => x.id !== r.id) })}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" className="ghost-button tpl-add" onClick={() => setEditing({ ...editing, rows: [...editing.rows, { label: "", hint: "", id: newId() }] })}>
            + {e.add}
          </button>
          <label className="tpl-keep">
            <input type="checkbox" checked={editing.keep} onChange={(ev) => setEditing({ ...editing, keep: ev.target.checked })} />
            {e.keep}
          </label>
          {saved.length > 0 && (
            <details className="tpl-library">
              <summary>
                {e.library} · {saved.length}
              </summary>
              <ul>
                {saved.map((s) => (
                  <li key={s.id}>
                    <span>
                      {s.name || p.templates.perso} <span className="tpl-count">· {fmt(e.count, { n: s.beats.length })}</span>
                    </span>
                    <button
                      type="button"
                      className="ghost-button tpl-export"
                      aria-label={fmt(e.exportAria, { name: s.name || p.templates.perso })}
                      onClick={() => void exportTemplate({ name: s.name || p.templates.perso, beats: s.beats })}
                    >
                      {e.export}
                    </button>
                    <button type="button" className="icon-button" aria-label={fmt(e.forget, { name: s.name || p.templates.perso })} title={fmt(e.forget, { name: s.name || p.templates.perso })} onClick={() => useSettings.getState().forgetTemplate(s.id)}>
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="tpl-file-hint">{e.fileHint}</p>
          {named.length === 0 && <p className="tpl-empty" role="status">{e.empty}</p>}
          <div className="assistant-actions app-dialog-actions tpl-actions">
            <button type="button" onClick={close}>
              {e.cancel}
            </button>
            <button type="button" className="is-primary" disabled={named.length === 0} onClick={save}>
              {e.use}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
