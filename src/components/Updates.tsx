// Mises à jour de MondoWrite (app de bureau) : le bandeau qui annonce une nouvelle version, et le bouton
// « Rechercher les mises à jour » (Réglages, À propos). Vrais boutons : souris, doigt et clavier.
// Rien n'est installé sans un clic ; le projet ouvert est enregistré avant l'installation.

import { useEffect } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { openExternal } from "../platform";
import { canUpdate, checkForUpdate, currentVersion, dueForCheck, installUpdate, useUpdates } from "../updates";

/** Enregistre le projet ouvert s'il a des modifications (avant l'installation et le redémarrage). */
async function saveOpenProject() {
  const s = useCosmos.getState();
  if (s.screen === "project" && s.status !== "enregistre") await s.save();
}

/** Vérification au lancement : quelques secondes après l'ouverture, une fois par jour au plus. */
export function useLaunchUpdateCheck() {
  useEffect(() => {
    if (!canUpdate()) return;
    const timer = setTimeout(() => {
      const { updates, setUpdates } = useSettings.getState();
      const now = Date.now();
      if (!dueForCheck(updates.auto, updates.lastCheck, now)) return;
      setUpdates({ lastCheck: now });
      void checkForUpdate();
    }, 5000);
    return () => clearTimeout(timer);
  }, []);
}

const percent = (p: number | null, lang: string) => (p === null ? "" : new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(p));

/** Bouton principal et état d'une mise à jour trouvée (commun au bandeau et aux Réglages). */
function UpdateActions({ onLater }: { onLater?: () => void }) {
  const t = useT().updates;
  const lang = useSettings((s) => s.lang);
  const { status, release, installable, progress, error } = useUpdates();
  if (!release) return null;
  const busy = status === "downloading" || status === "restarting";
  return (
    <>
      <p className="update-text">
        {busy
          ? status === "restarting"
            ? t.restarting
            : progress === null
              ? t.downloading
              : fmt(t.downloadingPercent, { percent: percent(progress, lang) })
          : fmt(t.available, { version: release.version, current: currentVersion })}
      </p>
      {error === "install" && (
        <p className="update-error" role="alert">
          {t.installError}
        </p>
      )}
      {busy && progress !== null && <progress className="update-progress" max={1} value={progress} aria-label={t.downloading} />}
      {!busy && (
        <div className="update-buttons">
          <button type="button" className="home-create" onClick={() => void installUpdate(saveOpenProject)}>
            {installable && error !== "install" ? t.install : t.download}
          </button>
          <button type="button" className="ghost-button" onClick={() => void openExternal(release.url)}>
            {t.notes}
          </button>
          {onLater && (
            <button type="button" className="ghost-button" onClick={onLater}>
              {t.later}
            </button>
          )}
        </div>
      )}
      {!busy && !installable && <p className="settings-hint">{t.downloadHint}</p>}
    </>
  );
}

/** Bandeau en bas de la fenêtre quand une nouvelle version est trouvée ; « Plus tard » le referme jusqu'au prochain lancement. */
export function UpdateNotice() {
  const t = useT().updates;
  const { status, dismissed } = useUpdates();
  const shown = !dismissed && (status === "available" || status === "downloading" || status === "restarting");
  if (!shown) return null;
  return (
    <section className="update-notice" role="status" aria-label={t.aria}>
      <UpdateActions onLater={() => useUpdates.setState({ dismissed: true })} />
    </section>
  );
}

/** Réglages : vérification au lancement, et vérification à la demande avec son résultat. */
export function UpdateSettings({ checkboxId, withAuto = true }: { checkboxId?: string; withAuto?: boolean }) {
  const t = useT().updates;
  const auto = useSettings((s) => s.updates.auto);
  const status = useUpdates((s) => s.status);
  if (!canUpdate()) return null;
  const message = status === "checking" ? t.checking : status === "current" ? fmt(t.current, { version: currentVersion }) : status === "error" ? t.error : "";
  return (
    <>
      {withAuto && (
        <>
          <div className="eyebrow settings-sep">{t.section}</div>
          <label className="settings-check" htmlFor={checkboxId}>
            <input id={checkboxId} type="checkbox" checked={auto} onChange={(e) => useSettings.getState().setUpdates({ auto: e.target.checked })} />
            {t.auto}
          </label>
          <p className="settings-hint">{t.autoHint}</p>
        </>
      )}
      {status === "available" || status === "downloading" || status === "restarting" ? (
        <div className="update-inline">
          <UpdateActions />
        </div>
      ) : (
        <>
          <button
            type="button"
            className="ghost-button"
            disabled={status === "checking"}
            onClick={() => {
              useSettings.getState().setUpdates({ lastCheck: Date.now() });
              void checkForUpdate();
            }}
          >
            {t.check}
          </button>
          <p className="settings-hint" role="status">
            {message}
          </p>
        </>
      )}
    </>
  );
}
