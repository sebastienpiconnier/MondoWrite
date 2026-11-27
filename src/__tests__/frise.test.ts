// La frise (#173) : rangées, place des cartes, règle, courbes par personnage, déplacements dans le Fountain.

import { describe, expect, it } from "vitest";
import { parse } from "../screenplay/parse";
import { EMPTY_PLAN, type Plan } from "../plan";
import { characterColors } from "../plotColors";
import { MIN_CARD, CARD_GAP, FRISE_ZOOMS, BASE_PX, playheadAt, zoomLine, characterIssues, fitPxPerPage, spacedOut, spreadCurves, layoutScenes, laneCurve, moveSceneBefore, moveSceneToRowEnd, novelRows, pageToX, rulerMarks, sceneAtX, timecode, rowStarts, rulerTicks, screenplayRows, stepScene } from "../frise";

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

describe("règle de montage", () => {
  const scenes = [
    { id: "a", title: "", size: 10 },
    { id: "b", title: "", size: 1 },
  ];
  const { slots } = layoutScenes(scenes, 16);
  it("une page tombe à sa place dans sa carte, même élargie", () => {
    expect(pageToX(scenes, slots, 0)).toBe(0);
    expect(pageToX(scenes, slots, 5)).toBe(80);
    expect(pageToX(scenes, slots, 10.5)).toBe(160 + CARD_GAP + MIN_CARD / 2);
    expect(pageToX(scenes, slots, 99)).toBe(160 + CARD_GAP + MIN_CARD);
  });
  it("la scène sous le pointeur", () => {
    expect(sceneAtX(scenes, slots, 10)).toBe("a");
    expect(sceneAtX(scenes, slots, 163)).toBe("b");
    expect(sceneAtX(scenes, slots, 9999)).toBe("b");
  });
  it("grandes graduations espacées, petites entre elles", () => {
    const marks = rulerMarks(20, 16);
    expect(marks.filter((m) => m.major).map((m) => m.page)).toEqual([0, 5, 10, 15, 20]);
    expect(marks.length).toBe(21);
  });
  it("code temporel", () => {
    expect(timecode(0)).toBe("0:00");
    expect(timecode(12)).toBe("12:00");
    expect(timecode(65.5)).toBe("1:05:30");
  });
});

describe("frise : ruban agrandi", () => {
  const scenes = [
    { id: "a", title: "A", size: 1 },
    { id: "b", title: "B", size: 3 },
    { id: "c", title: "C", size: 0 },
  ];
  it("fait tenir toutes les scènes dans la largeur donnée", () => {
    const px = fitPxPerPage(scenes, 600, { min: 10, gap: 2 });
    const { width } = layoutScenes(scenes, px, { min: 10, gap: 2 });
    expect(width).toBeLessThanOrEqual(600);
    expect(width).toBeGreaterThan(590);
    expect(fitPxPerPage(scenes, 20, { min: 10, gap: 2 })).toBe(0);
  });
  it("espace les repères de la règle", () => {
    const kept = spacedOut([{ x: 0 }, { x: 30 }, { x: 90 }, { x: 120 }, { x: 200 }], 80);
    expect(kept.map((m) => m.x)).toEqual([0, 90, 200]);
  });
  it("étale une courbe sur l'étendue qu'elle atteint", () => {
    const { scale, zero } = spreadCurves([[{ y: 0 }, { y: 0.5 }, { y: 1 }]]);
    expect(scale(0)).toBe(0);
    expect(scale(1)).toBe(1);
    expect(zero).toBe(0);
    expect(spreadCurves([[{ y: 0.2 }, { y: 0.2 }]]).zero).toBeNull();
  });
});

describe("frise : couleur des personnages", () => {
  it("garde la couleur choisie, attribue une couleur stable sinon", () => {
    const nodes = [
      { id: "p1", data: { type: "personnage" as const, fiche: { couleur: "5" } } },
      { id: "p2", data: { type: "personnage" as const } },
      { id: "s1", data: { type: "scene" as const } },
    ];
    const colors = characterColors(nodes);
    expect(colors.get("p1")).toBe(5);
    expect(colors.get("p2")).toBeGreaterThanOrEqual(1);
    expect(colors.get("p2")).toBeLessThanOrEqual(8);
    expect(colors.has("s1")).toBe(false);
  });
});

describe("frise : zoom et tête de lecture", () => {
  it("le zoom agrandit aussi la largeur minimale des cartes", () => {
    const small = zoomLine(0);
    const big = zoomLine(FRISE_ZOOMS.length - 1);
    expect(small.px).toBe(BASE_PX * FRISE_ZOOMS[0]);
    expect(big.min).toBeGreaterThan(small.min);
    const scenes = [{ id: "a", title: "A", size: 1 }, { id: "b", title: "B", size: 1 }];
    const w = (z: number) => layoutScenes(scenes, zoomLine(z).px, { min: zoomLine(z).min }).width;
    // Des scènes d'une page, toutes à la largeur minimale : chaque cran change quand même la longueur de la ligne.
    for (let z = 1; z < FRISE_ZOOMS.length; z++) expect(w(z)).toBeGreaterThan(w(z - 1));
    expect(zoomLine(99)).toEqual(big);
  });
  it("la tête de lecture suit la scène passée sous la ligne de lecture", () => {
    const tops = [{ id: "a", top: 100 }, { id: "b", top: 300 }];
    expect(playheadAt(50, tops, 500)).toEqual({ id: "a", frac: 0 });
    expect(playheadAt(200, tops, 500)).toEqual({ id: "a", frac: 0.5 });
    expect(playheadAt(400, tops, 500)).toEqual({ id: "b", frac: 0.5 });
    expect(playheadAt(900, tops, 500)).toEqual({ id: "b", frac: 1 });
    expect(playheadAt(10, [], 0)).toBeNull();
  });
});
