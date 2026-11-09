import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-serif/400.css";
import "@fontsource/playfair-display/700.css"; // logotype « Mondo »
import "@fontsource/playfair-display/400-italic.css"; // logotype « Write »
import "@fontsource/playfair-display/400.css"; // slogan sous le logotype
import "@fontsource/courier-prime/400.css"; // en-têtes de scène (scénario)
import "@fontsource/courier-prime/700.css";
// Polices de la page du Manuscrit au choix (#24, OFL) : les fichiers ne sont lus que si la police est choisie.
import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/literata/700.css";
import "@fontsource/eb-garamond/400.css";
import "@fontsource/eb-garamond/400-italic.css";
import "@fontsource/eb-garamond/700.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/400-italic.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import "./styles/palettes.css";
import "./styles/canvas.css";
import "./styles/bible.css";
import "./styles/screenplay.css";
import "./styles/writing.css";
import "./styles/phone.css";
import { App } from "./App";
import { initSettings, useSettings } from "./settings";
import { mcpAvailable, mcpWritable, startMcpBridge, syncMcpAccess } from "./mcp";
import { publishOpenProject, useCosmos } from "./store";
import { storage } from "./storage";
import { initKeychain } from "./secrets";
import { isAppleKeyboard, isMobileOS, isTauri } from "./platform";
import { initAppMenu } from "./appMenu";
import { watchKeyboard } from "./keyboard";
import { watchTextScale } from "./textScale";
import { watchFullscreen } from "./fullscreen";
import { watchClosing } from "./closing";
import { watchErrors } from "./bugReport";

// Dernières erreurs gardées pour « Signaler un bug » (À propos).
watchErrors();

// App de bureau : comportements d'app du système (curseur flèche sur les commandes, voir styles.css).
if (isTauri() && !isMobileOS()) {
  document.documentElement.dataset.app = "desktop";
  // Mac : la barre de titre est intégrée (titleBarStyle Overlay) ; les boutons de fenêtre sont sur la barre du haut.
  if (isAppleKeyboard()) {
    document.documentElement.dataset.platform = "mac";
    // En plein écran, plus de boutons de fenêtre : le logo revient au bord gauche.
    void watchFullscreen();
  }
}
// Langue et thème appliqués avant le premier rendu (pas de flash clair en mode sombre).
initSettings();
// App : les clés d'IA et de photos passent dans le trousseau du système quand il y en a un (#30).
if (isTauri()) void initKeychain();
// Mac : barre des menus dans la langue de l'app, avec le menu Aide.
initAppMenu();
// Écran tactile : la hauteur du clavier virtuel (--keyboard-h) laisse le texte défiler au-dessus.
watchKeyboard();
// Fenêtre fermée, Cmd+Q, app passée en arrière-plan : le projet ouvert est enregistré avant.
watchClosing();
// iPad et iPhone : les textes de l'interface suivent la taille de texte du système (Dynamic Type).
watchTextScale();
// Assistant externe (#62) : seuls les projets ouverts à l'assistant gardent leur instantané ; un accès donné à
// l'instant écrit celui du projet ouvert sans attendre le prochain enregistrement.
if (mcpAvailable()) {
  void syncMcpAccess(useSettings.getState().mcp);
  useSettings.subscribe((s, prev) => {
    if (s.mcp === prev.mcp) return;
    void syncMcpAccess(s.mcp);
    publishOpenProject(true);
  });
  // Écriture : les demandes de l'assistant sont appliquées par l'app, seulement pour un projet ouvert en écriture.
  startMcpBridge(() => {
    const id = storage.current?.();
    return useCosmos.getState().screen === "project" && id && mcpWritable(useSettings.getState().mcp, id) ? id : null;
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// iOS : le pincement ne zoome pas l'application (le canevas gère le sien).
document.addEventListener("gesturestart", (e) => e.preventDefault());
