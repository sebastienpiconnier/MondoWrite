// Écran d'accueil : on choisit le projet sur lequel travailler, ou on en crée un.
// Affiché à chaque lancement et depuis le bouton « Projets » de la barre du haut.

import { openGuide } from "../help";
import { LoadingProject } from "./LoadingProject";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { storage, type ProjectEntry } from "../storage";
import { PROJECT_KINDS, type ProjectKind } from "../types";
import { Settings } from "./Settings";
import { ScrivenerChoice } from "./ScrivenerImport";
import { BrandMark, Wordmark } from "./BrandMark";
import { ExamplesPanel } from "./ExamplesPanel";
import { greeting } from "../greeting";
import { hasProfile, legalName } from "../profile";
import { MoreMenu } from "./MoreMenu";
import { LIST_TOOLS_MIN, PROJECT_SORTS, hasBothKinds, listProjects, readListPrefs, writeListPrefs, type KindFilter, type ListPrefs, type ProjectSort } from "../projectList";
import { readSpot } from "../resume";
import { vocab } from "../vocab";

/** Couverture d'un projet (grille de l'accueil, grand écran) : une couleur de type tirée de l'identifiant, le genre et le titre.
 *  Rien n'est enregistré : la couleur vient de l'identifiant, donc elle ne change pas d'une fois à l'autre. */
function CoverArt({ p, title, kindLabel, small = false }: { p: ProjectEntry; title: string; kindLabel: string; small?: boolean }) {
  let n = 0;
  for (const ch of p.id) n = (n * 31 + ch.charCodeAt(0)) % 997;
  return (
    <span className={`home-cover${small ? " is-small" : ""}`} style={{ background: `var(--pov-${(n % 6) + 1})` }} aria-hidden="true">
      {!small && kindLabel && <span className="home-cover-kind">{kindLabel}</span>}
      <span className="home-cover-title">{title}</span>
    </span>
  );
}

export function Home() {
  const t = useT();
  const h = t.home;
  const lang = useSettings((s) => s.lang);
  const profile = useSettings((s) => s.profile);
  const projects = useCosmos((s) => s.projects);
  // Calculée à l'affichage de la page (l'heure du moment) ; la tournure ne change pas d'un rendu à l'autre.
  const welcome = useMemo(() => greeting(t.home.greeting, new Date(), profile.firstName, projects), [t, profile.firstName, projects]);
  const hiddenProjects = useCosmos((s) => s.hiddenProjects);
  const openFailed = useCosmos((s) => s.openFailed);
  const openError = useCosmos((s) => s.openError);
  const notice = useCosmos((s) => s.homeNotice);
  const importNotice = useCosmos((s) => s.importNotice);
  const { openProject, openFolder, createProject, tryExample, hideProject, showProject, deleteProject, importFile, chooseCloudFolder, leaveCloudFolder, gatherStrayProjects } = useCosmos.getState();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("roman");
  const [busy, setBusy] = useState(false);
  // Le formulaire de nouveau projet : toujours là sur petit écran, derrière « Nouveau projet » sur grand écran (CSS).
  const [creating, setCreating] = useState(false);
  // Projets synchronisés devenus inaccessibles (iCloud coupé, dossier cloud introuvable) : on le dit, sans alarmer.
  const [cloudIssue, setCloudIssue] = useState<"icloud" | "folder" | "waiting" | null>(null);
  // Projets restés dans un doublon « projets 2 » créé par iCloud : on propose de les remettre avec les autres.
  const [stray, setStray] = useState(0);
  useEffect(() => {
    let alive = true;
    void storage.cloudIssue?.().then((issue) => alive && setCloudIssue(issue));
    void storage.strayProjects?.().then((n) => alive && setStray(n)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [projects]);
  /** Projet dont la suppression attend une confirmation (deux gestes, jamais un seul clic ni un seul toucher). */
  const [asking, setAsking] = useState<string | null>(null);
  /** Projet dont la suppression a échoué : un message sous sa ligne. */
  const [failed, setFailed] = useState<string | null>(null);
  const ids = { title: useId(), recent: useId(), fresh: useId(), search: useId(), sort: useId(), kind: useId() };
  // Recherche, tri et filtre (#27) quand la liste grandit : tri et filtre gardés sur l'appareil, pas la recherche.
  const [query, setQuery] = useState("");
  const [prefs, setPrefsState] = useState<ListPrefs>(() => readListPrefs());
  const setPrefs = (next: ListPrefs) => {
    setPrefsState(next);
    writeListPrefs(next);
  };
  const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });

  /** Une seule action à la fois : pas de double ouverture pendant qu'un dialogue du système est affiché. */
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() => createProject({ title: title.trim() || h.untitled, kind }));
  };

  const nameOf = (p: ProjectEntry) => p.title || p.name || h.untitled;
  const tools = projects.length >= LIST_TOOLS_MIN;
  const bothKinds = hasBothKinds(projects);
  // Filtre sur un type absent de la liste (le dernier scénario masqué) : on ne le garde pas en silence.
  const shownPrefs: ListPrefs = { sort: tools ? prefs.sort : "recent", kind: bothKinds ? prefs.kind : "all" };
  const shown = useMemo(() => listProjects(projects, query, shownPrefs, lang, nameOf), [projects, query, shownPrefs.sort, shownPrefs.kind, lang, h.untitled]);
  const filtered = shown.length !== projects.length;
  // « Reprendre là où j'en étais » (#27) : le dernier projet ouvert, s'il a une position gardée sur l'appareil.
  const last = useMemo(() => projects.reduce<ProjectEntry | null>((best, p) => (p.openedAt > (best?.openedAt ?? 0) ? p : best), null), [projects]);
  const spot = last ? readSpot(last.id) : null;
  const resumeLine = (() => {
    if (!last || !spot) return "";
    const views = vocab(t, last.kind ?? "roman").views;
    const view = views[spot.view];
    return spot.view === "manuscrit" && spot.label ? fmt(h.resumeScene, { title: nameOf(last), view, scene: spot.label }) : fmt(h.resumeWhere, { title: nameOf(last), view });
  })();
  const kindHints: Record<ProjectKind, string> = { roman: h.novelHint, scenario: h.screenplayHint };
  const kindNames: Record<ProjectKind, string> = { roman: h.novel, scenario: h.screenplay };

  const deletable = (p: ProjectEntry) => !!storage.deleteProject && p.id !== "@dossier";
  /** Une ligne de projet : l'ouvrir, le masquer (ou le réafficher), le supprimer après confirmation. */
  const projectRow = (p: ProjectEntry, hidden = false) => (
    <li key={p.id} className={hidden ? "is-hidden" : undefined}>
      <button type="button" className="home-project" disabled={busy} onClick={() => run(() => openProject(p.id))}>
        <CoverArt p={p} title={nameOf(p)} kindLabel={p.kind ? t.kinds[p.kind] : ""} />
        <span className="home-project-title">{nameOf(p)}</span>
        <span className="home-project-meta">
          {p.kind ? t.kinds[p.kind] : ""}
          {p.kind && p.openedAt > 0 ? " · " : ""}
          {p.openedAt > 0 ? fmt(h.openedOn, { date: date.format(p.openedAt) }) : ""}
          {/* Sur ordinateur, le nom du dossier aide à distinguer deux projets du même titre. */}
          {storage.canPickFolder && p.title && p.name !== p.title ? ` · ${p.name}` : ""}
        </span>
      </button>
      {hidden && (
        <button type="button" className="ghost-button home-show" disabled={busy} aria-label={fmt(h.showAgainLabel, { title: nameOf(p) })} onClick={() => run(() => showProject(p.id))}>
          {h.showAgain}
        </button>
      )}
      {/* Masquer et supprimer dans un menu (1.11.1) : ils avaient le même poids que le projet lui-même. Supprimer
          demande toujours une confirmation. */}
      {asking !== p.id && (
        <MoreMenu
          label={fmt(t.app.moreActionsFor, { title: nameOf(p) })}
          items={[
            !hidden && { label: h.hideShort, title: h.hideHint, disabled: busy, onSelect: () => run(() => hideProject(p.id)) },
            deletable(p) && {
              label: h.removeShort,
              title: fmt(h.remove, { title: nameOf(p) }),
              danger: true,
              disabled: busy,
              onSelect: () => {
                setFailed(null);
                setAsking(p.id);
              },
            },
          ]}
        />
      )}
      {asking === p.id && (
        <div className="home-confirm" role="alert" ref={(el) => el?.scrollIntoView({ block: "nearest" })}>
          <p>{storage.canPickFolder ? fmt(h.removeAskPc, { title: nameOf(p), folder: p.id }) : fmt(h.removeAsk, { title: nameOf(p) })}</p>
          <div className="home-buttons">
            <button
              type="button"
              className="ghost-button is-danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setAsking(null);
                  if (!(await deleteProject(p.id))) setFailed(p.id);
                })
              }
            >
              {h.removeYes}
            </button>
            {/* Le focus va d'abord sur « Annuler » : Entrée ne supprime jamais par mégarde. */}
            <button type="button" className="ghost-button" autoFocus onClick={() => setAsking(null)}>
              {h.removeNo}
            </button>
          </div>
        </div>
      )}
      {failed === p.id && (
        <p className="home-confirm" role="alert">
          {fmt(h.removeFailed, { title: nameOf(p) })}
        </p>
      )}
    </li>
  );

  return (
    <div className="home">
      <LoadingProject />
      <header className="topbar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <BrandMark size={34} />
          <span className="brand-text">
            <Wordmark className="brand-name" />
            <span className="brand-tagline">{t.app.tagline}</span>
          </span>
        </div>
        <span className="shell-title">{h.navAll}</span>
        <div className="actions home-actions">
          <label className="home-capsule-search">
            <span className="sr-only">{h.listSearch}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" value={query} placeholder={h.searchShort} autoComplete="off" spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button type="button" className="home-capsule-new" aria-expanded={creating} disabled={busy} onClick={() => setCreating((c) => !c)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            {h.newShort}
          </button>
          <Settings project={false} />
        </div>
      </header>

      {/* Colonne de verre (grand écran seulement, CSS) : bibliothèque, premiers pas, profil. */}
      <aside className="home-nav" aria-label={h.navLibrary}>
        <div className="brand">
          <BrandMark size={34} />
          <span className="brand-text">
            <Wordmark className="brand-name" />
          </span>
        </div>
        <p className="home-nav-head">{h.navLibrary}</p>
        <ul className="home-nav-list">
          {([["all", h.navAll, projects.length], ["roman", h.navNovels, projects.filter((p) => p.kind !== "scenario").length], ["scenario", h.navScripts, projects.filter((p) => p.kind === "scenario").length]] as [KindFilter, string, number][])
            .filter(([k]) => k === "all" || bothKinds)
            .map(([k, label, n]) => (
              <li key={k}>
                <button type="button" className={`home-nav-item${shownPrefs.kind === k ? " is-current" : ""}`} aria-pressed={shownPrefs.kind === k} onClick={() => setPrefs({ ...prefs, kind: k })}>
                  <span className="home-nav-label">{label}</span>
                  <span className="home-nav-n">{n}</span>
                </button>
              </li>
            ))}
        </ul>
        <p className="home-nav-head">{h.navStart}</p>
        <ul className="home-nav-list">
          <li><button type="button" className="home-nav-item" disabled={busy} onClick={() => setCreating(true)}><span className="home-nav-label">{h.newShort}</span></button></li>
          <li><button type="button" className="home-nav-item" disabled={busy} onClick={() => run(importFile)}><span className="home-nav-label">{h.importFountain}</span></button></li>
          <li><button type="button" className="home-nav-item" disabled={busy} onClick={() => run(tryExample)}><span className="home-nav-label">{h.example}</span></button></li>
          {storage.canPickFolder && <li><button type="button" className="home-nav-item" disabled={busy} onClick={() => run(openFolder)}><span className="home-nav-label">{h.openFolder}</span></button></li>}
        </ul>
        <p className="home-nav-head">{h.navProfile}</p>
        <button type="button" className="home-nav-profile" onClick={() => useCosmos.getState().setDialog("profile")}>
          <span className="home-nav-avatar" aria-hidden="true">{(profile.firstName[0] ?? "").toUpperCase()}{(profile.lastName[0] ?? "").toUpperCase() || (!profile.firstName ? "·" : "")}</span>
          <span className="home-nav-who">
            <span className="home-nav-name">{profile.penName || legalName(profile) || h.navProfile}</span>
            <span className="home-nav-sub">{h.navProfileHint}</span>
          </span>
        </button>
      </aside>

      <main className="home-main">
        {/* Phrase d'accueil (greeting.ts) : bonjour selon l'heure, le prénom, le dernier projet ouvert. */}
        <h1 className="home-greeting">{welcome}</h1>
        {(openFailed || notice || importNotice) && (
          <p className="home-alert" role="alert">
            {importNotice === "taken"
              ? h.importTaken
              : importNotice === "empty"
                ? h.importEmpty
                : importNotice === "scrivener"
                  ? h.importScrivener
                  : importNotice === "scrivenerOld"
                    ? h.importScrivenerOld
                : openFailed
                  ? openError && !(storage.canPickFolder && openError.kind !== "icloud" && openError.kind !== "other")
                    ? h.openFailedWhy[openError.kind]
                    : storage.canPickFolder
                      ? t.app.openFailed
                      : h.openFailed
                  : h.notAProject}
            {/* Un accroc passager (iCloud) se règle souvent en relisant : le geste est là, sans relancer l'app (1.30.1). */}
            {openFailed && openError && !importNotice && (
              <>
                {" "}
                <button type="button" className="link-button" disabled={busy} onClick={() => run(() => openProject(openError.id))}>
                  {h.retryOpen}
                </button>
              </>
            )}
          </p>
        )}

        {cloudIssue && (
          <p className="home-alert is-info" role="status">
            {cloudIssue === "waiting"
              ? h.icloudWaitingPc
              : cloudIssue === "icloud"
                ? storage.canPickFolder
                  ? h.icloudGonePc
                  : h.icloudGone
                : fmt(h.cloudGone, { name: storage.cloud?.name() ?? "" })}
            {/* Le choix du dossier s'ouvre dans le dossier iCloud de l'app (syncFolderHint) : le geste qui dépanne. */}
            {storage.cloud && storage.canPickFolder && (
              <>
                {" "}
                <button type="button" className="link-button" disabled={busy} onClick={() => run(chooseCloudFolder)}>
                  {h.cloudFind}
                </button>
              </>
            )}
          </p>
        )}

        {stray > 0 && (
          <p className="home-alert is-info" role="status">
            {stray === 1 ? h.strayOne : fmt(h.strayMany, { n: stray })}{" "}
            <button
              type="button"
              className="link-button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await gatherStrayProjects();
                  setStray((await storage.strayProjects?.().catch(() => 0)) ?? 0);
                })
              }
            >
              {h.strayGather}
            </button>
          </p>
        )}

        <section className="home-panel" aria-labelledby={ids.recent}>
          <h2 id={ids.recent}>{h.title}</h2>
          {last && spot && (
            <button type="button" className="home-resume" disabled={busy} title={fmt(h.resumeHint, { title: nameOf(last) })} onClick={() => run(() => useCosmos.getState().resumeProject(last.id))}>
              <CoverArt p={last} title={nameOf(last)} kindLabel="" small />
              <span className="home-resume-text">
                <span className="home-resume-title">{h.resume}</span>
                <span className="home-resume-name">{nameOf(last)}</span>
                <span className="home-resume-where">{resumeLine}</span>
              </span>
              <span className="home-resume-go" aria-hidden="true">{h.resumeShort}</span>
            </button>
          )}
          {tools && (
            <div className="home-tools" role="group" aria-label={h.listSearch}>
              <label className="home-tool home-tool-search">
                <span className="sr-only">{h.listSearch}</span>
                <input id={ids.search} type="search" value={query} placeholder={h.listSearchPlaceholder} autoComplete="off" spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label className="home-tool">
                <span>{h.listSort}</span>
                <select id={ids.sort} value={shownPrefs.sort} onChange={(e) => setPrefs({ ...prefs, sort: e.target.value as ProjectSort })}>
                  {PROJECT_SORTS.map((k) => (
                    <option key={k} value={k}>
                      {h.listSorts[k]}
                    </option>
                  ))}
                </select>
              </label>
              {bothKinds && (
                <label className="home-tool">
                  <span>{h.listKind}</span>
                  <select id={ids.kind} value={shownPrefs.kind} onChange={(e) => setPrefs({ ...prefs, kind: e.target.value as KindFilter })}>
                    {(["all", ...PROJECT_KINDS] as KindFilter[]).map((k) => (
                      <option key={k} value={k}>
                        {h.listKinds[k]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {filtered && (
                <span className="home-tool-count" role="status">
                  {fmt(h.listCount, { n: shown.length, total: projects.length })}
                </span>
              )}
            </div>
          )}
          {projects.length === 0 ? (
            <p className="sp-empty">{h.empty}</p>
          ) : shown.length === 0 ? (
            <p className="sp-empty">
              {h.listNone}{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setQuery("");
                  setPrefs({ ...prefs, kind: "all" });
                }}
              >
                {h.listClear}
              </button>
            </p>
          ) : (
            <ul className="home-list">
              {shown.map((p) => projectRow(p))}
            </ul>
          )}
          {hiddenProjects.length > 0 && (
            <details className="home-hidden">
              <summary>{fmt(h.hiddenTitle, { n: hiddenProjects.length })}</summary>
              <ul className="home-list">{hiddenProjects.map((p) => projectRow(p, true))}</ul>
            </details>
          )}
          {storage.cloud?.name() && <p className="settings-hint">{fmt(storage.canPickFolder ? h.cloudActivePc : h.cloudActive, { name: storage.cloud.name() ?? "" })}</p>}
          <div className="home-buttons">
            {storage.canPickFolder && (
              <button type="button" className="ghost-button" disabled={busy} onClick={() => run(openFolder)}>
                {h.openFolder}
              </button>
            )}
            {storage.cloud && (
              <button type="button" className="ghost-button" disabled={busy} title={storage.canPickFolder ? h.cloudHintPc : h.cloudHint} onClick={() => run(chooseCloudFolder)}>
                {storage.cloud.name() ? h.cloudChange : h.cloudChoose}
              </button>
            )}
            {storage.cloud?.name() && (
              <button type="button" className="ghost-button" disabled={busy} title={storage.canPickFolder ? h.cloudLeaveHintPc : h.cloudLeaveHint} onClick={() => run(leaveCloudFolder)}>
                {storage.canPickFolder ? h.cloudLeavePc : storage.icloud?.enabled() ? h.cloudLeaveIcloud : h.cloudLeave}
              </button>
            )}
            <button type="button" className="ghost-button" disabled={busy} title={h.importHint} onClick={() => run(importFile)}>
              {h.importFountain}
            </button>
            {/* Sauvegardes hors des projets (#15) : aussi celles d'un projet dont le dossier a disparu. */}
            {storage.backups && (
              <button type="button" className="ghost-button" disabled={busy} title={t.backups.homeHint} onClick={() => useCosmos.getState().openBackups(null)}>
                {t.backups.homeButton}
              </button>
            )}
          </div>
        </section>

        {/* Colonne de droite : nouveau projet puis profil. La liste des projets peut s'allonger sans les repousser. */}
        <div className={`home-side${creating ? " is-open" : ""}`}>
          <section className="home-panel" aria-labelledby={ids.fresh}>
            <h2 id={ids.fresh}>{h.newTitle}</h2>
            <p className="sp-empty">{h.newHint}</p>
            <form onSubmit={submit} className="home-form">
              <label htmlFor={ids.title}>{h.workingTitle}</label>
              <input
                id={ids.title}
                type="text"
                value={title}
                placeholder={h.titlePlaceholder}
                autoComplete="off"
                onChange={(e) => setTitle(e.target.value)}
              />

              <fieldset className="home-kinds">
                <legend>{h.youWrite}</legend>
                {PROJECT_KINDS.map((k) => (
                  <label key={k} className={`home-kind${kind === k ? " is-selected" : ""}`}>
                    <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                    <span className="home-kind-name">{kindNames[k]}</span>
                    <span className="home-kind-hint">{kindHints[k]}</span>
                  </label>
                ))}
              </fieldset>

              {storage.canPickFolder && (
                <p className="settings-hint">{storage.cloud?.name() ? fmt(h.folderHintCloud, { name: storage.cloud.name() ?? "" }) : h.folderHint}</p>
              )}
              <div className="home-buttons">
                <button type="submit" className="home-create" disabled={busy}>
                  {h.create}
                </button>
                <button type="button" className="ghost-button" disabled={busy} onClick={() => run(tryExample)}>
                  {h.example}
                </button>
                {/* Les parcours du guide (architecte, jardinier, dossier…) : pour savoir par quoi commencer. */}
                <button type="button" className="link-button" title={h.pathsHint} onClick={() => void openGuide("paths")}>
                  {h.paths}
                </button>
              </div>
            </form>
            {/* Profil encore vide : une ligne pour le remplir (fenêtre « Toi, l'auteur », aussi dans les Réglages). */}
            {!hasProfile(profile) && (
              <p className="settings-hint home-profile-nudge">
                {h.profile.nudge}{" "}
                <button type="button" className="link-button" onClick={() => useCosmos.getState().setDialog("profile")}>
                  {h.profile.nudgeLink}
                </button>
              </p>
            )}
          </section>

          <ExamplesPanel disabled={busy} />
        </div>
      </main>
      <ScrivenerChoice />
    </div>
  );
}
