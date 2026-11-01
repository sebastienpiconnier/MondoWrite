import { useEffect, useRef, useState } from "react";
import { useCosmos, type View } from "../store";
import { BrandMark, Wordmark } from "./BrandMark";
import { useVocab } from "../vocab";
import { Settings } from "./Settings";
import { ExportMenu } from "./ExportMenu";
import { AiMenu } from "./AiMenu";
import { AtelierBadge } from "./Atelier";
import { Search } from "./Search";
import { TodoPanel } from "./TodoPanel";
import { useTopbarFit } from "./useTopbarFit";
import { useSettings } from "../settings";
import { shownView, usePhone } from "./usePhone";

const VIEWS: View[] = ["toile", "plan", "bible", "manuscrit"];
/** Téléphone (Carnet) : écrire, consulter, capturer. Le canevas et le Plan restent sur iPad et ordinateur. */
const PHONE_VIEWS: View[] = ["manuscrit", "bible", "carnet"];

export function TopBar() {
  const { t, views, kind } = useVocab();
  const lang = useSettings((s) => s.lang);
  // Un sélecteur par champ (valeurs simples ou fonctions stables) : la barre ne se redessine plus à chaque frappe.
  const view = useCosmos((s) => s.view);
  const setView = useCosmos((s) => s.setView);
  const status = useCosmos((s) => s.status);
  const save = useCosmos((s) => s.save);
  const closeProject = useCosmos((s) => s.closeProject);
  const title = useCosmos((s) => s.title);
  const setTitle = useCosmos((s) => s.setTitle);
  const phone = usePhone();
  const current = shownView(view, phone);

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
        {/* Retour à la liste des projets, à gauche comme un bouton Retour (1.11.1) : le projet est enregistré avant. */}
        <button type="button" className="tb-back" aria-label={t.home.projects} title={t.home.backHint} onClick={() => closeProject()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          <span className="tb-label">{t.home.projects}</span>
        </button>
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
        {(phone ? PHONE_VIEWS : VIEWS).map((v) => (
          <button
            key={v}
            type="button"
            className={current === v ? "is-current" : ""}
            aria-current={current === v ? "page" : undefined}
            onClick={() => {
              setView(v);
              setMore(false);
            }}
          >
            {views[v]}
          </button>
        ))}
      </nav>

      {/* Téléphone : les actions sont derrière « ⋯ », qui porte donc le point d'état d'enregistrement. */}
      <button type="button" className={`icon-button topbar-more is-${status}`} aria-label={t.app.moreOptions} title={`${t.app.moreOptions} (${t.status[status]})`} aria-expanded={more} onClick={() => setMore(!more)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      <div className="actions">
        {/* Statut d'enregistrement (l'app enregistre seule) : un clic enregistre tout de suite, comme Ctrl ou Cmd + S.
            Tous les libellés sont empilés (un seul visible) : la largeur ne change pas d'un statut à l'autre.
            Barre compacte : un point seulement quand ce n'est pas enregistré (le nom reste dans l'infobulle). */}
        <button type="button" className={`status status-${status}`} title={`${t.status[status]} · ${t.actions.saveHint}`} aria-label={`${t.status[status]}, ${t.actions.save}`} onClick={save}>
          {(Object.keys(t.status) as (keyof typeof t.status)[]).map((key) => (
            <span key={key} aria-hidden="true" className={key === status ? "is-current" : undefined}>
              {t.status[key]}
            </span>
          ))}
          <span className="sr-only" role="status">
            {t.status[status]}
          </span>
        </button>
        {/* Trois groupes (règles d'Apple pour une barre d'outils) : produire, retrouver, régler. */}
        <div className="tb-group">
          <AtelierBadge />
          <AiMenu />
          <ExportMenu />
        </div>
        <div className="tb-group">
          <TodoPanel />
          <Search />
        </div>
        <Settings />
      </div>
    </header>
  );
}
