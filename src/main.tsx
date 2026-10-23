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
import "@xyflow/react/dist/style.css";
import "./styles.css";
import "./styles/palettes.css";
import "./styles/canvas.css";
import "./styles/bible.css";
import "./styles/screenplay.css";
import "./styles/writing.css";
import "./styles/phone.css";
import { App } from "./App";
import { initSettings } from "./settings";
import { isMobileOS, isTauri } from "./platform";
import { initAppMenu } from "./appMenu";
import { watchKeyboard } from "./keyboard";
import { watchTextScale } from "./textScale";

// App de bureau : comportements d'app du système (curseur flèche sur les commandes, voir styles.css).
if (isTauri() && !isMobileOS()) document.documentElement.dataset.app = "desktop";
// Langue et thème appliqués avant le premier rendu (pas de flash clair en mode sombre).
initSettings();
// Mac : barre des menus dans la langue de l'app, avec le menu Aide.
initAppMenu();
// Écran tactile : la hauteur du clavier virtuel (--keyboard-h) laisse le texte défiler au-dessus.
watchKeyboard();
// iPad et iPhone : les textes de l'interface suivent la taille de texte du système (Dynamic Type).
watchTextScale();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// iOS : le pincement ne zoome pas l'application (le canevas gère le sien).
document.addEventListener("gesturestart", (e) => e.preventDefault());
