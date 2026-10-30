// Fermeture de l'app : ce qui est à l'écran est enregistré avant que la fenêtre ou l'app ne se ferment.
// Sans cela, la frappe des 800 ms d'avant Cmd+Q était perdue (la sauvegarde auto attend une pause), et le
// verrou du projet restait posé 150 s : l'autre appareil voyait le projet « ouvert sur ce Mac ».

import { useCosmos } from "./store";
import { releaseLock } from "./projectLock";
import { isMobileOS, isTauri } from "./platform";

let flushing: Promise<void> | null = null;

/** Enregistre le projet ouvert s'il a changé, puis libère son verrou. Rien si aucun projet n'est ouvert. */
export function flushProject(release = true): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const s = useCosmos.getState();
      if (s.screen !== "project") return;
      if (s.status !== "enregistre") await s.save();
      if (release) await releaseLock(useCosmos.getState().lockedBy === null);
    } catch (err) {
      console.error(err);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Quitter depuis le menu du Mac (Cmd+Q) : enregistrer, puis quitter. */
export async function quitApp(): Promise<void> {
  await flushProject();
  try {
    const { exit } = await import("@tauri-apps/plugin-process");
    await exit(0);
  } catch {
    // Plugin absent : on ferme au moins la fenêtre (l'app se termine avec sa dernière fenêtre).
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().destroy();
  }
}

/** Branché une fois au démarrage. */
export function watchClosing(): void {
  if (typeof document === "undefined") return;
  // App passée en arrière-plan (iPhone, iPad : elle peut y être arrêtée sans prévenir), fenêtre réduite, onglet
  // caché : on enregistre tout de suite, sans libérer le verrou (on revient souvent aussitôt).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushProject(false);
  });
  window.addEventListener("pagehide", () => void flushProject(false));
  // Fenêtre fermée (bouton de la barre de titre, Alt+F4, Cmd+W) : Tauri attend la fin du gestionnaire avant de la
  // détruire.
  if (isTauri() && !isMobileOS()) {
    void import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow().onCloseRequested(async () => {
        await flushProject();
      }),
    );
  }
}
