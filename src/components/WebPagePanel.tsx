// Fenêtre « Page web jouable » (menu Exporter d'un roman interactif, #122, #124, #125) : forme (page seule ou
// archive pour itch.io), qualité des images et poids estimé, retour au choix précédent, thème et CSS personnalisé,
// gardés dans le projet (`webPage` de cosmos.json), puis enregistrement. Sur téléphone, le menu fabrique la page
// directement avec les réglages gardés.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { WEB_FORMATS, WEB_QUALITIES, WEB_THEMES, WEB_THEME_DEFS, readWebPage, type WebTheme } from "../interactive/webThemes";
import type { PreparedWeb } from "../interactive/webExport";

/** Aperçu d'un thème : ses couleurs et sa police, en clair et en sombre (données du thème, pas de l'interface). */
function ThemeSwatch({ theme }: { theme: WebTheme }) {
  const d = WEB_THEME_DEFS[theme];
  const half = (p: typeof d.light): CSSProperties => ({ background: p.paper, color: p.ink, borderColor: p.accent });
  return (
    <span className="wpage-swatch" style={{ fontFamily: d.font }} aria-hidden="true">
      <span style={half(d.light)}>Aa</span>
      <span style={half(d.dark)}>Aa</span>
    </span>
  );
}

export function WebPagePanel() {
  const t = useT();
  const w = t.interactive.web;
  const k = w.panel;
  const done = t.screenplay.export;
  const metaKeep = useCosmos((s) => s.metaKeep);
  const setWebPage = useCosmos((s) => s.setWebPage);
  const options = readWebPage(metaKeep);
  const [css, setCss] = useState(options.css);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  // Histoire compilée et images encodées à la qualité choisie (#125) : refait quand la qualité change.
  const [prepared, setPrepared] = useState<PreparedWeb | null>(null);
  const [preparing, setPreparing] = useState(true);
  const lang = useSettings((st) => st.lang);
  const title = () => useCosmos.getState().title.trim() || t.home.untitled;

  useEffect(() => {
    let live = true;
    setPreparing(true);
    setPrepared(null);
    void (async () => {
      const { prepareStoryWeb, StoryCompileError } = await import("../interactive/webExport");
      try {
        const next = await prepareStoryWeb(title(), useSettings.getState().author.trim(), options.quality);
        if (!live) return;
        setPrepared(next);
        if (!next) setMessage(t.exports.emptyManuscript);
      } catch (err) {
        if (!live) return;
        if (err instanceof StoryCompileError) setMessage(w.compileFailed);
        else {
          console.error(err);
          setMessage(done.failed);
        }
      } finally {
        if (live) setPreparing(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [options.quality]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poids du fichier qui sera enregistré : la page ou l'archive est assemblée pour le mesurer (rapide).
  const [buildWeb, setBuildWeb] = useState<typeof import("../interactive/webExport").buildStoryWeb | null>(null);
  useEffect(() => {
    void import("../interactive/webExport").then((m) => setBuildWeb(() => m.buildStoryWeb));
  }, []);
  const file = useMemo(
    () => (prepared && buildWeb ? buildWeb(prepared, { theme: options.theme, css, back: options.back, format: options.format }) : null),
    [prepared, buildWeb, options.theme, options.back, options.format, css],
  );
  const size = file ? new Intl.NumberFormat(lang, { style: "unit", unit: file.data.length >= 1e6 ? "megabyte" : "kilobyte", maximumFractionDigits: 1 }).format(file.data.length / (file.data.length >= 1e6 ? 1e6 : 1e3)) : "";

  const save = async () => {
    if (saving || !file) return;
    setWebPage({ css });
    setSaving(true);
    setMessage(done.working);
    try {
      const saved = await storage.saveAs(file, w.menu);
      setMessage(saved ? done.done : "");
    } catch (err) {
      console.error(err);
      setMessage(done.failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="spdf wpage">
      <form
        className="spdf-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="app-dialog-title">{k.title}</h2>
        <p className="spdf-hint">{k.intro}</p>
        <fieldset>
          <legend>{k.formatLegend}</legend>
          {WEB_FORMATS.map((format) => (
            <label key={format} className="spdf-choice wpage-choice">
              <input type="radio" name="wpage-format" value={format} checked={options.format === format} onChange={() => setWebPage({ format })} />
              <span>
                {k.formats[format]}
                <span className="spdf-hint"> {k.formatHints[format]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{k.qualityLegend}</legend>
          <div className="wpage-quality">
            {WEB_QUALITIES.map((quality) => (
              <label key={quality} className="spdf-choice wpage-choice">
                <input type="radio" name="wpage-quality" value={quality} checked={options.quality === quality} onChange={() => setWebPage({ quality })} />
                {k.qualities[quality]}
              </label>
            ))}
          </div>
          <p className="spdf-hint" aria-live="polite">
            {preparing ? k.weighing : size ? fmt(k.weight, { size }) : ""}
          </p>
        </fieldset>
        <label className="spdf-choice wpage-choice">
          <input type="checkbox" checked={options.back} onChange={(e) => setWebPage({ back: e.target.checked })} />
          <span>
            {k.back}
            <span className="spdf-hint"> {k.backHint}</span>
          </span>
        </label>
        <fieldset>
          <legend>{k.themeLegend}</legend>
          <div className="wpage-themes">
            {WEB_THEMES.map((theme) => (
              <label key={theme} className={`wpage-theme${options.theme === theme ? " is-on" : ""}`}>
                <input type="radio" name="wpage-theme" value={theme} checked={options.theme === theme} onChange={() => setWebPage({ theme })} />
                <ThemeSwatch theme={theme} />
                <span className="wpage-theme-text">
                  <span className="wpage-theme-name">{k.themes[theme]}</span>
                  <span className="spdf-hint">{k.themeHints[theme]}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="spdf-hint">{k.modesHint}</p>
        </fieldset>
        <details className="wpage-advanced" open={!!options.css.trim() || undefined}>
          <summary>{k.advanced}</summary>
          <label className="spdf-field">
            {k.css}
            <textarea value={css} rows={6} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={(e) => setCss(e.target.value)} onBlur={() => setWebPage({ css })} />
          </label>
          <p className="spdf-hint">{k.cssHint}</p>
        </details>
        <div className="spdf-actions">
          <p className="spdf-hint">{k.kept}</p>
          <p className="spdf-status" role="status">
            {message}
          </p>
          <div className="spdf-buttons">
            <button type="button" className="spdf-close" onClick={() => useCosmos.getState().setDialog(null)}>
              {t.gallery.close}
            </button>
            <button type="submit" className="is-primary" disabled={saving || !file}>
              {k.save}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
