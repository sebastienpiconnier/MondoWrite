// Commandes de MondoWrite, en une seule liste (#26) : la barre des menus du Mac (appMenu.ts) et la palette de
// commandes (Cmd/Ctrl + K, CommandPalette.tsx) en sont deux lectures. Une commande dit son nom, son raccourci,
// quand elle est possible et ce qu'elle fait ; rien n'est décrit deux fois.
//
// Les éléments propres au système (copier, coller, masquer, plein écran…) restent dans appMenu.ts : ce sont des
// éléments « prédéfinis » de macOS, sans action à nous. Une commande `menu: false` n'est que dans la palette
// (un export direct, l'aide sur les raccourcis…) ; `palette: false`, que dans le menu.

import type { Messages } from "./i18n";
import { isMobileOS, isTauri, openExternal } from "./platform";
import { useSettings } from "./settings";
import { useCosmos } from "./store";
import { openGuide } from "./help";
import { openBugReport } from "./reportBug";
import { REPO } from "./updates";
import { replayShortcut, sendCommand } from "./commands";
import { storage } from "./storage";
import { vocab } from "./vocab";
import { quitApp } from "./closing";
import { nextHighlight } from "./focusText";
import type { View } from "./projectState";
import type { ProjectKind } from "./types";

/** Groupes, dans l'ordre de la barre des menus du Mac ; leur nom vient de `t.appMenu`. */
export const COMMAND_GROUPS = ["app", "file", "edit", "format", "view", "canvas", "help"] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/** Ce qu'il faut savoir pour dire si une commande est possible (lu dans le store au moment de la liste). */
export interface CommandContext {
  screen: "home" | "project";
  view: View;
  kind: ProjectKind;
}

export interface AppCommandItem {
  id: string;
  group: CommandGroup;
  /** Nom affiché (menu, palette) ; `views` : noms des vues selon roman ou scénario. */
  label: (t: Messages, views: ReturnType<typeof vocab>["views"]) => string;
  /** Raccourci, au format des menus de Tauri (« CmdOrCtrl+Shift+H ») ; la palette l'affiche à la façon du système. */
  accelerator?: string;
  /** Possible maintenant ? Absent : toujours. Le menu grise, la palette ne montre pas. */
  enabled?: (c: CommandContext) => boolean;
  /** Offerte sur cet appareil (app de bureau, stockage capable…) ? Absent : partout. Ni menu ni palette sinon. */
  available?: () => boolean;
  run: () => void;
  menu?: boolean;
  palette?: boolean;
}

const inProject = (c: CommandContext) => c.screen === "project";
const atHome = (c: CommandContext) => c.screen === "home";
const writing = (c: CommandContext) => c.screen === "project" && c.view === "manuscrit";
const onCanvas = (c: CommandContext) => c.screen === "project" && c.view === "toile";
const desktop = () => isTauri() && !isMobileOS();
const s = () => useCosmos.getState();
const view = (v: "toile" | "plan" | "bible" | "manuscrit") => () => s().setView(v);

export const COMMANDS: AppCommandItem[] = [
  // MondoWrite
  { id: "about", group: "app", label: (t) => t.appMenu.about, run: () => s().setDialog("about") },
  { id: "settings", group: "app", label: (t) => t.appMenu.settings, accelerator: "CmdOrCtrl+,", run: () => sendCommand("settings") },
  { id: "profile", group: "app", menu: false, label: (t) => t.palette.items.profile, run: () => s().setDialog("profile") },
  // Pas l'élément « Quitter » du système : il fermait l'app sans laisser enregistrer la dernière frappe.
  { id: "quit", group: "app", label: (t) => t.appMenu.quit, accelerator: "CmdOrCtrl+Q", available: desktop, run: () => void quitApp() },

  // Fichier
  // « Projets » enregistre le projet ouvert puis revient à l'accueil (comme le bouton de la barre du haut).
  { id: "projects", group: "file", label: (t) => t.appMenu.projects, enabled: inProject, run: () => void s().closeProject() },
  {
    id: "open-folder",
    group: "file",
    label: (t) => t.appMenu.openFolder,
    accelerator: "CmdOrCtrl+O",
    enabled: atHome,
    available: () => storage.canPickFolder,
    run: () => void s().openFolder(),
  },
  { id: "import", group: "file", label: (t) => t.appMenu.importFile, enabled: atHome, run: () => void s().importFile() },
  { id: "save", group: "file", label: (t) => t.appMenu.save, accelerator: "CmdOrCtrl+S", enabled: inProject, run: () => replayShortcut("s", "KeyS") },
  { id: "export", group: "file", label: (t) => t.appMenu.exportMenu, enabled: inProject, run: () => sendCommand("export") },
  // Exports qui ont leur fenêtre : directement depuis la palette (le menu passe par « Exporter… »).
  { id: "export-script-pdf", group: "file", menu: false, label: (t) => t.palette.items.scriptPdf, enabled: (c) => inProject(c) && c.kind === "scenario", run: () => s().setDialog("scriptPdf") },
  { id: "export-paperback", group: "file", menu: false, label: (t) => t.palette.items.paperback, enabled: (c) => inProject(c) && c.kind === "roman", run: () => s().setDialog("paperback") },
  { id: "export-bible", group: "file", menu: false, label: (t) => t.palette.items.bible, enabled: inProject, run: () => s().setDialog("bibleExport") },
  { id: "trash", group: "file", label: (t) => t.appMenu.trash, enabled: inProject, run: () => s().setDialog("trash") },
  // Sauvegardes hors du projet (#14, #15) : celles du projet ouvert, ou de tous les projets depuis l'accueil.
  {
    id: "backups",
    group: "file",
    label: (t) => t.appMenu.backups,
    available: () => !!storage.backups,
    run: () => s().openBackups(s().screen === "project" ? (storage.backups?.key() ?? null) : null),
  },

  // Édition
  // Cartes choisies sur le canevas (Copier et Coller, éléments du système, copient aussi les cartes).
  { id: "duplicate", group: "edit", label: (t) => t.appMenu.duplicate, accelerator: "CmdOrCtrl+D", enabled: onCanvas, run: () => replayShortcut("d", "KeyD") },
  { id: "find", group: "edit", label: (t) => t.appMenu.find, accelerator: "CmdOrCtrl+F", enabled: inProject, run: () => replayShortcut("f", "KeyF") },
  { id: "replace", group: "edit", label: (t) => t.appMenu.replace, accelerator: "CmdOrCtrl+Shift+H", enabled: inProject, run: () => replayShortcut("H", "KeyH", true) },
  // Aller à une page, une scène, un chapitre (fenêtre « Aller à »).
  { id: "goto", group: "edit", label: (t) => t.appMenu.goto, accelerator: "CmdOrCtrl+G", enabled: inProject, run: () => s().setDialog("goto") },
  { id: "todos", group: "edit", menu: false, label: (t) => t.palette.items.todos, accelerator: "CmdOrCtrl+Shift+L", enabled: inProject, run: () => replayShortcut("L", "KeyL", true) },
  // Versions de la scène en cours (Manuscrit ou Scénario) : la vue sait quelle scène, d'où le raccourci rejoué.
  { id: "keep-version", group: "edit", label: (t) => t.appMenu.keepVersion, accelerator: "CmdOrCtrl+Alt+S", enabled: writing, run: () => replayShortcut("s", "KeyS", false, true) },
  // Commenter le passage sélectionné (texte d'une scène du roman) : le raccourci rejoué dans le texte.
  // Synonymes du mot sous le curseur (#16) : l'éditeur qui a le focus répond au raccourci.
  { id: "synonyms", group: "edit", label: (t) => t.appMenu.synonyms, accelerator: "CmdOrCtrl+Alt+Y", enabled: writing, run: () => replayShortcut("y", "KeyY", false, true) },
  { id: "comment", group: "edit", label: (t) => t.appMenu.comment, accelerator: "CmdOrCtrl+Alt+M", enabled: writing, run: () => replayShortcut("m", "KeyM", false, true) },
  // Fusionner la scène en cours avec la suivante (#23) : la vue sait quelle scène.
  { id: "merge-next", group: "edit", label: (t) => t.appMenu.mergeNext, enabled: writing, run: () => sendCommand("merge-next") },
  // Omettre la scène en cours (#46) : scénario aux pages verrouillées seulement, la vue sait quelle scène.
  { id: "omit-scene", group: "edit", label: (t) => t.appMenu.omitScene, enabled: (c) => writing(c) && c.kind === "scenario" && !!s().revisions.locked, run: () => sendCommand("omit-scene") },
  // Onglet « Vérifier » du Manuscrit ou du Scénario.
  { id: "review", group: "edit", label: (t) => t.appMenu.review, enabled: writing, run: () => sendCommand("review") },

  // Format : les raccourcis des éditeurs de texte, rejoués dans le texte qui a le focus (cartes, Bible, manuscrit).
  { id: "bold", group: "format", label: (t) => t.appMenu.bold, accelerator: "CmdOrCtrl+B", enabled: inProject, run: () => replayShortcut("b", "KeyB") },
  { id: "italic", group: "format", label: (t) => t.appMenu.italic, accelerator: "CmdOrCtrl+I", enabled: inProject, run: () => replayShortcut("i", "KeyI") },
  { id: "strike", group: "format", label: (t) => t.appMenu.strike, accelerator: "CmdOrCtrl+Shift+D", enabled: inProject, run: () => replayShortcut("D", "KeyD", true) },
  { id: "revisit", group: "format", label: (t) => t.appMenu.revisit, accelerator: "CmdOrCtrl+Shift+X", enabled: inProject, run: () => replayShortcut("X", "KeyX", true) },
  // Note de bas de page au curseur (texte d'une scène du roman), raccourci rejoué dans le texte.
  { id: "footnote", group: "format", label: (t) => t.appMenu.footnote, accelerator: "CmdOrCtrl+Alt+F", enabled: inProject, run: () => replayShortcut("f", "KeyF", false, true) },

  // Présentation
  // La palette elle-même : dans le menu seulement (elle ne se propose pas à elle-même).
  { id: "commands", group: "view", palette: false, label: (t) => t.appMenu.commands, accelerator: "CmdOrCtrl+K", run: () => openPalette() },
  { id: "view-toile", group: "view", label: (_t, v) => v.toile, accelerator: "CmdOrCtrl+1", enabled: inProject, run: view("toile") },
  { id: "view-plan", group: "view", label: (_t, v) => v.plan, accelerator: "CmdOrCtrl+2", enabled: inProject, run: view("plan") },
  { id: "view-bible", group: "view", label: (_t, v) => v.bible, accelerator: "CmdOrCtrl+3", enabled: inProject, run: view("bible") },
  { id: "view-manuscrit", group: "view", label: (_t, v) => v.manuscrit, accelerator: "CmdOrCtrl+4", enabled: inProject, run: view("manuscrit") },
  // Volets du Manuscrit et du Scénario, mode focus (1.11.1 : toute commande de l'interface est aussi dans un menu).
  { id: "toggle-scenes", group: "view", label: (t) => t.appMenu.toggleScenes, enabled: writing, run: () => sendCommand("toggle-scenes") },
  { id: "toggle-side", group: "view", label: (t) => t.appMenu.toggleSide, enabled: writing, run: () => sendCommand("toggle-side") },
  { id: "focus", group: "view", label: (t) => t.appMenu.focus, accelerator: "CmdOrCtrl+Shift+F", enabled: writing, run: () => replayShortcut("F", "KeyF", true) },
  {
    id: "highlight",
    group: "view",
    label: (t) => t.appMenu.highlight,
    accelerator: "CmdOrCtrl+Shift+E",
    enabled: writing,
    run: () => {
      const st = useSettings.getState();
      st.setWriting({ ...st.writing, highlight: nextHighlight(st.writing.highlight) });
    },
  },
  // Fenêtre Statistiques : personnages, lieux, qui croise qui (tout le projet, depuis n'importe quelle vue).
  { id: "stats", group: "view", label: (t) => t.appMenu.stats, enabled: inProject, run: () => s().setDialog("stats") },
  // Zoom de la page du manuscrit ou du scénario : seulement dans cette vue (raccourcis rejoués).
  { id: "zoom-in", group: "view", label: (t) => t.appMenu.zoomIn, accelerator: "CmdOrCtrl+=", enabled: writing, run: () => replayShortcut("=", "Equal") },
  { id: "zoom-out", group: "view", label: (t) => t.appMenu.zoomOut, accelerator: "CmdOrCtrl+-", enabled: writing, run: () => replayShortcut("-", "Minus") },
  { id: "zoom-reset", group: "view", label: (t) => t.appMenu.actualSize, accelerator: "CmdOrCtrl+0", enabled: writing, run: () => replayShortcut("0", "Digit0") },

  // Canevas : les boutons de la rangée du bas (1.11.1). N et C restent des touches seules, sans raccourci de menu
  // (un raccourci sans modificateur prendrait la lettre tapée dans une carte).
  { id: "new-card", group: "canvas", label: (t) => t.appMenu.newCard, enabled: onCanvas, run: () => sendCommand("new-card") },
  { id: "new-frame", group: "canvas", label: (t) => t.appMenu.newFrame, enabled: onCanvas, run: () => sendCommand("new-frame") },
  { id: "organize", group: "canvas", label: (t) => t.appMenu.organize, enabled: onCanvas, run: () => s().organizeCanvas() },
  { id: "wires", group: "canvas", label: (t) => t.appMenu.wires, enabled: onCanvas, run: () => s().setHideWires(!s().hideWires) },

  // Aide
  { id: "guide", group: "help", label: (t) => t.appMenu.guide, run: () => void openGuide() },
  { id: "shortcuts", group: "help", label: (t) => t.appMenu.shortcuts, accelerator: "CmdOrCtrl+/", run: () => s().setDialog("shortcuts") },
  {
    id: "tour",
    group: "help",
    label: (t) => t.appMenu.tour,
    run: () => {
      const { screen, setTour, tryExample } = s();
      if (screen === "project") setTour(0);
      else void tryExample();
    },
  },
  { id: "bug", group: "help", label: (t) => t.appMenu.reportBug, run: () => openBugReport() },
  { id: "source", group: "help", label: (t) => t.appMenu.source, run: () => void openExternal(`https://github.com/${REPO}`) },
];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

/** Une commande par son identifiant (appMenu.ts range les siennes avec ses séparateurs). */
export function commandById(id: string): AppCommandItem {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`commande inconnue : ${id}`);
  return c;
}

export function commandContext(): CommandContext {
  const { screen, view, kind } = useCosmos.getState();
  return { screen: screen === "project" ? "project" : "home", view, kind };
}

export const isEnabled = (c: AppCommandItem, ctx: CommandContext) => (c.available?.() ?? true) && (c.enabled?.(ctx) ?? true);

/** Touches d'un raccourci de menu (« CmdOrCtrl+Shift+H » → Mod, Shift, H), pour les afficher comme ailleurs. */
export function acceleratorKeys(accelerator: string): string[] {
  return accelerator.split(/\+(?!$)/).map((k) => (k === "CmdOrCtrl" ? "Mod" : k === "=" ? "+" : k.length === 1 ? k.toUpperCase() : k));
}

/** Repli des noms pour chercher : minuscules, sans accents, espaces simples, sans points de suspension. */
export function foldCommand(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[…«»“”"’'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PaletteEntry {
  id: string;
  label: string;
  group: CommandGroup;
  accelerator?: string;
  /** Texte cherché : nom, groupe et mots en plus, repliés. */
  haystack: string;
}

/**
 * Commandes de la palette qui répondent à la saisie (pur) : chaque mot tapé doit se trouver dans le texte de la
 * commande. Un nom qui commence par la saisie passe d'abord, puis un mot du nom qui commence comme elle, puis le
 * reste, dans l'ordre de la liste.
 */
export function matchCommands(query: string, entries: PaletteEntry[]): PaletteEntry[] {
  const q = foldCommand(query);
  if (!q) return entries;
  const words = q.split(" ");
  const rank = (e: PaletteEntry) => {
    const name = foldCommand(e.label);
    if (name.startsWith(q)) return 0;
    if (name.split(" ").some((w) => w.startsWith(words[0]))) return 1;
    return 2;
  };
  return entries
    .filter((e) => words.every((w) => e.haystack.includes(w)))
    .map((e, i) => ({ e, i, r: rank(e) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.e);
}

/** Nom d'un groupe (celui de la barre des menus du Mac). */
export function groupName(t: Messages, group: CommandGroup): string {
  return group === "app" ? "MondoWrite" : t.appMenu[group];
}

/** Commandes offertes par la palette maintenant (possibles, dans l'ordre de la liste). */
export function paletteEntries(t: Messages, ctx: CommandContext): PaletteEntry[] {
  const views = vocab(t, ctx.kind).views;
  return COMMANDS.filter((c) => c.palette !== false && isEnabled(c, ctx)).map((c) => {
    const label = c.label(t, views).replace(/…$/, "");
    // Mots en plus (synonymes) : « ranger » trouve Organiser, « pdf » les exports…
    const extra = (t.palette.keywords as Record<string, string | undefined>)[c.id] ?? "";
    return { id: c.id, label, group: c.group, accelerator: c.accelerator, haystack: foldCommand(`${label} ${groupName(t, c.group)} ${extra}`) };
  });
}

// Ce qui avait le focus avant la palette : une commande de texte (Gras, Commenter…) y est rejouée.
let returnFocus: HTMLElement | null = null;

/** Ouvre la palette (Cmd/Ctrl + K, menu Présentation du Mac, lien de la recherche). */
export function openPalette() {
  const active = document.activeElement;
  // Le focus est déjà dans une fenêtre (la palette, une autre) : on ne le retient pas.
  returnFocus = active instanceof HTMLElement && active !== document.body && !active.closest("dialog") ? active : null;
  useCosmos.getState().setDialog("commands");
}

/**
 * Lance une commande choisie dans la palette : la fenêtre se ferme, le focus revient où il était, puis la commande
 * part à l'image suivante (un raccourci rejoué suit alors exactement le chemin du clavier).
 */
export function runFromPalette(id: string) {
  const c = BY_ID.get(id);
  useCosmos.getState().setDialog(null);
  const back = returnFocus;
  returnFocus = null;
  const refocus = () => {
    if (back?.isConnected && document.activeElement !== back) back.focus({ preventScroll: true });
  };
  refocus();
  // Deux images : la fenêtre native est fermée (elle rend le focus de son côté), puis la commande part.
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      refocus();
      c?.run();
    }),
  );
}
