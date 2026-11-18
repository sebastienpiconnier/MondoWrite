// Roman interactif, lot 11 (#91) : ce que le canevas montre de l'histoire (repères des scènes, flèches de choix).

import { describe, expect, it } from "vitest";
import { choiceEdgeId, isChoiceEdgeId, marksKey, parallelOffsets, readChoiceEdgeId, readMarksKey, sceneMarks, scenesKey } from "../interactive/storyMap";
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
    expect(off.get("a:0")).toBe(-15);
    expect(off.get("b:0")).toBe(-15);
  });

  it("deux choix vers la même scène se séparent", () => {
    const off = parallelOffsets([
      { from: "a", index: 0, to: "b" },
      { from: "a", index: 1, to: "b" },
      { from: "a", index: 2, to: "c" },
    ]);
    expect(off.get("a:0")).toBe(-15);
    expect(off.get("a:1")).toBe(15);
    expect(off.has("a:2")).toBe(false);
  });
});
