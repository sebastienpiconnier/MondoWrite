// La frise (#173) : rangées, place des cartes, règle, courbes par personnage, déplacements dans le Fountain.

import { describe, expect, it } from "vitest";
import { parse } from "../screenplay/parse";
import { EMPTY_PLAN, type Plan } from "../plan";
import { MIN_CARD, CARD_GAP, characterIssues, layoutScenes, laneCurve, moveSceneBefore, moveSceneToRowEnd, novelRows, rowStarts, rulerTicks, screenplayRows, stepScene } from "../frise";

const script = parse(
  [
    "# Acte 1 [[cosmos:beat:a_setup]]",
    "",
    "INT. PHARE - NUIT [[cosmos:s1]]",
    "",
    "Inès monte.",
    "",
    "EXT. QUAI - JOUR [[cosmos:s2]]",
    "",
    "Le vent.",
    "",
    "# Acte 2 [[cosmos:beat:a_confrontation]]",
    "",
    "INT. CUISINE - NUIT [[cosmos:s3]]",
    "",
    "Yann boit.",
  ].join("\n"),
).elements;
const ids = (els = script) => screenplayRows(els, () => 1, "beats", new Set(["a_setup", "a_confrontation"])).flatMap((r) => r.scenes.map((s) => s.id));

describe("rangées", () => {
  it("scénario : une rangée par case de la structure", () => {
    const rows = screenplayRows(script, () => 2, "beats", new Set(["a_setup", "a_confrontation"]));
    expect(rows.map((r) => [r.key, r.scenes.map((s) => s.id)])).toEqual([
      ["a_setup", ["s1", "s2"]],
      ["a_confrontation", ["s3"]],
    ]);
    expect(rows[0].scenes[0]).toMatchObject({ title: "INT. PHARE - NUIT", size: 2 });
  });
  it("scénario sans structure : une seule rangée", () => {
    const rows = screenplayRows(script, () => 1, "none");
    expect(rows).toHaveLength(1);
    expect(rows[0].scenes).toHaveLength(3);
  });
  it("roman en plan libre avec chapitres : une rangée par chapitre", () => {
    const plan: Plan = { ...EMPTY_PLAN, chapters: [{ id: "c1", title: "Un", scenes: ["a", "b"] }, { id: "c2", title: "Deux", scenes: ["c"] }] };
    const rows = novelRows(plan, ["a", "b", "c"], (id) => id.toUpperCase(), () => 500, 250);
    expect(rows.map((r) => [r.kind, r.key, r.scenes.map((s) => s.id)])).toEqual([
      ["chapter", "c1", ["a", "b"]],
      ["chapter", "c2", ["c"]],
    ]);
    expect(rows[0].scenes[0]).toMatchObject({ title: "A", size: 2, words: 500 });
  });
});

describe("place des cartes", () => {
  const scenes = [
    { id: "a", title: "", size: 10 },
    { id: "b", title: "", size: 0.25 },
    { id: "c", title: "", size: 3 },
  ];
  it("largeur à l'échelle, jamais sous la largeur la plus petite", () => {
    const { slots, width } = layoutScenes(scenes, 16);
    expect(slots.get("a")).toEqual({ x: 0, w: 160 });
    expect(slots.get("b")).toEqual({ x: 160 + CARD_GAP, w: MIN_CARD });
    expect(width).toBe(160 + MIN_CARD + MIN_CARD + 2 * CARD_GAP);
  });
  it("règle : page de départ de chaque scène, étiquettes qui ne se touchent pas", () => {
    const { slots } = layoutScenes(scenes, 16);
    expect(rulerTicks(scenes, slots, 200).map((t) => [t.page, t.label])).toEqual([
      [0, true],
      [10, false],
      [10.3, true],
    ]);
  });
  it("début de chaque rangée sur la ligne commune", () => {
    const { slots } = layoutScenes(scenes, 16);
    expect(rowStarts([{ key: "k1", kind: "beat", scenes: [scenes[0]] }, { key: "k2", kind: "beat", scenes: [] }, { key: null, kind: "none", scenes: [scenes[2]] }], slots).map((r) => r.key)).toEqual(["k1", null]);
  });
});

describe("courbes par personnage", () => {
  const cards: { id: string; type: string; fiche?: Record<string, string> }[] = [
    { id: "ines", type: "personnage", fiche: { principal: "oui" } },
    { id: "yann", type: "personnage" },
    { id: "s1", type: "scene", fiche: { issue: "mieux" } },
    { id: "s2", type: "scene", fiche: { issue: "pire", pov: "yann" } },
    { id: "s3", type: "scene", fiche: { issue: "pire", pov: "ines" } },
    { id: "s4", type: "scene", fiche: { issue: "pire", pov: "yann" } },
  ];
  it("le principal reçoit ses scènes et celles sans point de vue ; un autre, celles qu'il raconte", () => {
    expect([...characterIssues(cards, "ines", true).keys()]).toEqual(["s1", "s3"]);
    expect([...characterIssues(cards, "yann", false).keys()]).toEqual(["s2", "s4"]);
  });
  it("courbe en pixels, au milieu de chaque scène", () => {
    const scenes = ["s1", "s2", "s3", "s4"].map((id) => ({ id, title: "", size: 10 }));
    const { slots } = layoutScenes(scenes, 16);
    const curve = laneCurve(scenes, slots, characterIssues(cards, "yann", false));
    expect(curve?.map((p) => [p.x, p.y])).toEqual([
      [80, 0],
      [80 + 160 + CARD_GAP, -0.5],
      [80 + 2 * (160 + CARD_GAP), -0.5],
      [80 + 3 * (160 + CARD_GAP), -1],
    ]);
  });
});

describe("déplacements dans le scénario", () => {
  it("une scène passe avant une autre, avec son texte, et change de case", () => {
    const moved = moveSceneBefore(script, "s3", "s2");
    expect(ids(moved)).toEqual(["s1", "s3", "s2"]);
    expect(moved.find((e) => e.text === "Yann boit.")).toBeTruthy();
  });
  it("à la fin, et rien ne bouge sur elle-même", () => {
    expect(ids(moveSceneBefore(script, "s1", null))).toEqual(["s2", "s3", "s1"]);
    expect(moveSceneBefore(script, "s2", "s2")).toBe(script);
  });
  it("un cran plus tôt ou plus tard : une section se passe comme une scène", () => {
    const later = stepScene(script, "s2", "later");
    // La section « Acte 2 » passe avant la scène : la scène entre dans l'acte 2.
    const rows = screenplayRows(later, () => 1, "beats", new Set(["a_setup", "a_confrontation"]));
    expect(rows.map((r) => r.scenes.map((s) => s.id))).toEqual([["s1"], ["s2", "s3"]]);
    expect(stepScene(script, "s3", "later")).toBe(script);
  });
  it("à la fin d'une rangée, même vide", () => {
    const keys = new Set(["a_setup", "a_confrontation"]);
    const rows = screenplayRows(script, () => 1, "beats", keys);
    expect(ids(moveSceneToRowEnd(script, "s3", rows[0]))).toEqual(["s1", "s2", "s3"]);
    const toFirst = moveSceneToRowEnd(script, "s3", rows[0]);
    expect(screenplayRows(toFirst, () => 1, "beats", keys).map((r) => r.scenes.map((s) => s.id))).toEqual([["s1", "s2", "s3"], []]);
    const emptied = screenplayRows(toFirst, () => 1, "beats", keys);
    const back = moveSceneToRowEnd(toFirst, "s1", emptied[1]);
    expect(screenplayRows(back, () => 1, "beats", keys).map((r) => r.scenes.map((s) => s.id))).toEqual([["s2", "s3"], ["s1"]]);
  });
});
