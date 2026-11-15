// Détection de la plateforme. Règle du projet : on adapte selon les CAPACITÉS
// (tactile ou non, accès à un sélecteur de dossier) plutôt que selon le nom du système.

/** Vrai dans l'app Tauri (ordinateur ou mobile), faux dans un navigateur. */
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** iOS, iPadOS ou Android (dans Tauri comme dans un navigateur). */
export const isMobileOS = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // L'iPad se présente comme un Mac : on le reconnaît à son écran tactile.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod/i.test(ua) || iPadOS;
};

/** Pointeur principal imprécis (doigt) : pas de survol, cibles plus grandes. */
export const isTouch = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

/** Clavier Apple (⌘, ⌥, ⇧) : seulement pour écrire les raccourcis comme l'auteur les voit sur ses touches. */
export const isAppleKeyboard = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** Ouvre une adresse web dans le navigateur du système (app) ou un nouvel onglet (navigateur). */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri()) {
    // Commande de l'app (src-tauri/src/lib.rs, open_web_url) : sous Linux, elle nettoie l'environnement de
    // l'AppImage avant de lancer le navigateur ; ailleurs, elle passe par le plugin opener. Repli : le plugin direct.
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_web_url", { url });
    } catch (err) {
      console.error(err);
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
