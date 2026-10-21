import { describe, expect, it } from "vitest";
import { isProjectFilePath } from "./paths";

describe("isProjectFilePath", () => {
  it("accepte les fichiers d'un projet", () => {
    for (const p of ["cosmos.json", "scenario.fountain", "cartes/k3x9a7bq2m.md", "manuscrit/abc.md", "corbeille/x y.md"]) expect(isProjectFilePath(p)).toBe(true);
  });
  it("refuse tout ce qui sortirait du projet ou n'en fait pas partie", () => {
    for (const p of ["../cosmos.json", "cartes/../../x.md", "cartes/../cosmos.md", "cartes/sous/x.md", "cartes/.cache.md", "cartes\\..\\x.md", "/etc/passwd", "verrous/a.json", "markdown/bible.md", "cartes/x.txt", "x.md"]) {
      expect(isProjectFilePath(p)).toBe(false);
    }
  });
});
