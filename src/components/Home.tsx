// Écran d'accueil : on choisit le projet sur lequel travailler, ou on en crée un.
// Affiché à chaque lancement et depuis le bouton « Projets » de la barre du haut.

import { useId, useState, type FormEvent } from "react";
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
  const { openProject, openFolder, createProject, tryExample, unlistProject, importScreenplay } = useCosmos.getState();

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("roman");
  const [busy, setBusy] = useState(false);
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
                </li>
              ))}
            </ul>
          )}
          <div className="home-buttons">
            {storage.canPickFolder && (
              <button type="button" className="ghost-button" disabled={busy} onClick={() => run(openFolder)}>
                {h.openFolder}
              </button>
            )}
            <button type="button" className="ghost-button" disabled={busy} title={h.importHint} onClick={() => run(importScreenplay)}>
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

            {storage.canPickFolder && <p className="settings-hint">{h.folderHint}</p>}
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
