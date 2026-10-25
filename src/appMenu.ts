// Barre des menus du Mac, dans la langue de l'app (le menu par défaut de Tauri est en anglais), avec un
// menu Aide qui ouvre le guide de l'utilisateur. Seulement sur Mac : ailleurs, un menu de l'app ajouterait
// une barre de menus à la fenêtre (Windows, Linux), et l'aide passe par F1 et les Réglages.
// Les éléments « prédéfinis » (copier, coller, masquer, quitter…) gardent le comportement du système ;
// seul leur libellé est traduit. Le menu est refait quand la langue, l'écran ou le type de projet changent.
//
// Règles de la barre des menus d'Apple : toute commande de l'app y figure, avec son raccourci ; une commande
// indisponible est grisée, jamais retirée (`enabled`). Les raccourcis déjà servis par l'app sont rejoués
// (replayShortcut) pour suivre exactement le chemin du clavier ; chaque action ne fait qu'« ouvrir » ou
// « aller à », sans effet si le raccourci clavier arrive aussi.

import { getT } from "./i18n";
import { isAppleKeyboard, isMobileOS, isTauri, openExternal } from "./platform";
import { useSettings } from "./settings";
import { useCosmos } from "./store";
import { openGuide } from "./help";
import { REPO } from "./updates";
import { replayShortcut, sendCommand } from "./commands";
import { storage } from "./storage";
import { vocab } from "./vocab";

async function buildMenu() {
  const { Menu, Submenu, PredefinedMenuItem, MenuItem } = await import("@tauri-apps/api/menu");
  const t = getT();
  const m = t.appMenu;
  const { screen, kind, view: currentView } = useCosmos.getState();
  const inProject = screen === "project";
  const atHome = !inProject;
  const views = vocab(t, kind).views;
  const sep = () => PredefinedMenuItem.new({ item: "Separator" });
  const app = await Submenu.new({
    text: "MondoWrite",
    items: [
      await MenuItem.new({ id: "about", text: m.about, action: () => useCosmos.getState().setDialog("about") }),
      await sep(),
      await MenuItem.new({ id: "settings", text: m.settings, accelerator: "CmdOrCtrl+,", action: () => sendCommand("settings") }),
      await sep(),
      await PredefinedMenuItem.new({ item: "Services", text: m.services }),
      await sep(),
      await PredefinedMenuItem.new({ item: "Hide", text: m.hide }),
      await PredefinedMenuItem.new({ item: "HideOthers", text: m.hideOthers }),
      await PredefinedMenuItem.new({ item: "ShowAll", text: m.showAll }),
      await sep(),
      await PredefinedMenuItem.new({ item: "Quit", text: m.quit }),
    ],
  });
  const file = await Submenu.new({
    text: m.file,
    items: [
      // « Projets » enregistre le projet ouvert puis revient à l'accueil (comme le bouton de la barre du haut).
      await MenuItem.new({ id: "projects", text: m.projects, enabled: inProject, action: () => void useCosmos.getState().closeProject() }),
      await MenuItem.new({
        id: "open-folder",
        text: m.openFolder,
        accelerator: "CmdOrCtrl+O",
        enabled: atHome && storage.canPickFolder,
        action: () => void useCosmos.getState().openFolder(),
      }),
      await MenuItem.new({ id: "import", text: m.importFile, enabled: atHome, action: () => void useCosmos.getState().importFile() }),
      await sep(),
      await MenuItem.new({ id: "save", text: m.save, accelerator: "CmdOrCtrl+S", enabled: inProject, action: () => replayShortcut("s", "KeyS") }),
      await MenuItem.new({ id: "export", text: m.exportMenu, enabled: inProject, action: () => sendCommand("export") }),
      await sep(),
      await PredefinedMenuItem.new({ item: "CloseWindow", text: m.closeWindow }),
    ],
  });
  const edit = await Submenu.new({
    text: m.edit,
    items: [
      await PredefinedMenuItem.new({ item: "Undo", text: m.undo }),
      await PredefinedMenuItem.new({ item: "Redo", text: m.redo }),
      await sep(),
      await PredefinedMenuItem.new({ item: "Cut", text: m.cut }),
      await PredefinedMenuItem.new({ item: "Copy", text: m.copy }),
      await PredefinedMenuItem.new({ item: "Paste", text: m.paste }),
      await PredefinedMenuItem.new({ item: "SelectAll", text: m.selectAll }),
      // Cartes choisies sur le canevas (Copier et Coller, éléments du système, copient aussi les cartes).
      await MenuItem.new({ id: "duplicate", text: m.duplicate, accelerator: "CmdOrCtrl+D", enabled: inProject && currentView === "toile", action: () => replayShortcut("d", "KeyD") }),
      await sep(),
      await MenuItem.new({ id: "find", text: m.find, accelerator: "CmdOrCtrl+F", enabled: inProject, action: () => replayShortcut("f", "KeyF") }),
      await MenuItem.new({
        id: "replace",
        text: m.replace,
        accelerator: "CmdOrCtrl+Shift+H",
        enabled: inProject,
        action: () => replayShortcut("H", "KeyH", true),
      }),
      // Onglet « Vérifier » du Manuscrit ou du Scénario.
      await MenuItem.new({ id: "review", text: m.review, enabled: inProject && currentView === "manuscrit", action: () => sendCommand("review") }),
    ],
  });
  const goTo = (view: "toile" | "plan" | "bible" | "manuscrit") => () => useCosmos.getState().setView(view);
  const view = await Submenu.new({
    text: m.view,
    items: [
      await MenuItem.new({ id: "view-toile", text: views.toile, accelerator: "CmdOrCtrl+1", enabled: inProject, action: goTo("toile") }),
      await MenuItem.new({ id: "view-plan", text: views.plan, accelerator: "CmdOrCtrl+2", enabled: inProject, action: goTo("plan") }),
      await MenuItem.new({ id: "view-bible", text: views.bible, accelerator: "CmdOrCtrl+3", enabled: inProject, action: goTo("bible") }),
      await MenuItem.new({ id: "view-manuscrit", text: views.manuscrit, accelerator: "CmdOrCtrl+4", enabled: inProject, action: goTo("manuscrit") }),
      await sep(),
      // Fenêtre Statistiques : personnages, lieux, qui croise qui (tout le projet, depuis n'importe quelle vue).
      await MenuItem.new({ id: "stats", text: m.stats, enabled: inProject, action: () => useCosmos.getState().setDialog("stats") }),
      await sep(),
      // Zoom de la page du manuscrit ou du scénario : seulement dans cette vue (raccourcis rejoués).
      await MenuItem.new({ id: "zoom-in", text: m.zoomIn, accelerator: "CmdOrCtrl+=", enabled: inProject && currentView === "manuscrit", action: () => replayShortcut("=", "Equal") }),
      await MenuItem.new({ id: "zoom-out", text: m.zoomOut, accelerator: "CmdOrCtrl+-", enabled: inProject && currentView === "manuscrit", action: () => replayShortcut("-", "Minus") }),
      await MenuItem.new({ id: "zoom-reset", text: m.actualSize, accelerator: "CmdOrCtrl+0", enabled: inProject && currentView === "manuscrit", action: () => replayShortcut("0", "Digit0") }),
      await sep(),
      await PredefinedMenuItem.new({ item: "Fullscreen", text: m.fullscreen }),
    ],
  });
  const win = await Submenu.new({
    text: m.window,
    items: [
      await PredefinedMenuItem.new({ item: "Minimize", text: m.minimize }),
      await PredefinedMenuItem.new({ item: "Maximize", text: m.zoom }),
      await sep(),
      await PredefinedMenuItem.new({ item: "BringAllToFront", text: m.bringAll }),
    ],
  });
  const help = await Submenu.new({
    text: m.help,
    items: [
      await MenuItem.new({ id: "guide", text: m.guide, action: () => void openGuide() }),
      await MenuItem.new({ id: "shortcuts", text: m.shortcuts, accelerator: "CmdOrCtrl+/", action: () => useCosmos.getState().setDialog("shortcuts") }),
      await MenuItem.new({
        id: "tour",
        text: m.tour,
        action: () => {
          const { screen, setTour, tryExample } = useCosmos.getState();
          if (screen === "project") setTour(0);
          else void tryExample();
        },
      }),
      await sep(),
      await MenuItem.new({ id: "source", text: m.source, action: () => void openExternal(`https://github.com/${REPO}`) }),
    ],
  });
  const menu = await Menu.new({ items: [app, file, edit, view, win, help] });
  await menu.setAsAppMenu();
  // Le système range alors ses propres entrées (fenêtres ouvertes, recherche dans l'aide) dans ces menus.
  await win.setAsWindowsMenuForNSApp();
  await help.setAsHelpMenuForNSApp();
}

/** À appeler une fois au lancement. */
export function initAppMenu() {
  if (!isTauri() || isMobileOS() || !isAppleKeyboard()) return;
  const build = () =>
    buildMenu().catch(() => {
      /* menu du système gardé tel quel (autorisation manquante, plateforme sans menu) */
    });
  void build();
  useSettings.subscribe((s, prev) => {
    if (s.lang !== prev.lang) void build();
  });
  // Accueil ou projet ouvert (commandes grisées ou non), roman ou scénario (noms des vues), vue en cours (zoom).
  useCosmos.subscribe((s, prev) => {
    if (s.screen !== prev.screen || s.kind !== prev.kind || s.view !== prev.view) void build();
  });
}
