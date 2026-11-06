// Fenêtre « Sauvegardes » (#14, #15, backups.ts) : les copies que l'app garde hors des projets, datées, et « Ouvrir
// cette sauvegarde », qui en fait un nouveau projet (jamais par-dessus l'actuel). Ouverte depuis Réglages › Ce projet
// (les sauvegardes du projet ouvert), depuis la page des projets et le menu Fichier du Mac (tous les projets : aussi
// ceux dont le dossier a disparu, c'est là qu'on en a besoin).

import { useEffect, useMemo, useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { storage } from "../storage";
import { backupDate, sortBackups, type BackupInfo } from "../backups";

interface Listed {
  key: string;
  info: BackupInfo | null;
  names: string[];
}

export function BackupsDialog() {
  const t = useT();
  const b = t.backups;
  const lang = useSettings((s) => s.lang);
  const key = useCosmos((s) => s.backupsFor);
  const inProject = useCosmos((s) => s.screen === "project");
  const title = useCosmos((s) => s.title);
  const [list, setList] = useState<Listed[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      const all = (await storage.backups?.list()) ?? [];
      setList(all.map((p) => ({ ...p, names: sortBackups(p.names) })));
      setFailed(false);
    } catch (err) {
      console.error(err);
      setList([]);
      setFailed(true);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const when = useMemo(() => new Intl.DateTimeFormat(lang, { dateStyle: "full", timeStyle: "short" }), [lang]);
  const dateOf = (name: string) => {
    const d = backupDate(name);
    return d ? when.format(d) : name;
  };
  const countOf = (n: number) => (n === 1 ? b.countOne : fmt(b.count, { n }));
  // Le projet ouvert peut se sauvegarder tout de suite, seulement depuis ses propres sauvegardes.
  const own = inProject && !!key && storage.backups?.key() === key;

  const backupNow = async () => {
    setBusy("now");
    setNotice(null);
    const ok = await useCosmos.getState().backupNow();
    setNotice(ok ? b.done : b.failed);
    await load();
    setBusy(null);
  };
  const open = async (projectKey: string, name: string) => {
    setBusy(`${projectKey}/${name}`);
    setNotice(null);
    // Réussie, l'ouverture ferme la fenêtre ; manquée, on le dit ici.
    if (!(await useCosmos.getState().openBackup(projectKey, name))) setNotice(b.openFailed);
    setBusy(null);
  };

  const rows = (p: Listed) => (
    <ul className="backups-list">
      {p.names.map((name) => (
        <li key={name} className="backups-row">
          <span className="backups-date">{dateOf(name)}</span>
          <button type="button" className="ghost-button" disabled={busy !== null} aria-describedby="backups-open-hint" onClick={() => void open(p.key, name)}>
            {busy === `${p.key}/${name}` ? b.opening : b.open}
          </button>
        </li>
      ))}
    </ul>
  );

  const shown = key ? list?.filter((p) => p.key === key) : list;
  return (
    <div className="backups">
      <h2 id="app-dialog-title">{b.title}</h2>
      <p className="settings-hint">{b.intro}</p>
      <p className="settings-hint" id="backups-open-hint">
        {b.openHint}
      </p>
      {own && (
        <p>
          <button type="button" className="ghost-button" disabled={busy !== null} onClick={() => void backupNow()}>
            {b.backupNow}
          </button>
        </p>
      )}
      {notice && (
        <p className="settings-hint" role="status">
          {notice}
        </p>
      )}
      {list === null ? (
        <p className="settings-hint">{b.loading}</p>
      ) : failed ? (
        <p className="settings-hint" role="alert">
          {b.loadFailed}
        </p>
      ) : key ? (
        <section aria-labelledby="backups-this">
          <h3 id="backups-this">{own && title ? title : (shown?.[0]?.info?.title ?? b.thisProject)}</h3>
          {shown && shown[0] && shown[0].names.length > 0 ? rows(shown[0]) : <p className="settings-hint">{b.none}</p>}
          <p>
            <button type="button" className="link-button" onClick={() => useCosmos.setState({ backupsFor: null })}>
              {b.showAll}
            </button>
          </p>
        </section>
      ) : list.length === 0 ? (
        <p className="settings-hint">{b.noneAtAll}</p>
      ) : (
        <section aria-label={b.allProjects}>
          {[...list]
            .sort((x, y) => (y.names[0] ?? "").localeCompare(x.names[0] ?? ""))
            .map((p) => (
              <details key={p.key} className="backups-project">
                <summary>
                  {p.info?.title || b.untitled} <span className="backups-count">{countOf(p.names.length)}</span>
                </summary>
                {rows(p)}
              </details>
            ))}
        </section>
      )}
    </div>
  );
}
