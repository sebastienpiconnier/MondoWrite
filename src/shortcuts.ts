// Raccourcis clavier de MondoWrite, rassemblés pour la fenêtre d'aide (Cmd/Ctrl + /). Ce fichier décrit, il
// n'écoute rien : chaque raccourci est géré là où il agit. Le garder à jour quand on en ajoute un.
// « Mod » vaut Cmd sur Mac et Ctrl ailleurs.

export const SHORTCUT_GROUPS = {
  everywhere: [
    ["help", ["Mod", "/"]],
    ["guide", ["F1"]],
    ["settings", ["Mod", ","]],
    ["views", ["Mod", "1…4"]],
    ["search", ["Mod", "F"]],
    ["replace", ["Mod", "Shift", "H"]],
    ["goto", ["Mod", "G"]],
    ["todos", ["Mod", "Shift", "L"]],
    ["save", ["Mod", "S"]],
    ["undo", ["Mod", "Z"]],
    ["redo", ["Mod", "Shift", "Z"]],
  ],
  canvas: [
    ["newCard", ["N"]],
    ["newFrame", ["C"]],
    ["changeType", ["/"]],
    ["mention", ["@"]],
    ["expand", ["Mod", "Entrée"]],
    ["width", ["Alt", "← →"]],
    ["selectArea", ["Shift", "Glisser"]],
    ["selectMore", ["Mod", "Clic"]],
    ["selectAll", ["Mod", "A"]],
    ["deselect", ["Échap"]],
    ["delete", ["Suppr"]],
    ["copyCards", ["Mod", "C"]],
    ["paste", ["Mod", "V"]],
    ["duplicate", ["Mod", "D"]],
  ],
  text: [
    ["bold", ["Mod", "B"]],
    ["italic", ["Mod", "I"]],
    ["strike", ["Mod", "Shift", "D"]],
    ["heading", ["Mod", "Alt", "1…3"]],
    ["bullet", ["Mod", "Shift", "8"]],
    ["ordered", ["Mod", "Shift", "7"]],
    ["task", ["Mod", "Shift", "9"]],
    ["quote", ["Mod", "Shift", "B"]],
    ["revisit", ["Mod", "Shift", "X"]],
    ["markdown", ["**", "*", "#", "-", "[ ]"]],
  ],
  manuscript: [
    ["sceneBreak", ["Entrée", "Entrée"]],
    ["chapterBreak", ["Entrée", "Entrée", "Entrée"]],
    ["focus", ["Mod", "Shift", "F"]],
    ["exitFocus", ["Échap"]],
    ["chutier", ["Mod", "Shift", "K"]],
    ["moveScene", ["Alt", "↑ ↓"]],
    ["pageZoom", ["Mod", "+ − 0"]],
  ],
  screenplay: [
    ["elementType", ["Tab"]],
    ["nextElement", ["Entrée"]],
    ["elementBar", ["Échap"]],
    ["moveScene", ["Alt", "↑ ↓"]],
  ],
} as const;

export type ShortcutGroup = keyof typeof SHORTCUT_GROUPS;
export type ShortcutItem = (typeof SHORTCUT_GROUPS)[ShortcutGroup][number][0];
