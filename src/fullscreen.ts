import { isTauri } from "./platform";

// Mac, plein écran : les boutons de fenêtre disparaissent, la barre du haut n'a plus à leur laisser de place
// (styles.css, `html[data-fullscreen]`). Suivi au redimensionnement de la fenêtre (entrée et sortie du plein écran).

export async function watchFullscreen() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const apply = async () => {
      const full = await win.isFullscreen();
      if (full) document.documentElement.dataset.fullscreen = "";
      else delete document.documentElement.dataset.fullscreen;
    };
    await apply();
    await win.onResized(() => void apply());
  } catch {
    // Fenêtre inaccessible : la place des boutons reste réservée, comme avant.
  }
}

/** F11 (Windows, Linux) : bascule le plein écran de la fenêtre, ou de la page dans un navigateur. */
export async function toggleFullscreen() {
  try {
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.setFullscreen(!(await win.isFullscreen()));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (document.fullscreenEnabled) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Refusé (permission, navigateur) : rien ne change.
  }
}
