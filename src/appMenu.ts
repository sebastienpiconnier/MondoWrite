// Barre des menus du Mac, dans la langue de l'app (le menu par défaut de Tauri est en anglais), avec un
// menu Aide qui ouvre le guide de l'utilisateur. Seulement sur Mac : ailleurs, un menu de l'app ajouterait
// une barre de menus à la fenêtre (Windows, Linux), et l'aide passe par F1 et les Réglages.
// Les éléments « prédéfinis » (copier, coller, masquer, quitter…) gardent le comportement du système ;
// seul leur libellé est traduit. Le menu est refait quand la langue change.

import { getT } from "./i18n";
import { isAppleKeyboard, isMobileOS, isTauri, openExternal } from "./platform";
import { useSettings } from "./settings";
import { useCosmos } from "./store";
import { openGuide } from "./help";
import { REPO } from "./updates";

async function buildMenu() {
  const { Menu, Submenu, PredefinedMenuItem, MenuItem } = await import("@tauri-apps/api/menu");
  const m = getT().appMenu;
  const sep = () => PredefinedMenuItem.new({ item: "Separator" });
  const app = await Submenu.new({
    text: "MondoWrite",
    items: [
      await MenuItem.new({ id: "about", text: m.about, action: () => useCosmos.getState().setDialog("about") }),
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
  const file = await Submenu.new({ text: m.file, items: [await PredefinedMenuItem.new({ item: "CloseWindow", text: m.closeWindow })] });
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
    ],
  });
  const view = await Submenu.new({ text: m.view, items: [await PredefinedMenuItem.new({ item: "Fullscreen", text: m.fullscreen })] });
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
      await MenuItem.new({ id: "shortcuts", text: m.shortcuts, action: () => useCosmos.getState().setDialog("shortcuts") }),
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
}
