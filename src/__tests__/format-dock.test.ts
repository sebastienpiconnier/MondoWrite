// Barre de mise en forme collée au clavier (téléphone tactile) : boutons montrés et curseur gardé au-dessus d'elle.

import { describe, expect, it } from "vitest";
import { CARET_MARGIN, dockActions, hiddenCaret, rowEdges, SELECTION_ONLY } from "../formatDock";

const keys = (list: { key: string }[]) => list.map((a) => a.key);
const all = ["bold", "italic", "strike", "heading", "bullet", "task", "quote", "revisit", "footnote", "synonyms", "comment", "chutier"].map((key) => ({ key }));

describe("boutons de la barre du clavier", () => {
  it("tous quand du texte est choisi, sauf « à reprendre » là où l'on peut commenter", () => {
    expect(keys(dockActions(all, true))).toEqual(keys(all).filter((k) => k !== "revisit"));
  });
  it("« à reprendre » reste là où l'on ne peut pas commenter (cartes, Bible)", () => {
    const card = all.filter((a) => a.key !== "comment" && a.key !== "chutier");
    expect(keys(dockActions(card, true))).toContain("revisit");
    expect(keys(dockActions(card, false))).toContain("revisit");
  });
  it("sans sélection, ni Commenter ni Chutier (ils n'agissent que sur un passage)", () => {
    const shown = keys(dockActions(all, false));
    expect(shown).not.toContain("comment");
    expect(shown).not.toContain("chutier");
    expect(shown).toContain("bold");
    expect(shown).toContain("synonyms");
    expect(shown).toHaveLength(all.length - SELECTION_ONLY.size - 1);
  });
  it("garde l'ordre et les objets reçus", () => {
    const list = [{ key: "comment", n: 1 }, { key: "bold", n: 2 }];
    expect(dockActions(list, false)).toEqual([{ key: "bold", n: 2 }]);
    expect(dockActions(list, true)).toEqual(list);
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

describe("bords de la rangée", () => {
  it("au début : d'autres boutons à droite seulement", () => {
    expect(rowEdges(0, 390, 600)).toEqual({ before: false, more: true });
  });
  it("au milieu : des deux côtés", () => {
    expect(rowEdges(100, 390, 600)).toEqual({ before: true, more: true });
  });
  it("au bout : à gauche seulement, à 2 px près", () => {
    expect(rowEdges(209, 390, 600)).toEqual({ before: true, more: false });
  });
  it("tout tient : rien de caché", () => {
    expect(rowEdges(0, 390, 390)).toEqual({ before: false, more: false });
  });
});
