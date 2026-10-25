// Bouton « Exporter » : le scénario (PDF au format standard, Fountain, Final Draft) ou le manuscrit
// d'un roman (PDF, Word, EPUB, Markdown), la bible du projet dans les deux cas, et le canevas (PNG, PDF
// standard ou grand format, Word, Markdown).
// Menu de vrais boutons : souris, doigt et clavier (Échap referme, le focus revient sur le bouton).

import { useEffect, useId, useRef, useState } from "react";
import { useCommand } from "../commands";
import { authorName, contactLines } from "../profile";
import { countWords } from "../manuscript";
import { roundWords } from "../export/prose";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { SCREENPLAY_FILE, storage } from "../storage";
import { EXPORT_FORMATS, exportScreenplay, type ExportFormat, type ExportedFile } from "../screenplay/export";
import { BIBLE_FORMATS, MANUSCRIPT_FORMATS, exportDocument, type DocFormat } from "../export";
import { bibleOf, canvasOf, manuscriptOf } from "../export/projectDocs";
import { bibleOrder } from "../bibleParts";
import { canvasBounds } from "../export/canvas";
import { boxes, frameBox } from "../projectState";
import { fileName } from "../screenplay/export";

/** Formats du canevas : image, PDF standard ou grand format, texte des cartes. */
const CANVAS_FORMATS = ["png", "pdf", "pdfLarge", "docx", "md"] as const;
type CanvasFormat = (typeof CANVAS_FORMATS)[number];

/** Le calque des cartes de React Flow, une fois le canevas à l'écran (on y passe au besoin). */
async function canvasViewport(): Promise<HTMLElement | null> {
  const s = useCosmos.getState();
  if (s.view !== "toile") s.setView("toile");
  // L'export montre tout le canevas : ni filtre, ni carte mise en avant (états d'affichage seulement).
  s.clearFilter();
  s.setSpotlight(null);
  await new Promise((r) => setTimeout(r, 60));
  for (let i = 0; i < 40; i++) {
    const el = document.querySelector<HTMLElement>(".toile .react-flow__viewport");
    // Les cartes sont mesurées : React Flow les montre (visibility) dès qu'il connaît leur taille.
    if (el && el.querySelector(".react-flow__node") && !el.querySelector(".react-flow__node[style*='visibility: hidden']")) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  return document.querySelector<HTMLElement>(".toile .react-flow__viewport");
}

export function ExportMenu() {
  const { t: all, kind } = useVocab();
  const t = all.screenplay.export;
  const x = useT().exports;
  const [open, setOpen] = useState(false);
  // Barre des menus du Mac (Fichier > Exporter…).
  useCommand("export", () => setOpen(true));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  /** Fabrique le fichier, puis le fait enregistrer par le système. `empty` : message si rien à exporter. */
  const run = async (label: string, build: () => Promise<ExportedFile | null>, empty = x.emptyManuscript) => {
    if (busy) return;
    setBusy(true);
    setMessage(t.working);
    try {
      const file = await build();
      if (!file) {
        setMessage(empty);
        return;
      }
      const saved = await storage.saveAs(file, label);
      setMessage(saved ? t.done : "");
      if (saved) setOpen(false);
    } catch (err) {
      console.error(err);
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  };

  const info = () => {
    const { title } = useCosmos.getState();
    const { lang, author } = useSettings.getState();
    return { title: title.trim() || all.home.untitled, author: author.trim(), lang };
  };
  // Mêmes documents que les copies Markdown du dossier projet (export/projectDocs.ts).
  const ctx = () => ({ t: all, lang: useSettings.getState().lang, author: useSettings.getState().author });

  const screenplayFile = (format: ExportFormat) => async () => {
    const { screenplay, savedScreenplay, lastFiles, title, paper, sceneNumbers, underlineHeadings } = useCosmos.getState();
    if (!screenplay) return null;
    return exportScreenplay(screenplay, format, {
      title,
      paper,
      locale: useSettings.getState().lang,
      strings: { more: all.screenplay.more, contd: all.screenplay.contd },
      numberScenes: sceneNumbers,
      underlineHeadings,
      // Scénario inchangé depuis le disque : on exporte le fichier lui-même, à l'octet près.
      source: screenplay === savedScreenplay ? lastFiles[SCREENPLAY_FILE] : undefined,
    });
  };

  const manuscriptFile = (format: DocFormat) => async () => {
    // Le manuscrit porte les coordonnées du profil sur sa page de garde (pas la bible ni l'EPUB).
    const contact = format === "epub" ? [] : contactLines(useSettings.getState().profile);
    const doc = manuscriptOf(useCosmos.getState(), ctx(), contact);
    if (doc.chapters.length === 0) return null;
    if (format === "pdf") {
      // Format Shunn : « Nom / TITRE / page » en tête, nombre de mots arrondi, « par Untel ».
      const { lang, profile } = useSettings.getState();
      const words = Object.values(useCosmos.getState().manuscript).reduce((n, html) => n + countWords(html), 0);
      const surname = (authorName(profile) || doc.author).split(/\s+/).filter(Boolean).pop() ?? "";
      doc.shunn = {
        running: [surname, doc.title.toLocaleUpperCase(lang)].filter(Boolean).join(" / "),
        words: fmt(x.aboutWords, { n: new Intl.NumberFormat(lang).format(roundWords(words)) }),
        byline: doc.author ? fmt(x.byline, { author: doc.author }) : "",
      };
    }
    return exportDocument(doc, format, { name: doc.title, paper: useCosmos.getState().paper, contents: x.contents });
  };

  const bibleFile = (format: DocFormat) => async () => {
    // Les rubriques de la Bible, dans son ordre : ce qu'on masque dans la Bible ne s'exporte pas.
    const doc = bibleOf(useCosmos.getState(), ctx(), bibleOrder(useSettings.getState().bibleSections));
    // Le Markdown cite les images de medias/ ; le PDF et le Word les intègrent.
    const full = format === "md" ? doc : await (await import("../export/images")).withImages(doc, (name) => storage.mediaUrl(name));
    return exportDocument(full, format, { name: doc.title, paper: useCosmos.getState().paper, contents: x.contents });
  };

  const canvasFile = (format: CanvasFormat) => async (): Promise<ExportedFile | null> => {
    const { nodes, title } = useCosmos.getState();
    if (nodes.length === 0) return null;
    const base = info();
    const name = fmt(x.canvasName, { title: base.title });
    const file = (extension: string, mime: string, data: Uint8Array): ExportedFile => ({ name: `${fileName(name, "mondowrite")}.${extension}`, extension, mime, data });
    if (format === "docx" || format === "md") {
      const doc = canvasOf(useCosmos.getState(), ctx());
      const full = format === "md" ? doc : await (await import("../export/images")).withImages(doc, (n) => storage.mediaUrl(n));
      return exportDocument(full, format, { name, paper: useCosmos.getState().paper, contents: x.contents });
    }
    // Image : on dessine le canevas tel qu'il est affiché, sans sélection ni poignées.
    useCosmos.getState().clearSelection();
    const viewport = await canvasViewport();
    const measured = useCosmos.getState();
    const bounds = canvasBounds([...boxes(measured.nodes), ...measured.frames.map(frameBox)]);
    if (!viewport || !bounds) return null;
    const image = await import("../export/canvasImage");
    const canvas = await image.renderCanvas(viewport, bounds, format === "pdfLarge" ? "large" : "standard");
    if (format === "png") return file("png", "image/png", await image.canvasPng(canvas));
    return file("pdf", "application/pdf", await image.canvasPdf(canvas, format === "pdfLarge" ? "large" : "standard", title.trim() || base.title));
  };
  const canvasLabels: Record<CanvasFormat, string> = { png: x.canvasPng, pdf: x.canvasPdf, pdfLarge: x.canvasPdfLarge, docx: x.canvasDocx, md: x.canvasMd };

  const groups = [
    kind === "scenario"
      ? {
          title: x.screenplay,
          // Le PDF a sa fenêtre (contenu, en-tête, filigrane…), qui enregistre elle-même le fichier.
          items: EXPORT_FORMATS.map((f) =>
            f === "pdf" ? { key: "sp-pdf", label: t.pdfMenu, open: () => useCosmos.getState().setDialog("scriptPdf") } : { key: `sp-${f}`, label: t[f], build: screenplayFile(f) },
          ),
        }
      : {
          title: x.manuscript,
          items: [
            ...MANUSCRIPT_FORMATS.map((f) => ({ key: `ms-${f}`, label: x[f], build: manuscriptFile(f) })),
            // Livre broché : une fenêtre de réglages, qui enregistre elle-même ses deux PDF.
            { key: "ms-paperback", label: all.paperback.menu, open: () => useCosmos.getState().setDialog("paperback") },
          ],
        },
    { title: x.bible, items: BIBLE_FORMATS.map((f) => ({ key: `bible-${f}`, label: x[f], build: bibleFile(f) })) },
    { title: x.project, items: [{ key: "project-zip", label: x.projectZip, build: () => useCosmos.getState().projectZip() }] },
    { title: x.canvas, empty: x.emptyCanvas, items: CANVAS_FORMATS.map((f) => ({ key: `canvas-${f}`, label: canvasLabels[f], build: canvasFile(f) })) },
  ] as { title: string; empty?: string; items: { key: string; label: string; build?: () => Promise<ExportedFile | null>; open?: () => void }[] }[];
  const failed = message === t.failed || message === x.emptyManuscript || message === x.emptyCanvas;

  return (
    <div className="settings" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="ghost-button tb-iconable"
        aria-label={t.button}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setMessage("");
          setOpen(!open);
        }}
      >
        <svg className="tb-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 15V4M8 8l4-4 4 4" />
          <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
        </svg>
        <span className="tb-label">{t.button}</span>
      </button>
      {open && (
        <div className="settings-panel export-panel" id={panelId} role="group" aria-label={t.menuAria}>
          {groups.map((group) => (
            <div key={group.title} className="export-group" role="group" aria-label={group.title}>
              <span className="eyebrow">{group.title}</span>
              {group.items.map((item) => (
                <button key={item.key} type="button" className="ghost-button" disabled={busy} onClick={() => {
                    if (item.open) {
                      setOpen(false);
                      item.open();
                    } else if (item.build) void run(`${group.title}, ${item.label}`, item.build, group.empty);
                  }}>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {/* Annoncé aux lecteurs d'écran ; visible seulement en cas d'échec. */}
      <span className={failed ? "export-error" : "sr-only"} role="status">
        {message}
      </span>
    </div>
  );
}
