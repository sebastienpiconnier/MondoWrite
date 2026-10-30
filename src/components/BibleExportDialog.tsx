// Fenêtre « Exporter la Bible » (menu Exporter, Bible v2) : trois questions, pour qui, quelles parties, quel
// rendu, et un aperçu. L'aperçu est le vrai PDF (biblePdf.ts) affiché par pdf.js : ce qu'on voit est ce qu'on
// enregistre. Il se refait un instant après le dernier changement. Les réglages sont gardés dans le projet
// (`bibleExport` de cosmos.json), avec des réglages nommés. Word et Markdown gardent les parties choisies et
// leur ordre, pas le rendu.

import { formOf } from "../pitch";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { BIBLE_PARTS, bibleOrder, isPrivatePart, partNumber, type PartKey } from "../bibleParts";
import {
  ACCENT_COUNT,
  BIBLE_THEMES,
  bibleFileName,
  deletePreset,
  movePart,
  savePreset,
  togglePart,
  exportStateFor,
  withAudience,
  type BibleAudience,
  type BibleExportOptions,
} from "../bibleExport";
import { buildBiblePack, typesForParts, type PackSource } from "../export/biblePack";
import { swatch } from "../export/bibleThemes";
import { isMediaName } from "../media";
import { fileName } from "../screenplay/export";
import { DEFAULT_SCRIPT_PRINT } from "../screenplay/export/scriptPrint";
import { exportDocument } from "../export";
import { bibleOf } from "../export/projectDocs";
import type { DocImage } from "../export/doc";

const FORMATS = ["pdf", "docx", "md"] as const;
type Format = (typeof FORMATS)[number];
const PREVIEW_DELAY = 350;
const PREVIEW_WIDTH = 300;

export function BibleExportDialog() {
  const t = useT();
  const e = t.bibleExport;
  const lang = useSettings((s) => s.lang);
  const author = useSettings((s) => s.author).trim();
  const sections = useSettings((s) => s.bibleSections);
  const stored = useCosmos((s) => s.bibleExport);
  const setState = useCosmos((s) => s.setBibleExport);
  const kind = useCosmos((s) => s.kind);
  // Tant que rien n'a été changé : les réglages de départ de ce type de projet (Nuit et pilote pour un producteur).
  const state = useMemo(() => exportStateFor(stored, kind), [stored, kind]);
  const title = useCosmos((s) => s.title);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const pitch = useCosmos((s) => s.pitch);
  const screenplay = useCosmos((s) => s.screenplay);
  const goals = useCosmos((s) => s.goals);
  const paper = useCosmos((s) => s.paper);
  const options = state.current;
  const [format, setFormat] = useState<Format>("pdf");
  const [presetName, setPresetName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ status: "working" | "ready" | "failed" | "empty"; pages: number }>({ status: "working", pages: 0 });
  const pdfRef = useRef<Uint8Array | null>(null);
  const images = useRef(new Map<string, DocImage | null>());
  // PDF de l'annexe (scénario pour le pilote, manuscrit pour l'extrait d'un roman), refait seulement quand
  // ce qu'il imprime ou le format de page change.
  const annexRef = useRef<{ key: unknown[]; paper: string; bytes: Uint8Array } | null>(null);
  const canvases = useRef<HTMLDivElement>(null);

  const source: PackSource = useMemo(
    () => ({ title: title.trim() || t.home.untitled, kind, nodes, edges, plan, manuscript, pitch, screenplay, goals, paper }),
    [title, t, kind, nodes, edges, plan, manuscript, pitch, screenplay, goals, paper],
  );
  const profile = useSettings((s) => s.profile);
  const ctx = useMemo(() => ({ t, lang, author, date: new Date(), profile }), [t, lang, author, profile]);
  const pack = useMemo(() => buildBiblePack(source, options, ctx), [source, options, ctx]);
  // Parties qui ont du contenu pour ce lecteur (une partie vide n'est pas imprimée).
  const filled = useMemo(() => new Set(buildBiblePack(source, { ...options, parts: [...BIBLE_PARTS] }, ctx).sections.map((s) => s.part)), [source, options, ctx]);
  const mediaImages = useMemo(() => [...new Set(nodes.flatMap((n) => [n.data.image, ...(n.data.images ?? [])]).filter((n): n is string => !!n && isMediaName(n)))], [nodes]);

  const set = (next: BibleExportOptions) => {
    setMessage("");
    setState({ ...state, current: next });
  };
  const preset = state.presets.find((p) => JSON.stringify(p.options) === JSON.stringify(options));

  // Aperçu : le PDF refait un instant après le dernier changement, ses pages dessinées par pdf.js.
  useEffect(() => {
    if (format !== "pdf") return;
    let stale = false;
    setPreview((p) => ({ ...p, status: "working" }));
    const timer = window.setTimeout(async () => {
      if (pack.sections.length === 0) {
        pdfRef.current = null;
        setPreview({ status: "empty", pages: 0 });
        return;
      }
      try {
        const [{ bibleToPdf, packImageNames }, { loadImages }, { openPdf, renderPage }] = await Promise.all([import("../export/biblePdf"), import("../export/images"), import("../pdfDocument")]);
        const missing = packImageNames(pack).filter((n) => !images.current.has(n));
        if (missing.length > 0) {
          const loaded = await loadImages(missing, (name) => storage.mediaUrl(name));
          for (const n of missing) images.current.set(n, loaded[n] ?? null);
        }
        const available = Object.fromEntries([...images.current].filter((e): e is [string, DocImage] => !!e[1]));
        let annex: Uint8Array | null = null;
        const { profile } = useSettings.getState();
        const annexKey = kind === "scenario" ? [screenplay] : [manuscript, nodes, plan, author, profile];
        const fresh = (r: typeof annexRef.current): r is NonNullable<typeof r> => !!r && r.paper === paper && r.key.length === annexKey.length && r.key.every((k, i) => k === annexKey[i]);
        if (pack.annexPages > 0 && kind === "roman") {
          if (!fresh(annexRef.current)) {
            const { manuscriptOf, withShunn } = await import("../export/projectDocs");
            const { contactLines, authorName } = await import("../profile");
            const doc = withShunn(manuscriptOf(useCosmos.getState(), { t, lang, author }, contactLines(profile)), manuscript, t, lang, authorName(profile));
            const file = await exportDocument(doc, "pdf", { name: doc.title, paper, contents: t.exports.contents });
            annexRef.current = { key: annexKey, paper, bytes: file.data };
          }
          annex = annexRef.current!.bytes;
        } else if (pack.annexPages > 0 && screenplay) {
          if (!fresh(annexRef.current)) {
            const { exportScreenplay } = await import("../screenplay/export");
            const file = await exportScreenplay(screenplay, "pdf", {
              title: source.title,
              paper,
              locale: lang,
              strings: { more: t.screenplay.more, contd: t.screenplay.contd },
              numberScenes: useCosmos.getState().sceneNumbers,
              underlineHeadings: useCosmos.getState().underlineHeadings,
              print: { ...DEFAULT_SCRIPT_PRINT, titlePage: false },
            });
            annexRef.current = { key: annexKey, paper, bytes: file.data };
          }
          annex = annexRef.current!.bytes;
        }
        const { bytes, pages } = await bibleToPdf({ pack, options, paper, lang, images: available, annex });
        if (stale) return;
        pdfRef.current = bytes;
        const doc = await openPdf(bytes);
        const holder = canvases.current;
        if (stale || !holder) return;
        holder.replaceChildren();
        for (let n = 1; n <= pages; n++) {
          const canvas = document.createElement("canvas");
          canvas.className = "bexp-page";
          holder.append(canvas);
          await renderPage(doc, n, canvas, PREVIEW_WIDTH);
          if (stale) break;
        }
        void doc.loadingTask.destroy();
        if (!stale) setPreview({ status: "ready", pages });
      } catch (err) {
        console.error(err);
        if (!stale) setPreview({ status: "failed", pages: 0 });
      }
    }, PREVIEW_DELAY);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [pack, options, paper, lang, format, screenplay, source.title, t, kind, manuscript, nodes, plan, author]);

  const exportFile = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(e.working);
    try {
      const name = bibleFileName(pack.kind, source.title, new Date());
      let file;
      if (format === "pdf") {
        if (!pdfRef.current) {
          setMessage(e.previewEmpty);
          return;
        }
        file = { name: `${fileName(name, "bible")}.pdf`, extension: "pdf", mime: "application/pdf", data: pdfRef.current };
      } else {
        const doc = bibleOf(useCosmos.getState(), { t, lang, author }, typesForParts(bibleOrder(sections), options.parts), options.audience !== "moi");
        const full = format === "md" ? doc : await (await import("../export/images")).withImages(doc, (n) => storage.mediaUrl(n));
        file = await exportDocument(full, format, { name, paper, contents: t.exports.contents });
      }
      const saved = await storage.saveAs(file, e[format]);
      setMessage(saved ? e.done : "");
    } catch (err) {
      console.error(err);
      setMessage(e.failed);
    } finally {
      setBusy(false);
    }
  };

  // Un film (pastille Format) n'a pas de pilote : « les premières pages du scénario ».
  const film = formOf(kind, pitch) === "film";
  const reader: Record<BibleAudience, [string, string]> = {
    moi: [e.me, e.meHint],
    tiers: kind === "scenario" ? [e.producer, film ? e.producerHintFilm : e.producerHint] : [e.publisher, e.publisherHint],
  };
  const ordered: PartKey[] = [...options.parts, ...BIBLE_PARTS.filter((p) => !options.parts.includes(p))];
  const publicChecked: PartKey[] = options.parts.filter((p) => !isPrivatePart(p));

  return (
    <div className="spdf bexp">
      <form
        className="spdf-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          void exportFile();
        }}
      >
        <h2 id="app-dialog-title">{e.title}</h2>
        <fieldset>
          <legend>{e.forWhom}</legend>
          {(["moi", "tiers"] as const).map((a) => (
            <label key={a} className="spdf-choice bexp-reader">
              <input type="radio" name="bexp-reader" checked={options.audience === a} onChange={() => set(withAudience(options, a, kind))} />
              <span>
                {reader[a][0]}
                <small>{reader[a][1]}</small>
              </span>
            </label>
          ))}
          {options.audience === "tiers" && (
            <label className="spdf-field bexp-recipient">
              {e.recipient}
              <input type="text" value={options.recipient} maxLength={300} placeholder={kind === "scenario" ? e.recipientPlaceholderSeries : e.recipientPlaceholderNovel} onChange={(ev) => set({ ...options, recipient: ev.target.value })} />
              <small className="spdf-hint">{e.recipientHint}</small>
            </label>
          )}
        </fieldset>
        <fieldset>
          <legend>{e.parts}</legend>
          <ul className="bexp-parts">
            {ordered.map((p) => {
              const on = options.parts.includes(p);
              const label = fmt(t.bible.partTitle, { n: partNumber(p), part: t.bible.parts[p] });
              const i = isPrivatePart(p) ? -1 : publicChecked.indexOf(p);
              return (
                <li key={p} className={on ? "is-on" : ""}>
                  <label className="spdf-choice">
                    <input type="checkbox" checked={on} onChange={() => set(togglePart(options, p))} />
                    {label}
                    {!filled.has(p) && <span className="bexp-empty">{e.partEmpty}</span>}
                  </label>
                  {on && !isPrivatePart(p) && (
                    <span className="bexp-move">
                      <button type="button" aria-label={fmt(e.moveUp, { part: t.bible.parts[p] })} disabled={i === 0} onClick={() => set(movePart(options, p, "up"))}>
                        ↑
                      </button>
                      <button type="button" aria-label={fmt(e.moveDown, { part: t.bible.parts[p] })} disabled={i === publicChecked.length - 1} onClick={() => set(movePart(options, p, "down"))}>
                        ↓
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="spdf-hint">{options.parts.includes("pourVous") ? t.bible.privateHint : e.partsHint}</p>
        </fieldset>
        <fieldset>
          <legend>{e.render}</legend>
          <div className="bexp-themes" role="radiogroup" aria-label={e.render}>
            {BIBLE_THEMES.map((th) => (
              <button key={th} type="button" role="radio" aria-checked={options.theme === th} className={`bexp-theme is-${th}`} onClick={() => set({ ...options, theme: th, accent: 0 })}>
                {e.themes[th]}
              </button>
            ))}
          </div>
          <div className="bexp-accents" role="radiogroup" aria-label={e.accent}>
            {Array.from({ length: ACCENT_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={options.accent === i}
                aria-label={fmt(e.accentAria, { n: i + 1 })}
                className="bexp-accent"
                style={{ background: swatch(options.theme, i) }}
                onClick={() => set({ ...options, accent: i })}
              />
            ))}
          </div>
          <label className="spdf-field">
            {e.cover}
            <select value={options.cover} onChange={(ev) => set({ ...options, cover: ev.target.value })}>
              <option value="">{e.coverNone}</option>
              {[...new Set([options.cover, ...mediaImages])].filter(Boolean).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          {kind === "scenario" && screenplay && (
            <label className="spdf-choice bexp-reader">
              <input type="checkbox" checked={options.pilot} onChange={(ev) => set({ ...options, pilot: ev.target.checked })} />
              <span>
                {film ? e.pilotFilm : e.pilot}
                <small>{e.pilotHint}</small>
              </span>
            </label>
          )}
          {kind === "roman" && options.audience === "tiers" && (
            <label className="spdf-choice bexp-reader">
              <input type="checkbox" checked={options.extract} onChange={(ev) => set({ ...options, extract: ev.target.checked })} />
              <span>
                {e.extract}
                <small>{e.extractHint}</small>
              </span>
            </label>
          )}
          {kind === "scenario" && options.parts.includes("structure") && (
            <label className="spdf-choice bexp-reader">
              <input type="checkbox" checked={options.grid} onChange={(ev) => set({ ...options, grid: ev.target.checked })} />
              <span>
                {e.gridOption}
                <small>{film ? e.gridHintFilm : e.gridHint}</small>
              </span>
            </label>
          )}
          {kind === "scenario" && options.parts.includes("personnages") && (
            <label className="spdf-choice bexp-reader">
              <input type="checkbox" checked={options.memo} onChange={(ev) => set({ ...options, memo: ev.target.checked })} />
              <span>
                {e.memoOption}
                <small>{e.memoHint}</small>
              </span>
            </label>
          )}
          {options.parts.includes("univers") && (
            <label className="spdf-choice">
              <input type="checkbox" checked={options.places} onChange={(ev) => set({ ...options, places: ev.target.checked })} />
              {e.places}
            </label>
          )}
        </fieldset>
        <fieldset>
          <legend>{e.preset}</legend>
          <div className="bexp-row">
            <select
              aria-label={e.preset}
              value={preset?.name ?? ""}
              onChange={(ev) => {
                const p = state.presets.find((x) => x.name === ev.target.value);
                if (p) set(p.options);
              }}
            >
              <option value="">{e.presetCurrent}</option>
              {state.presets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            {preset && (
              <button type="button" className="bexp-ghost" aria-label={fmt(e.presetDelete, { name: preset.name })} onClick={() => setState(deletePreset(state, preset.name))}>
                ×
              </button>
            )}
          </div>
          <div className="bexp-row">
            <input type="text" aria-label={e.presetName} placeholder={e.presetName} value={presetName} maxLength={60} onChange={(ev) => setPresetName(ev.target.value)} />
            <button
              type="button"
              className="bexp-ghost"
              disabled={!presetName.trim()}
              onClick={() => {
                setState(savePreset(state, presetName));
                setPresetName("");
              }}
            >
              {e.presetSave}
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>{e.format}</legend>
          <div className="bexp-row">
            {FORMATS.map((f) => (
              <label key={f} className="spdf-choice">
                <input type="radio" name="bexp-format" checked={format === f} onChange={() => setFormat(f)} />
                {e[f]}
              </label>
            ))}
          </div>
          {format !== "pdf" && <p className="spdf-hint">{e.formatHint}</p>}
        </fieldset>
        <div className="spdf-actions">
          <p className="spdf-status" role="status">
            {message}
          </p>
          <div className="spdf-buttons">
            <button type="button" className="spdf-close" onClick={() => useCosmos.getState().setDialog(null)}>
              {t.gallery.close}
            </button>
            <button type="submit" className="is-primary" disabled={busy || (format === "pdf" && preview.status !== "ready")}>
              {e.export}
            </button>
          </div>
        </div>
      </form>
      <section className="spdf-preview bexp-preview" aria-label={e.preview}>
        {format === "pdf" ? (
          <>
            <p className="bexp-preview-status" aria-live="polite">
              {preview.status === "working"
                ? e.previewWorking
                : preview.status === "failed"
                  ? e.previewFailed
                  : preview.status === "empty"
                    ? e.previewEmpty
                    : preview.pages === 1
                      ? e.previewOne
                      : fmt(e.previewPages, { n: preview.pages })}
              {preview.status === "ready" && options.audience === "tiers" && <span className="bexp-page-hint"> · {e.pageHint}</span>}
            </p>
            <div ref={canvases} className={`bexp-pages${preview.status === "working" ? " is-working" : ""}${preview.status === "empty" || preview.status === "failed" ? " is-hidden" : ""}`} />
          </>
        ) : (
          <p className="muted">{e.formatHint}</p>
        )}
      </section>
    </div>
  );
}
