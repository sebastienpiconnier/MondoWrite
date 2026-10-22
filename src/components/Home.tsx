// Écran d'accueil : on choisit le projet sur lequel travailler, ou on en crée un.
// Affiché à chaque lancement et depuis le bouton « Projets » de la barre du haut.

import { useEffect, useId, useState, type FormEvent } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { storage, type ProjectEntry } from "../storage";
import { PROJECT_KINDS, type ProjectKind } from "../types";
import { Settings } from "./Settings";
import { BrandMark, Wordmark } from "./BrandMark";
import { ProfilePanel } from "./ProfilePanel";

export function Home() {
  const t = useT();
  const h = t.home;
  const lang = useSettings((s) => s.lang);
  const projects = useCosmos((s) => s.projects);
  const openFailed = useCosmos((s) => s.openFailed);
  const notice = useCosmos((s) => s.homeNotice);
  const importNotice = useCosmos((s) => s.importNotice);
  const { openProject, openFolder, createProject, tryExample, unlistProject, deleteProject, importFile, importProjectZip, chooseCloudFolder, leaveCloudFolder } = useCosmos.getState();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("roman");
  const [busy, setBusy] = useState(false);
  // Projets synchronisés devenus inaccessibles (iCloud coupé, dossier cloud introuvable) : on le dit, sans alarmer.
  const [cloudIssue, setCloudIssue] = useState<"icloud" | "folder" | null>(null);
  useEffect(() => {
    let alive = true;
    void storage.cloudIssue?.().then((issue) => alive && setCloudIssue(issue));
    return () => {
      alive = false;
    };
  }, [projects]);
  /** Mobile : projet dont la suppression attend une confirmation (deux gestes, jamais un seul toucher). */
  const [asking, setAsking] = useState<string | null>(null);
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

  return (
    <div className="home">
      <header className="topbar">
        <div className="brand">
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
            {cloudIssue === "icloud"
              ? storage.canPickFolder
                ? h.icloudGonePc
                : h.icloudGone
              : fmt(h.cloudGone, { name: storage.cloud?.name() ?? "" })}
          </p>
        )}

        <section className="home-panel" aria-labelledby={ids.recent}>
          <h1 id={ids.recent}>{h.title}</h1>
          {projects.length === 0 ? (
            <p className="sp-empty">{h.empty}</p>
          ) : (
            <ul className="home-list">
              {projects.map((p) => (
                <li key={p.id}>
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
                  {storage.canPickFolder && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={fmt(h.unlist, { title: nameOf(p) })}
                      title={h.unlistHint}
                      onClick={() => unlistProject(p.id)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                  {storage.deleteProject && p.id !== "@dossier" && asking !== p.id && (
                    <button type="button" className="icon-button" disabled={busy} aria-label={fmt(h.remove, { title: nameOf(p) })} title={fmt(h.remove, { title: nameOf(p) })} onClick={() => setAsking(p.id)}>
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                  {asking === p.id && (
                    <div className="home-confirm" role="alert">
                      <p>{fmt(h.removeAsk, { title: nameOf(p) })}</p>
                      <div className="home-buttons">
                        <button type="button" className="ghost-button is-danger" disabled={busy} onClick={() => run(async () => { setAsking(null); await deleteProject(p.id); })}>
                          {h.removeYes}
                        </button>
                        <button type="button" className="ghost-button" onClick={() => setAsking(null)}>
                          {h.removeNo}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
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
            </div>
          </form>
        </section>

        <ProfilePanel />
      </main>
    </div>
  );
}
