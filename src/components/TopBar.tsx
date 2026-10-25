import { useEffect, useRef, useState } from "react";
import { useCosmos, type View } from "../store";
import { BrandMark, Wordmark } from "./BrandMark";
import { useVocab } from "../vocab";
import { Settings } from "./Settings";
import { ExportMenu } from "./ExportMenu";
import { AiMenu } from "./AiMenu";
import { Search } from "./Search";
import { TodoPanel } from "./TodoPanel";
import { useTopbarFit } from "./useTopbarFit";
import { useSettings } from "../settings";

const VIEWS: View[] = ["toile", "plan", "bible", "manuscrit"];

export function TopBar() {
  const { t, views, kind } = useVocab();
  const lang = useSettings((s) => s.lang);
  const { view, setView, status, save, closeProject, title, setTitle } = useCosmos();

  // Téléphone : les actions se rangent derrière « ⋯ » ; les vues passent en barre d'onglets en bas (CSS).
  const [more, setMore] = useState(false);
  // Les vues passent sous la marque quand tout ne tient plus sur une ligne (mesuré, pas deviné d'après la largeur).
  const barRef = useRef<HTMLElement>(null);
  const { compact, stacked } = useTopbarFit(barRef, [kind, lang]);
  useEffect(() => {
    if (!more) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".topbar")) setMore(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [more]);

  return (
    // data-tauri-drag-region : le fond de la barre déplace la fenêtre (barre de titre intégrée du Mac),
    // un double-clic l'agrandit ; les boutons et le titre gardent leurs clics.
    <header ref={barRef} className={`topbar${more ? " more-open" : ""}${compact ? " is-compact" : ""}${stacked ? " is-stacked" : ""}`} data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <BrandMark size={34} />
        {/* Le nom, et dessous le titre du projet (modifiable sur place) : la colonne reste étroite, les vues
            gardent leur place au centre, même sur un iPad en paysage. */}
        <span className="brand-text">
          <Wordmark className="brand-name" />
          <input
            className="brand-project"
            type="text"
            value={title}
            size={Math.max(8, title.length)}
            placeholder={t.home.untitled}
            aria-label={t.app.projectTitle}
            title={t.app.projectTitle}
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
          />
        </span>
      </div>

      <nav className="views" aria-label={t.views.aria}>
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            className={view === v ? "is-current" : ""}
            aria-current={view === v ? "page" : undefined}
            onClick={() => {
              setView(v);
              setMore(false);
            }}
          >
            {views[v]}
          </button>
        ))}
      </nav>

      <button type="button" className="icon-button topbar-more" aria-label={t.app.moreOptions} title={t.app.moreOptions} aria-expanded={more} onClick={() => setMore(!more)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      <div className="actions">
        {/* Tous les libellés sont empilés (un seul visible) : la largeur ne change pas d'un statut à
            l'autre, donc rien ne bouge dans la barre pendant un enregistrement. */}
        <span className={`status status-${status}`}>
          {(Object.keys(t.status) as (keyof typeof t.status)[]).map((key) => (
            <span key={key} aria-hidden={key !== status} className={key === status ? "is-current" : undefined}>
              {t.status[key]}
            </span>
          ))}
          <span className="sr-only" role="status">
            {t.status[status]}
          </span>
        </span>
        {/* Barre compacte (iPad) : le libellé laisse place à une icône, le nom reste pour les lecteurs d'écran. */}
        <button type="button" className="ghost-button tb-iconable" aria-label={t.home.projects} title={t.home.backHint} onClick={() => closeProject()}>
          <svg className="tb-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="7" height="7" rx="1.5" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" />
          </svg>
          <span className="tb-label">{t.home.projects}</span>
        </button>
        {/* En icône : la barre porte déjà le statut, et l'enregistrement est automatique. Barre compacte : le
            statut passe dans le bouton (point quand ce n'est pas enregistré, et son nom dans l'infobulle). */}
        <button
          type="button"
          className={`icon-button tb-save is-${status}`}
          aria-label={t.actions.save}
          title={compact ? `${t.actions.saveHint} (${t.status[status]})` : t.actions.saveHint}
          onClick={save}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
            <path d="M8 4v5h7V4M8 20v-6h8v6" />
          </svg>
        </button>
        <AiMenu />
        <ExportMenu />
        <TodoPanel />
        <Search />
        <Settings />
      </div>
    </header>
  );
}
