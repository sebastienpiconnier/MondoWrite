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
import { isAppleKeyboard, isMobileOS, isTauri } from "./platform";
import { useSettings } from "./settings";
import { useCosmos } from "./store";
import { vocab } from "./vocab";
import { commandById, commandContext, isEnabled } from "./commandList";

// Les commandes de l'app viennent de commandList.ts (#26), comme celles de la palette (Cmd/Ctrl + K) : ici
// seulement leur place dans les menus, les séparateurs et les éléments propres au système.
async function buildMenu() {
  const { Menu, Submenu, PredefinedMenuItem, MenuItem } = await import("@tauri-apps/api/menu");
  const t = getT();
  const m = t.appMenu;
  const ctx = commandContext();
  const views = vocab(t, ctx.kind).views;
  const sep = () => PredefinedMenuItem.new({ item: "Separator" });
  const item = (id: string) => {
    const c = commandById(id);
    return MenuItem.new({ id, text: c.label(t, views), accelerator: c.accelerator, enabled: isEnabled(c, ctx), action: () => c.run() });
  };
  const app = await Submenu.new({
    text: "MondoWrite",
    items: [
      await item("about"),
      await sep(),
      await item("settings"),
      await sep(),
      await PredefinedMenuItem.new({ item: "Services", text: m.services }),
      await sep(),
      await PredefinedMenuItem.new({ item: "Hide", text: m.hide }),
      await PredefinedMenuItem.new({ item: "HideOthers", text: m.hideOthers }),
      await PredefinedMenuItem.new({ item: "ShowAll", text: m.showAll }),
      await sep(),
      await item("quit"),
    ],
  });
  const file = await Submenu.new({
    text: m.file,
    items: [
      await item("projects"),
      await item("open-folder"),
      await item("import"),
      await sep(),
      await item("save"),
      await item("export"),
      await sep(),
      await item("trash"),
      await item("backups"),
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
      await item("duplicate"),
      await sep(),
      await item("find"),
      await item("replace"),
      await item("goto"),
      await item("keep-version"),
      await item("comment"),
      await item("merge-next"),
      await item("review"),
    ],
  });
  const view = await Submenu.new({
    text: m.view,
    items: [
      await item("commands"),
      await sep(),
      await item("view-toile"),
      await item("view-plan"),
      await item("view-bible"),
      await item("view-manuscrit"),
      await sep(),
      await item("toggle-scenes"),
      await item("toggle-side"),
      await item("focus"),
      await item("highlight"),
      await sep(),
      await item("stats"),
      await sep(),
      await item("zoom-in"),
      await item("zoom-out"),
      await item("zoom-reset"),
      await sep(),
      await PredefinedMenuItem.new({ item: "Fullscreen", text: m.fullscreen }),
    ],
  });
  const canvas = await Submenu.new({
    text: m.canvas,
    items: [await item("new-card"), await item("new-frame"), await sep(), await item("organize"), await item("wires")],
  });
  const format = await Submenu.new({
    text: m.format,
    items: [await item("bold"), await item("italic"), await item("strike"), await item("revisit"), await item("footnote")],
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
    items: [await item("guide"), await item("shortcuts"), await item("tour"), await sep(), await item("bug"), await item("source")],
  });
  const menu = await Menu.new({ items: [app, file, edit, format, view, canvas, win, help] });
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
