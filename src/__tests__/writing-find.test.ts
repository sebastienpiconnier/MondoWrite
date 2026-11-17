// @vitest-environment happy-dom
// Recherche des vues d'écriture (#85) : titres des chapitres, chapitre de chaque passage, passage suivant.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findPassages } from "../search";
import { forgetFind, goToPassage, nextIndex, writingUnits } from "../writingFind";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import type { Plan } from "../plan";
import type { CardData } from "../types";

const scene = (id: string, title: string, y: number) => ({ id, position: { x: 0, y }, data: { id, type: "scene", title, html: "" } as CardData });
const nodes = [scene("s1", "Au bois", 0), scene("s2", "La maison", 100), scene("s3", "Le lit", 200)];
const plan: Plan = {
  template: "libre",
  beats: {},
  chapters: [
    { id: "c1", title: "Le loup", scenes: ["s1"] },
    { id: "c2", title: "", scenes: ["s2", "s3"] },
  ],
};
const manuscript = {
  s1: "<p>Le loup rencontre l’enfant.</p>",
  s2: "<p>Tire la chevillette.</p><p>Le loup entre.</p>",
  s3: "<p>Que vous avez de grandes dents, dit-elle au loup.</p>",
};
const units = () => writingUnits({ kind: "roman", screenplay: null, nodes, plan, manuscript } as never);

beforeEach(() => useSettings.setState({ lang: "fr" }));
afterEach(() => forgetFind());

describe("recherche du Manuscrit : chapitres et passages (#85)", () => {
  it("le titre d'un chapitre est cherché, juste avant sa première scène ; chaque scène dit son chapitre", () => {
    const found = findPassages(units(), "loup");
    expect(found.map((p) => [p.kind ?? "text", p.target, p.nth])).toEqual([
      ["chapter", "s1", 0],
      ["text", "s1", 0],
      ["text", "s2", 0],
      ["text", "s3", 0],
    ]);
    expect(found[0].title).toBe("Chapitre 1");
    expect(found[1].context).toBe("Chapitre 1 · Le loup");
    // Un chapitre sans titre n'a pas d'entrée, mais ses scènes portent son numéro.
    expect(found[2].context).toBe("Chapitre 2");
  });

  it("le passage suivant part du dernier choisi, et revient au début au bout ; précédent à rebours", () => {
    const found = findPassages(units(), "loup");
    expect(nextIndex(found, "loup")).toBe(0);
    goToPassage(found[2], "loup");
    expect(useCosmos.getState().manuscriptNth).toBe(0);
    expect(nextIndex(found, "loup")).toBe(3);
    expect(nextIndex(found, "loup", -1)).toBe(1);
    goToPassage(found[3], "loup");
    expect(nextIndex(found, "loup")).toBe(0);
    // Une autre saisie repart du premier passage.
    expect(nextIndex(found, "chevillette")).toBe(0);
  });

  it("un titre de chapitre mène à sa première scène, sans mot à sélectionner", () => {
    const [chapter] = findPassages(units(), "loup");
    goToPassage(chapter, "loup");
    const st = useCosmos.getState();
    expect(st.manuscriptTarget).toBe("s1");
    expect(st.manuscriptNeedle).toBeNull();
  });
});
