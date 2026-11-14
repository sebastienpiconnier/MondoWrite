// Couverture complète du livre broché (#78), dans la fenêtre « Livre broché (KDP) » : réglages (cadrage, place du
// titre, fond de la quatrième, couleur du dos, présentation de l'auteur), contrôles, aperçu du vrai PDF (pdf.js)
// et enregistrement. La mise en page attend le nombre de pages de l'intérieur (largeur du dos). Réglages gardés
// dans le projet (`coverDesign`). Textes : titre du projet, nom signé du profil (nom de plume d'abord), accroche
// et quatrième de couverture de la Bible, parcours du profil. Pas d'ISBN à part : le code-barres de KDP le porte déjà.

import { useEffect, useRef, useState } from "react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { isMediaName } from "../media";
import { loadPaperback } from "../export";
import { fileName } from "../screenplay/export";
import { BLOCKING, type CoverCheck } from "../export/fullCover";
import { COVER_BACKS, COVER_CROPS, COVER_TITLE_PLACES, type CoverBack, type CoverCrop, type CoverTitlePlace } from "../export/coverDesign";

const PREVIEW_WIDTH = 560;
const DELAY = 400;

type Preview = { status: "working" } | { status: "failed" } | { status: "ready"; checks: CoverCheck[]; edge: string | null };

export function FullCoverSection({ pages }: { pages: number | null }) {
  const t = useT();
  const k = t.paperback.full;
  const print = useCosmos((s) => s.print);
  const design = useCosmos((s) => s.coverDesign);
  const setDesign = useCosmos((s) => s.setCoverDesign);
  const title = useCosmos((s) => s.title);
  const tagline = useCosmos((s) => s.pitch.tagline ?? "");
  const backCopy = useCosmos((s) => s.pitch.quatrieme ?? "");
  const visualName = useCosmos((s) => s.pitch.visuel ?? "");
  const visual = isMediaName(visualName) ? visualName : "";
  const author = useSettings((s) => s.author).trim();
  const bio = useSettings((s) => s.profile.bio).trim();
  const [preview, setPreview] = useState<Preview>({ status: "working" });
  // L'aperçu précédent reste affiché, estompé, pendant qu'on prépare le suivant.
  const [drawn, setDrawn] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const bytes = useRef<Uint8Array | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<{ name: string; img: HTMLImageElement | null } | null>(null);

  useEffect(() => {
    if (pages === null) return;
    let stale = false;
    setPreview({ status: "working" });
    bytes.current = null;
    const timer = window.setTimeout(async () => {
      try {
        // L'image n'est relue que si elle a changé.
        if (visual && image.current?.name !== visual) {
          const { loadImage } = await import("../export/coverImage");
          const url = await storage.mediaUrl(visual).catch(() => null);
          let img: HTMLImageElement | null = null;
          if (url) {
            try {
              img = await loadImage(url);
            } catch {
              img = null;
            }
          }
          image.current = { name: visual, img };
        }
        const img = visual ? (image.current?.img ?? null) : null;
        const { prepareFullCover } = await loadPaperback();
        const prepared = await prepareFullCover({
          trim: print.trim,
          paper: print.paper,
          pages,
          design,
          texts: { title, author, tagline, back: backCopy, bio: design.bio ? bio : "" },
          image: img ? { width: img.naturalWidth, height: img.naturalHeight } : null,
        });
        const { prepareCoverArt } = await import("../export/coverImage");
        const art = img ? prepareCoverArt(img, prepared.layout, design.back === "image") : null;
        const data = await prepared.draw(art);
        if (stale) return;
        bytes.current = data;
        const { openPdf, renderPage } = await import("../pdfDocument");
        const doc = await openPdf(data);
        try {
          if (!stale && canvas.current) await renderPage(doc, 1, canvas.current, PREVIEW_WIDTH);
        } finally {
          void doc.loadingTask.destroy();
        }
        if (!stale) {
          setPreview({ status: "ready", checks: prepared.layout.checks, edge: art?.edge ?? null });
          setDrawn(true);
        }
      } catch (err) {
        console.error(err);
        if (!stale) setPreview({ status: "failed" });
      }
    }, DELAY);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
  }, [pages, print.trim, print.paper, design, title, author, tagline, backCopy, bio, visual]);

  const blocked = preview.status !== "ready" || preview.checks.some((c) => BLOCKING.includes(c.kind));
  const save = async () => {
    if (blocked || saving || !bytes.current) return;
    setSaving(true);
    setMessage(t.screenplay.export.working);
    try {
      const name = fmt(k.name, { title: title.trim() || t.home.untitled });
      const data = bytes.current;
      const saved = await storage.saveAs({ name: `${fileName(name, "mondowrite")}.pdf`, extension: "pdf", mime: "application/pdf", data }, k.save);
      setMessage(saved ? t.screenplay.export.done : "");
    } catch (err) {
      console.error(err);
      setMessage(t.screenplay.export.failed);
    } finally {
      setSaving(false);
    }
  };

  const checkText = (c: CoverCheck) =>
    c.kind === "lowRes" ? fmt(c.severe ? k.checks.lowResSevere : k.checks.lowRes, { dpi: c.dpi }) : c.kind === "backOverflow" ? fmt(k.checks.backOverflow, { n: c.lines }) : k.checks[c.kind];
  const edge = preview.status === "ready" ? preview.edge : null;
  const toBible = () => {
    const s = useCosmos.getState();
    s.setDialog(null);
    s.setView("bible");
  };

  return (
    <section className="full-cover" aria-labelledby="full-cover-heading">
      <h3 id="full-cover-heading">{k.heading}</h3>
      <p className="paperback-note">{k.intro}</p>
      <div className="paperback-grid">
        <label className="replace-field">
          <span>{k.titlePlace}</span>
          <select value={design.titlePlace} disabled={design.titleOnImage} onChange={(e) => setDesign({ titlePlace: e.target.value as CoverTitlePlace })}>
            {COVER_TITLE_PLACES.map((id) => (
              <option key={id} value={id}>
                {k.titlePlaces[id]}
              </option>
            ))}
          </select>
        </label>
        {visual && (
          <label className="replace-field">
            <span>{k.crop}</span>
            <select value={design.crop} onChange={(e) => setDesign({ crop: e.target.value as CoverCrop })}>
              {COVER_CROPS.map((id) => (
                <option key={id} value={id}>
                  {k.crops[id]}
                </option>
              ))}
            </select>
          </label>
        )}
        {visual && (
          <label className="replace-field">
            <span>{k.back}</span>
            <select value={design.back} onChange={(e) => setDesign({ back: e.target.value as CoverBack })}>
              {COVER_BACKS.map((id) => (
                <option key={id} value={id}>
                  {k.backs[id]}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="replace-field full-cover-color">
          <label htmlFor="full-cover-spine">{k.spineColor}</label>
          <input id="full-cover-spine" type="color" value={design.spineColor || edge || "#1f2a44"} onChange={(e) => setDesign({ spineColor: e.target.value.toLowerCase() })} />
          {design.spineColor && visual && (
            <button type="button" className="link-button" onClick={() => setDesign({ spineColor: "" })}>
              {k.spineAuto}
            </button>
          )}
        </div>
      </div>
      <div className="replace-options paperback-options">
        {visual && (
          <label>
            <input type="checkbox" checked={design.titleOnImage} onChange={(e) => setDesign({ titleOnImage: e.target.checked })} /> {k.titleOnImage}
          </label>
        )}
        {!design.titleOnImage && (
          <label>
            <input type="checkbox" checked={design.shadow} onChange={(e) => setDesign({ shadow: e.target.checked })} /> {k.shadow}
          </label>
        )}
        <label>
          <input type="checkbox" checked={design.bio && !!bio} disabled={!bio} onChange={(e) => setDesign({ bio: e.target.checked })} /> {k.bio}
        </label>
      </div>
      {!bio && <p className="paperback-note">{k.bioEmpty}</p>}
      {preview.status === "ready" && preview.checks.length > 0 && (
        <ul className="full-cover-checks" role="status">
          {preview.checks.map((c) => (
            <li key={c.kind} className={BLOCKING.includes(c.kind) || (c.kind === "lowRes" && c.severe) ? "is-blocking" : ""}>
              {checkText(c)}
              {c.kind === "noBack" && (
                <>
                  {" "}
                  <button type="button" className="link-button" onClick={toBible}>
                    {k.writeBack}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <figure className="full-cover-preview" aria-label={k.preview}>
        {preview.status !== "ready" && !(drawn && preview.status === "working") && (
          <p className="replace-count" aria-live="polite">
            {pages === null || preview.status === "working" ? k.previewWorking : k.previewFailed}
          </p>
        )}
        <canvas ref={canvas} className={!drawn || preview.status === "failed" ? "is-hidden" : preview.status === "working" ? "is-working" : ""} />
      </figure>
      {message && (
        <p className="replace-count" role="status">
          {message}
        </p>
      )}
      <div className="assistant-actions replace-actions full-cover-actions">
        <button type="button" className="is-primary" disabled={blocked || saving} onClick={() => void save()}>
          {k.save}
        </button>
      </div>
    </section>
  );
}
