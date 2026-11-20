// Roman interactif, lot 11 (#91) : ce que le canevas montre de l'histoire (repères des scènes, flèches de choix).

import { describe, expect, it } from "vitest";
import { PARALLEL_GAP, choiceEdgeId, isChoiceEdgeId, marksKey, parallelOffsets, readChoiceEdgeId, readMarksKey, sceneMarks, scenesKey } from "../interactive/storyMap";
import { choiceGraph, withChoices, parseChoices } from "../interactive/choices";
import { verifyStory } from "../interactive/verify";

const scenes = [
  { id: "a1", title: "La cour" },
  { id: "b2", title: "Le puits" },
  { id: "c3", title: "La maison" },
  { id: "d4", title: "Oubliée" },
];
const block = (text: string) => withChoices("<p>Texte.</p>", parseChoices(text));
const manuscript = {
  a1: block("* [Descendre] -> le_puits\n* [Rentrer] -> la_maison"),
  b2: block("* [Remonter] -> la_cour\n* [Plonger] -> nulle_part"),
  c3: block("* [Dormir] -> END"),
};

describe("repères des scènes sur le canevas", () => {
  const graph = choiceGraph(manuscript, scenes);
  const marks = sceneMarks(scenes, graph, manuscript, verifyStory(scenes, manuscript));

  it("départ, fin, choix sans destination, scène inaccessible et sans choix", () => {
    expect(marks.get("a1")).toMatchObject({ start: true, ending: false, deadEnd: false, broken: 0 });
    expect(marks.get("b2")).toMatchObject({ start: false, broken: 1 });
    expect(marks.get("c3")).toMatchObject({ ending: true, deadEnd: false });
    expect(marks.get("d4")).toMatchObject({ deadEnd: true, unreachable: true });
  });

  it("se relisent depuis leur chaîne (une carte ne lit que la sienne)", () => {
    for (const m of marks.values()) expect(readMarksKey(marksKey(m))).toEqual(m);
    expect(marksKey(marks.get("a1"))).toBe("start");
    expect(readMarksKey("")).toBeNull();
    expect(marksKey(undefined)).toBe("");
  });
});

describe("identifiants des flèches de choix", () => {
  it("jamais confondus avec un fil, relus en scène et rang", () => {
    const id = choiceEdgeId("a1", 3);
    expect(isChoiceEdgeId(id)).toBe(true);
    expect(isChoiceEdgeId("k3x9a7bq2m")).toBe(false);
    expect(readChoiceEdgeId(id)).toEqual({ from: "a1", index: 3 });
    expect(readChoiceEdgeId("k3x9a7bq2m")).toBeNull();
    expect(readChoiceEdgeId("choice:a1:x")).toBeNull();
    expect(readChoiceEdgeId("choice::1")).toBeNull();
  });

  it("la clé des scènes change avec un titre ou l'ordre, pas autrement", () => {
    expect(scenesKey(scenes)).toBe(scenesKey(scenes.map((s) => ({ ...s }))));
    expect(scenesKey(scenes)).not.toBe(scenesKey([...scenes].reverse()));
    expect(scenesKey(scenes)).not.toBe(scenesKey([{ ...scenes[0], title: "La cour, la nuit" }, ...scenes.slice(1)]));
  });
});

describe("flèches qui relient les deux mêmes scènes", () => {
  it("une flèche seule n'est pas décalée", () => {
    expect(parallelOffsets([{ from: "a", index: 0, to: "b" }]).size).toBe(0);
  });

  it("l'aller et le retour partent de côtés opposés", () => {
    const off = parallelOffsets([
      { from: "a", index: 0, to: "b" },
      { from: "b", index: 0, to: "a" },
    ]);
    // Mesuré à gauche de chaque flèche : même valeur, donc des côtés opposés une fois les sens retournés.
    expect(off.get("a:0")).toBe(-PARALLEL_GAP / 2);
    expect(off.get("b:0")).toBe(-PARALLEL_GAP / 2);
  });

  it("deux choix vers la même scène se séparent", () => {
    const off = parallelOffsets([
      { from: "a", index: 0, to: "b" },
      { from: "a", index: 1, to: "b" },
      { from: "a", index: 2, to: "c" },
    ]);
    expect(off.get("a:0")).toBe(-PARALLEL_GAP / 2);
    expect(off.get("a:1")).toBe(PARALLEL_GAP / 2);
    expect(off.has("a:2")).toBe(false);
  });
});

describe("étiquettes des choix sur le canevas", () => {
  it("loin du départ quand plusieurs choix partent d'une scène, loin de l'arrivée quand plusieurs y arrivent", async () => {
    const { labelPlaces, LABEL_NEAR_SOURCE, LABEL_NEAR_TARGET } = await import("../interactive/storyMap");
    const places = labelPlaces([
      { from: "a", index: 0, to: "b" },
      { from: "a", index: 1, to: "c" },
      { from: "a", index: 2, to: "d" },
      { from: "b", index: 0, to: "z" },
      { from: "c", index: 0, to: "z" },
      { from: "d", index: 0, to: "z" },
      { from: "z", index: 0, to: "y" },
    ]);
    expect(places.get("a:0")).toBe(LABEL_NEAR_TARGET);
    expect(places.get("b:0")).toBe(LABEL_NEAR_SOURCE);
    expect(places.get("z:0")).toBe(0.5);
  });

  it("le point de la courbe suit le calcul de React Flow (milieu identique)", async () => {
    const { getBezierPath, Position } = await import("@xyflow/react");
    const { bezierPoint } = await import("../edgePoint");
    const a = { x: 10, y: 20 }, b = { x: 300, y: 400 };
    const [, lx, ly] = getBezierPath({ sourceX: a.x, sourceY: a.y, sourcePosition: Position.Bottom, targetX: b.x, targetY: b.y, targetPosition: Position.Top });
    const mid = bezierPoint(a, "bottom", b, "top", 0.5);
    expect(mid.x).toBeCloseTo(lx, 5);
    expect(mid.y).toBeCloseTo(ly, 5);
    expect(bezierPoint(a, "bottom", b, "top", 0)).toEqual(a);
    const end = bezierPoint(a, "bottom", b, "top", 1);
    expect(end.x).toBeCloseTo(b.x, 5);
    expect(end.y).toBeCloseTo(b.y, 5);
  });
});

describe("étiquettes de deux flèches entre les mêmes scènes", () => {
  it("s'échelonnent le long du chemin, aller et retour compris", async () => {
    const { labelPlaces } = await import("../interactive/storyMap");
    const places = labelPlaces([
      { from: "a", index: 0, to: "b" },
      { from: "b", index: 0, to: "a" },
    ]);
    // Mesurées depuis la même scène « a » : l'une près de a, l'autre près de b.
    const fromA = [places.get("a:0")!, 1 - places.get("b:0")!].sort();
    expect(fromA[1] - fromA[0]).toBeGreaterThan(0.4);
  });
});

describe("place libre d'une pilule", () => {
  it("garde sa place voulue sans carte dessous, et s'écarte d'une carte qui la couvrirait", async () => {
    const { freeLabelAt, bezierPoint } = await import("../edgePoint");
    const a = { x: 0, y: 0 }, b = { x: 1000, y: 0 };
    const size = { w: 120, h: 26 };
    expect(freeLabelAt(a, "right", b, "left", 0.5, size, [])).toBe(0.5);
    // Une carte au milieu du chemin : la pilule va ailleurs, hors de la carte.
    const card = { x: 400, y: -60, w: 240, h: 160 };
    const at = freeLabelAt(a, "right", b, "left", 0.5, size, [card]);
    expect(at).not.toBe(0.5);
    const p = bezierPoint(a, "right", b, "left", at);
    expect(p.x + size.w / 2 < card.x || p.x - size.w / 2 > card.x + card.w).toBe(true);
    // Aucune place libre : la place voulue.
    expect(freeLabelAt(a, "right", b, "left", 0.3, size, [{ x: -50, y: -100, w: 1100, h: 200 }])).toBe(0.3);
  });
});
