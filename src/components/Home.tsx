// Écran d'accueil : on choisit le projet sur lequel travailler, ou on en crée un.
// Affiché à chaque lancement et depuis le bouton « Projets » de la barre du haut.

import { openGuide } from "../help";
import { LoadingProject } from "./LoadingProject";
import { useEffect, useId, useState, type FormEvent } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { storage, type ProjectEntry } from "../storage";
import { PROJECT_KINDS, type ProjectKind } from "../types";
import { Settings } from "./Settings";
import { BrandMark, Wordmark } from "./BrandMark";
import { ProfilePanel } from "./ProfilePanel";
import { ExamplesPanel } from "./ExamplesPanel";
import { TrashIcon } from "./TrashIcon";

export function Home() {
  const t = useT();
  const h = t.home;
  const lang = useSettings((s) => s.lang);
  const projects = useCosmos((s) => s.projects);
  const hiddenProjects = useCosmos((s) => s.hiddenProjects);
  const openFailed = useCosmos((s) => s.openFailed);
  const notice = useCosmos((s) => s.homeNotice);
  const importNotice = useCosmos((s) => s.importNotice);
  const { openProject, openFolder, createProject, tryExample, hideProject, showProject, deleteProject, importFile, importProjectZip, chooseCloudFolder, leaveCloudFolder, gatherStrayProjects } = useCosmos.getState();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("roman");
  const [busy, setBusy] = useState(false);
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
  const ids = { title: useId(), recent: useId(), fresh: useId() };
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
  const kindHints: Record<ProjectKind, string> = { roman: h.novelHint, scenario: h.screenplayHint };
  const kindNames: Record<ProjectKind, string> = { roman: h.novel, scenario: h.screenplay };

  const deletable = (p: ProjectEntry) => !!storage.deleteProject && p.id !== "@dossier";
  /** Une ligne de projet : l'ouvrir, le masquer (ou le réafficher), le supprimer après confirmation. */
  const projectRow = (p: ProjectEntry, hidden = false) => (
    <li key={p.id} className={hidden ? "is-hidden" : undefined}>
      <button type="button" className="home-project" disabled={busy} onClick={() => run(() => openProject(p.id))}>
        <span className="home-project-title">{nameOf(p)}</span>
        <span className="home-project-meta">
          {p.kind ? t.kinds[p.kind] : ""}
          {p.kind && p.openedAt > 0 ? " · " : ""}
          {p.openedAt > 0 ? fmt(h.openedOn, { date: date.format(p.openedAt) }) : ""}
          {/* Sur ordinateur, le nom du dossier aide à distinguer deux projets du même titre. */}
          {storage.canPickFolder && p.title && p.name !== p.title ? ` · ${p.name}` : ""}
        </span>
      </button>
      {hidden ? (
        <button type="button" className="ghost-button home-show" disabled={busy} aria-label={fmt(h.showAgainLabel, { title: nameOf(p) })} onClick={() => run(() => showProject(p.id))}>
          {h.showAgain}
        </button>
      ) : (
        <button type="button" className="icon-button" disabled={busy} aria-label={fmt(h.hide, { title: nameOf(p) })} title={h.hideHint} onClick={() => run(() => hideProject(p.id))}>
          <EyeOffIcon />
        </button>
      )}
      {deletable(p) && asking !== p.id && (
        <button
          type="button"
          className="icon-button is-danger"
          disabled={busy}
          aria-label={fmt(h.remove, { title: nameOf(p) })}
          title={fmt(h.remove, { title: nameOf(p) })}
          onClick={() => {
            setFailed(null);
            setAsking(p.id);
          }}
        >
          <TrashIcon />
        </button>
      )}
      {asking === p.id && (
        <div className="home-confirm" role="alert">
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
        <div className="actions home-actions">
          <Settings project={false} />
        </div>
      </header>

      <main className="home-main">
        {(openFailed || notice || importNotice) && (
          <p className="home-alert" role="alert">
            {importNotice === "taken"
              ? h.importTaken
              : importNotice === "empty"
                ? h.importEmpty
                : openFailed
                  ? storage.canPickFolder
                    ? t.app.openFailed
                    : h.openFailed
                  : h.notAProject}
          </p>
        )}

        {cloudIssue && (
          <p className="home-alert" role="status">
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
          <p className="home-alert" role="status">
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
          <h1 id={ids.recent}>{h.title}</h1>
          {projects.length === 0 ? (
            <p className="sp-empty">{h.empty}</p>
          ) : (
            <ul className="home-list">
              {projects.map((p) => projectRow(p))}
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
            {storage.canImportZip && (
              <button type="button" className="ghost-button" disabled={busy} title={h.importZipHint} onClick={() => run(importProjectZip)}>
                {h.importZip}
              </button>
            )}
            <button type="button" className="ghost-button" disabled={busy} title={h.importHint} onClick={() => run(importFile)}>
              {h.importFountain}
            </button>
          </div>
        </section>

        {/* Colonne de droite : nouveau projet puis profil. La liste des projets peut s'allonger sans les repousser. */}
        <div className="home-side">
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
          </section>

          <ExamplesPanel disabled={busy} />

          <ProfilePanel />
        </div>
      </main>
    </div>
  );
}

/** Œil barré : masquer un projet de la liste. */
function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9" />
      <path d="M6.6 6.6C3.9 8.3 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
