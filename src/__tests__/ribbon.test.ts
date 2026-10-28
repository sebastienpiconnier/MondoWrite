// Ruban du récit : longueur réelle de chaque case, repères attendus, cases loin de leur place.

import { describe, expect, it } from "vitest";
import { buildRibbon, novelGroups, screenplayGroups } from "../ribbon";
import type { ScreenplayElement } from "../screenplay/model";

describe("ruban", () => {
  it("chaque case prend la part de ses scènes ; repères du gabarit ; une case vide n'a pas de longueur", () => {
    const r = buildRibbon("troisActes", [
      { key: "a_setup", scenes: [{ id: "s1", size: 100 }, { id: "s2", size: 100 }] },
      { key: "a_incident", scenes: [] },
      { key: "a_confrontation", scenes: [{ id: "s3", size: 200 }] },
    ]);
    expect(r.measured).toBe(true);
    expect(r.segments.map((s) => [s.key, s.start, s.length])).toEqual([
      ["a_setup", 0, 0.5],
      ["a_incident", 0.5, 0],
      ["a_confrontation", 0.5, 0.5],
    ]);
    expect(r.segments[0].scenes[1]).toEqual({ id: "s2", start: 0.25, length: 0.25 });
    expect(r.markers.map((m) => m.key)).toEqual(["a_setup", "a_incident", "a_confrontation", "a_midpoint", "a_crisis", "a_climax", "a_resolution"]);
    expect(r.markers[1].at).toBe(0.1);
  });

  it("récit peu écrit : une part par scène, et pas de question", () => {
    const r = buildRibbon("troisActes", [{ key: "a_setup", scenes: [{ id: "s1", size: 900 }, { id: "s2", size: 0 }, { id: "s3", size: 0 }] }]);
    expect(r.measured).toBe(false);
    expect(r.segments[0].scenes.map((s) => s.length)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(r.drifts).toEqual([]);
  });

  it("une case qui commence loin de sa place habituelle (plus de dix points), à partir de six scènes", () => {
    const scene = (id: string, size = 100) => ({ id, size });
    const groups = [
      { key: "a_setup", scenes: [scene("1"), scene("2"), scene("3")] },
      { key: "a_incident", scenes: [scene("4")] },
      { key: "a_confrontation", scenes: [scene("5"), scene("6")] },
    ];
    const r = buildRibbon("troisActes", groups);
    // L'élément déclencheur commence à 50 % (attendu vers 10 %), la confrontation à 66 % (vers 25 %).
    expect(r.drifts.map((d) => [d.key, d.sceneId])).toEqual([
      ["a_incident", "4"],
      ["a_confrontation", "5"],
    ]);
    expect(buildRibbon("troisActes", groups.slice(0, 2)).drifts).toEqual([]);
  });

  it("roman : cases du plan puis « À placer » ; plan libre : une seule bande", () => {
    const words = (id: string) => (id === "b" ? 50 : 100);
    const g = novelGroups({ template: "troisActes", beats: { a_climax: ["b"] } }, ["a", "b"], words);
    expect(g.map((x) => [x.key, x.scenes.map((s) => s.id)])).toEqual([
      ["a_setup", []],
      ["a_incident", []],
      ["a_confrontation", []],
      ["a_midpoint", []],
      ["a_crisis", []],
      ["a_climax", ["b"]],
      ["a_resolution", []],
      [null, ["a"]],
    ]);
    expect(novelGroups({ template: "libre", beats: {} }, ["a", "b"], words)).toEqual([{ key: null, scenes: [{ id: "a", size: 100 }, { id: "b", size: 50 }] }]);
  });

  it("scénario : scènes d'avant le gabarit, puis chaque section de case ; une scène sans carte garde son rang", () => {
    const el: ScreenplayElement[] = [
      { type: "sceneHeading", text: "INT. A - JOUR" },
      { type: "section", depth: 1, text: "Acte I [[cosmos:beat:a_setup]]" },
      { type: "sceneHeading", text: "INT. B - JOUR", cardId: "b" },
      { type: "action", text: "…" },
      { type: "section", depth: 1, text: "Déclencheur [[cosmos:beat:a_incident]]" },
    ];
    const { template, groups } = screenplayGroups(el, (s, e) => e - s);
    expect(template).toBe("troisActes");
    expect(groups).toEqual([
      { key: null, scenes: [{ id: "@0", size: 1 }] },
      { key: "a_setup", scenes: [{ id: "b", size: 2 }] },
      { key: "a_incident", scenes: [] },
    ]);
  });
});
