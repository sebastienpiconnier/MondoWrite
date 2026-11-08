// Barre de mise en forme collée au clavier (téléphone tactile) : boutons montrés et curseur gardé au-dessus d'elle.

import { describe, expect, it } from "vitest";
import { CARET_MARGIN, dockActions, hiddenCaret, SELECTION_ONLY } from "../formatDock";

const keys = (list: { key: string }[]) => list.map((a) => a.key);
const all = ["bold", "italic", "strike", "heading", "bullet", "task", "quote", "revisit", "footnote", "synonyms", "comment", "chutier"].map((key) => ({ key }));

describe("boutons de la barre du clavier", () => {
  it("tous quand du texte est choisi", () => {
    expect(keys(dockActions(all, true))).toEqual(keys(all));
  });
  it("sans sélection, ni Commenter ni Chutier (ils n'agissent que sur un passage)", () => {
    const shown = keys(dockActions(all, false));
    expect(shown).not.toContain("comment");
    expect(shown).not.toContain("chutier");
    expect(shown).toContain("bold");
    expect(shown).toContain("synonyms");
    expect(shown).toHaveLength(all.length - SELECTION_ONLY.size);
  });
  it("garde l'ordre et les objets reçus", () => {
    const list = [{ key: "comment", n: 1 }, { key: "bold", n: 2 }];
    expect(dockActions(list, false)).toEqual([{ key: "bold", n: 2 }]);
    expect(dockActions(list, true)).toBe(list);
  });
});

describe("curseur caché par la barre", () => {
  it("rien à faire quand le curseur est bien au-dessus", () => {
    expect(hiddenCaret(300, 500)).toBe(0);
  });
  it("garde la marge sous le curseur", () => {
    expect(hiddenCaret(500 - CARET_MARGIN, 500)).toBe(0);
    expect(hiddenCaret(500 - CARET_MARGIN + 1, 500)).toBe(1);
  });
  it("remonte du nécessaire quand le curseur passe sous la barre", () => {
    expect(hiddenCaret(540, 500, 12)).toBe(52);
    expect(hiddenCaret(540.2, 500, 12)).toBe(53);
  });
});
