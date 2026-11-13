import { useEffect, useRef, useState } from "react";
import { useCosmos, type View } from "../store";
import { BrandMark, Wordmark } from "./BrandMark";
import { useVocab } from "../vocab";
import { Settings } from "./Settings";
import { AssistantBadge } from "./AssistantBadge";
import { ExportMenu } from "./ExportMenu";
import { AiMenu } from "./AiMenu";
import { AtelierBadge } from "./Atelier";
import { Search } from "./Search";
import { TodoPanel } from "./TodoPanel";
import { useTopbarFit } from "./useTopbarFit";
import { useSettings } from "../settings";
import { shownView, usePhone } from "./usePhone";

/** Les quatre vues, dans le même ordre partout (#56) : barre du haut, onglets du téléphone, Cmd/Ctrl + 1 à 4. Sur
 *  téléphone, elles sont en onglets avec une icône (Plan et Manuscrit prennent leur nom de scénario). */
const VIEWS: View[] = ["toile", "plan", "bible", "manuscrit"];

/** Icônes de la barre d'onglets du téléphone (1.11.2) : une barre d'onglets d'iPhone montre une icône et son nom. */
const tabIcon = (d: string) => (
  <svg className="view-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PHONE_ICONS: Partial<Record<View, React.ReactNode>> = {
  // Une liste ordonnée : le Plan (ou le séquencier).
  plan: tabIcon("M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"),
  // Une page et son texte.
  manuscrit: tabIcon("M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4"),
  // Un livre ouvert.
  bible: tabIcon("M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2zM12 6.5v14"),
  // Trois cartes posées en vrac, reliées.
  toile: tabIcon("M3 4h7v6H3zM14 3h7v6h-7zM8 15h8v6H8zM10 7h4M7 10l3 5M17 9l-3 6"),
};

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
  // « Juste écrire » (discussion #61) : seule la vue d'écriture (et celle où l'on est), « Toutes les vues » pour le reste.
  const writerMode = useSettings((s) => s.writing.writerMode);
  const [allViews, setAllViews] = useState(false);
  const shownViews = writerMode && !allViews ? VIEWS.filter((v) => v === "manuscrit" || v === current) : VIEWS;

  // Téléphone : les actions se rangent derrière « ⋯ » ; les vues passent en barre d'onglets en bas (CSS).
  const [more, setMore] = useState(false);
  // Les vues passent sous la marque quand tout ne tient plus sur une ligne (mesuré, pas deviné d'après la largeur).
  const barRef = useRef<HTMLElement>(null);
  const { compact, stacked } = useTopbarFit(barRef, [kind, lang]);
  useEffect(() => {
    if (!more) return;
    const onDown = (e: PointerEvent) => {
      // Un menu posé dans <body> (⋯ des Réglages, statut…) appartient encore à la barre : sans cela, « Réglages… »
      // fermait la rangée d'actions, donc le panneau des Réglages qu'elle contient, sur iPhone (novembre 2026).
      if (!(e.target instanceof Element) || !e.target.closest(".topbar, .more-menu")) setMore(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [more]);

  return (
    // data-tauri-drag-region : le fond de la barre déplace la fenêtre (barre de titre intégrée du Mac),
    // un double-clic l'agrandit ; les boutons et le titre gardent leurs clics.
    <header ref={barRef} className={`topbar${more ? " more-open" : ""}${compact ? " is-compact" : ""}${stacked ? " is-stacked" : ""}`} data-tauri-drag-region>
      {/* Grand écran : colonne de verre (glass.css) ; ailleurs « display: contents », la barre est celle d'avant. */}
      <div className="shell-side">
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
        {shownViews.map((v) => (
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
            {PHONE_ICONS[v]}
            <span className="view-label">{views[v]}</span>
          </button>
        ))}
        {shownViews.length < VIEWS.length && (
          <button type="button" className="views-all" onClick={() => setAllViews(true)}>
            <span className="view-label">{t.views.others}</span>
          </button>
        )}
      </nav>
      </div>
      <span className="shell-title" aria-hidden="true">{views[current as View] ?? ""}</span>

      {/* Téléphone : les actions sont derrière « ⋯ », qui porte donc le point d'état d'enregistrement. */}
      <button type="button" className={`icon-button topbar-more is-${status}`} aria-label={status === "enregistre" ? t.app.moreOptions : `${t.app.moreOptions} (${t.status[status]})`} title={`${t.app.moreOptions} (${t.status[status]})`} aria-expanded={more} onClick={() => setMore(!more)}>
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
          <AssistantBadge />
          <AtelierBadge />
          <AiMenu />
          <ExportMenu />
        </div>
        <div className="tb-group">
          <TodoPanel />
          <Search />
        </div>
        <div className="tb-group">
          <Settings />
        </div>
      </div>
    </header>
  );
}
