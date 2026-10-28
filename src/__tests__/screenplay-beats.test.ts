// Cases du gabarit d'un scénario : lues dans les sections du Fountain (canevas), et scène déposée dans une case.

import { describe, expect, it } from "vitest";
import { placeSceneInBeat, screenplayPlan } from "../screenplay/template";
import type { ScreenplayElement } from "../screenplay/model";

const sec = (key: string): ScreenplayElement => ({ type: "section", depth: 1, text: `${key} [[cosmos:beat:${key}]]` });
const scene = (id: string): ScreenplayElement => ({ type: "sceneHeading", text: `INT. ${id.toUpperCase()} - JOUR`, cardId: id });
const action = (text: string): ScreenplayElement => ({ type: "action", text });

const elements: ScreenplayElement[] = [
  scene("a"),
  action("Avant le gabarit."),
  sec("c_opening"),
  scene("b"),
  action("B."),
  { type: "section", depth: 2, text: "Ma section" },
  scene("c"),
  sec("c_theme"),
  scene("d"),
  sec("c_setup"),
];

const order = (els: ScreenplayElement[]) => els.filter((e) => e.type === "sceneHeading").map((e) => e.cardId);

describe("plan d'un scénario lu dans ses sections", () => {
  it("gabarit, scènes de chaque case ; avant la première case : nulle part ; une section de l'auteur ne change pas de case", () => {
    expect(screenplayPlan(elements)).toEqual({ template: "saveTheCat", beats: { c_opening: ["b", "c"], c_theme: ["d"] } });
  });
  it("sans gabarit : plan libre", () => {
    expect(screenplayPlan([scene("a"), scene("b")]).template).toBe("libre");
  });
});

describe("déposer une scène dans une case", () => {
  it("dans une case vide, à la fin d'une case, à une place donnée", () => {
    expect(order(placeSceneInBeat(elements, "a", "c_setup"))).toEqual(["b", "c", "d", "a"]);
    expect(screenplayPlan(placeSceneInBeat(elements, "a", "c_setup")).beats.c_setup).toEqual(["a"]);
    expect(order(placeSceneInBeat(elements, "d", "c_opening"))).toEqual(["a", "b", "c", "d"]);
    expect(screenplayPlan(placeSceneInBeat(elements, "d", "c_opening")).beats.c_opening).toEqual(["b", "c", "d"]);
    expect(screenplayPlan(placeSceneInBeat(elements, "d", "c_opening", 0)).beats.c_opening).toEqual(["d", "b", "c"]);
    expect(screenplayPlan(placeSceneInBeat(elements, "c", "c_opening", 0)).beats.c_opening).toEqual(["c", "b"]);
  });
  it("le texte suit la scène ; même tableau si rien ne bouge ou si la case n'existe pas", () => {
    const moved = placeSceneInBeat(elements, "b", "c_theme");
    expect(moved[moved.findIndex((e) => e.cardId === "b") + 1]).toEqual(action("B."));
    expect(moved).toHaveLength(elements.length);
    expect(placeSceneInBeat(elements, "d", "c_theme")).toBe(elements);
    expect(placeSceneInBeat(elements, "c", "c_opening", 1)).toBe(elements);
    expect(placeSceneInBeat(elements, "b", "inconnue")).toBe(elements);
  });
});
