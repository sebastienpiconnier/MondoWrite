// Fenêtre « Page web jouable » (menu Exporter d'un roman interactif, #122) : thème de la page et CSS personnalisé,
// gardés dans le projet (`webPage` de cosmos.json), puis enregistrement de la page. Sur téléphone, le menu
// fabrique la page directement avec les réglages gardés.

import { useState, type CSSProperties } from "react";
import { useT } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { WEB_THEMES, WEB_THEME_DEFS, readWebPage, type WebTheme } from "../interactive/webThemes";

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

  const save = async () => {
    if (saving) return;
    setWebPage({ css });
    setSaving(true);
    setMessage(done.working);
    const { storyWebFile, StoryCompileError } = await import("../interactive/webExport");
    try {
      const title = useCosmos.getState().title.trim() || t.home.untitled;
      const file = await storyWebFile(title, useSettings.getState().author.trim());
      if (!file) {
        setMessage(t.exports.emptyManuscript);
        return;
      }
      const saved = await storage.saveAs(file, w.menu);
      setMessage(saved ? done.done : "");
    } catch (err) {
      if (err instanceof StoryCompileError) setMessage(w.compileFailed);
      else {
        console.error(err);
        setMessage(done.failed);
      }
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
            <button type="submit" className="is-primary" disabled={saving}>
              {k.save}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
