import { describe, expect, it } from "vitest";
import { SHORTCUT_GROUPS } from "../shortcuts";
import { shortcutScore } from "../shortcutSearch";

describe("shortcut search", () => {
  const scene = (q: string) => shortcutScore(q, "Déplacer la scène", "Manuscrit", ["Alt", "↑", "↓"]);
  it("combines localized scope, accent folding and typo tolerance", () => {
    expect(Number.isFinite(scene("manuscrit scene"))).toBe(true);
    for (const typo of ["scnee", "scenee", "sene", "scane"]) {
      expect(scene(typo)).toBeGreaterThan(scene("scène"));
      expect(Number.isFinite(scene(typo))).toBe(true);
    }
    expect(scene("scene introuvable")).toBe(Infinity);
  });
  it("recognizes shortcut names and symbols without matching letters in the action", () => {
    const keys = ["⌘", "⇧", "H"];
    for (const q of ["⌘⇧H", "cmd+shift+h", "Command Shift H"]) {
      expect(shortcutScore(q, "Find and replace", "Everywhere", keys)).toBe(0);
    }
    expect(shortcutScore("cmd+p", "Find and replace", "Everywhere", keys)).toBe(Infinity);
  });
  it("indexes every number in shortcut ranges and accepts a typed minus", () => {
    const score = (query: string, keys: readonly string[]) => shortcutScore(query, "", "", ["Ctrl", ...keys]);
    const lookup = (group: keyof typeof SHORTCUT_GROUPS, item: string) => SHORTCUT_GROUPS[group].find(([id]) => id === item)![1];
    const views = lookup("everywhere", "views");
    expect(score("Ctrl+2", views)).toBe(0);
    expect(score("Ctrl+5", views)).toBe(Infinity);
    expect(score("Ctrl+Alt+2", lookup("text", "heading"))).toBe(0);
    expect(score("Ctrl+-", lookup("manuscript", "pageZoom"))).toBe(0);
  });
  it("recognizes the localized Shift modifier, including on an Apple keyboard", () => {
    expect(shortcutScore("Maj+H", "", "", ["⌘", "⇧", "H"], "Maj")).toBe(0);
    expect(shortcutScore("Mayús+H", "", "", ["Ctrl", "Shift", "H"], "Mayús")).toBe(0);
  });
});
