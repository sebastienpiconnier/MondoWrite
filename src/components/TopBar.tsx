import { useEffect, useRef, useState } from "react";
import { useCosmos, type View } from "../store";
import { BrandMark, Wordmark } from "./BrandMark";
import { useVocab } from "../vocab";
import { Settings } from "./Settings";
import { ExportMenu } from "./ExportMenu";
import { AiMenu } from "./AiMenu";
import { Search } from "./Search";
import { TodoPanel } from "./TodoPanel";
import { fmt } from "../i18n";
import { useSettings } from "../settings";
import { minutesFor, usePagination } from "./usePagination";
import { useTopbarFit } from "./useTopbarFit";

const VIEWS: View[] = ["toile", "plan", "bible", "manuscrit"];

export function TopBar() {
  const { t, views, kind } = useVocab();
  const lang = useSettings((s) => s.lang);
  const pagination = usePagination();
  const pages = kind === "scenario" ? (pagination?.pages ?? 0) : 0;
  const pageCount = fmt(new Intl.PluralRules(lang).select(pages) === "one" ? t.screenplay.pagesOne : t.screenplay.pagesMany, { n: pages });
  const { view, setView, status, save, closeProject, title, setTitle } = useCosmos();

  // Téléphone : les actions se rangent derrière « ⋯ » ; les vues passent en barre d'onglets en bas (CSS).
  const [more, setMore] = useState(false);
  // Les vues passent sous la marque quand tout ne tient plus sur une ligne (mesuré, pas deviné d'après la largeur).
  const barRef = useRef<HTMLElement>(null);
  const stacked = useTopbarFit(barRef, [kind, lang]);
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
    <header ref={barRef} className={`topbar${more ? " more-open" : ""}${stacked ? " is-stacked" : ""}`} data-tauri-drag-region>
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
        {/* Toujours là pour un scénario, même vide : la barre ne bouge pas quand le texte arrive. */}
        {kind === "scenario" && pagination && (
          <span className="runtime" aria-label={t.screenplay.lengthAria}>
            <strong>{fmt(t.screenplay.minutes, { n: minutesFor(pages) })}</strong>
            <span>{pageCount}</span>
          </span>
        )}
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
        <button type="button" className="ghost-button" title={t.home.backHint} onClick={() => closeProject()}>
          {t.home.projects}
        </button>
        {/* En icône : la barre porte déjà le statut, et l'enregistrement est automatique. */}
        <button type="button" className="icon-button" aria-label={t.actions.save} title={t.actions.saveHint} onClick={save}>
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
