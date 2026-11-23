import { describe, expect, it } from "vitest";
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
});
