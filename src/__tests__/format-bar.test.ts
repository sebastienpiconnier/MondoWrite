// Bulle de mise en forme : au doigt (iPad), seulement les actions sur le passage.

import { describe, expect, it } from "vitest";
import { bubbleActions } from "../formatBar";

const keys = (list: { key: string }[]) => list.map((a) => a.key);
const all = ["bold", "italic", "strike", "heading", "bullet", "task", "quote", "create-personnage", "create-lieu", "footnote", "synonyms", "comment", "chutier", "ia-variants"].map((key) => ({ key }));

describe("bulle de mise en forme", () => {
  it("à la souris : tout, dans l'ordre", () => {
    expect(bubbleActions(all, false)).toBe(all);
  });
  it("au doigt : ni gras, ni italique, ni listes… ; fiche, note, synonymes, commenter, chutier et Atelier restent", () => {
    expect(keys(bubbleActions(all, true))).toEqual(["create-personnage", "create-lieu", "footnote", "synonyms", "comment", "chutier", "ia-variants"]);
  });
});
