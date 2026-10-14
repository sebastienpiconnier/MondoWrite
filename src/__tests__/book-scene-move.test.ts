// Volet du manuscrit : déplacer une scène (glisser, flèches, Alt + flèche). Elle prend la case du gabarit et
// le chapitre de sa nouvelle voisine ; au bord d'un chapitre, un cran change d'abord de chapitre.

import { describe, expect, it } from "vitest";
import { chapterOf, moveSceneTo, planOrder, stepSceneInBook, type Plan } from "../plan";

const scenes = ["s1", "s2", "s3", "s4"];
const libre = (chapters?: Plan["chapters"]): Plan => ({ template: "libre", beats: { libre: scenes }, ...(chapters ? { chapters } : {}) });

describe("moveSceneTo", () => {
  it("avant ou après une autre scène ; même objet si rien ne change", () => {
    const plan = libre();
    expect(planOrder(moveSceneTo(plan, scenes, "s4", "s2", "before"), scenes)).toEqual(["s1", "s4", "s2", "s3"]);
    expect(planOrder(moveSceneTo(plan, scenes, "s1", "s3", "after"), scenes)).toEqual(["s2", "s3", "s1", "s4"]);
    expect(moveSceneTo(plan, scenes, "s2", "s3", "before")).toBe(plan);
    expect(moveSceneTo(plan, scenes, "s2", "s2", "after")).toBe(plan);
    expect(moveSceneTo(plan, scenes, "s2", "inconnue", "after")).toBe(plan);
  });

  it("prend le chapitre et la case de sa voisine", () => {
    const plan: Plan = { template: "troisActes", beats: { a_setup: ["s1", "s2"], a_climax: ["s3", "s4"] }, chapters: [{ id: "c1", title: "", scenes: ["s1", "s2"] }, { id: "c2", title: "", scenes: ["s3", "s4"] }] };
    const next = moveSceneTo(plan, scenes, "s1", "s3", "after");
    expect(next.beats).toEqual({ a_setup: ["s2"], a_climax: ["s3", "s1", "s4"] });
    expect(chapterOf(next, "s1")?.id).toBe("c2");
  });
});

describe("stepSceneInBook", () => {
  const plan = libre([{ id: "c1", title: "", scenes: ["s1", "s2"] }, { id: "c2", title: "", scenes: ["s3", "s4"] }]);

  it("dans un chapitre : échange avec la voisine", () => {
    expect(planOrder(stepSceneInBook(plan, scenes, "s2", "up"), scenes)).toEqual(["s2", "s1", "s3", "s4"]);
  });

  it("au bord d'un chapitre : change de chapitre sans changer de place, puis passe la voisine", () => {
    const once = stepSceneInBook(plan, scenes, "s3", "up");
    expect(planOrder(once, scenes)).toEqual(scenes);
    expect(chapterOf(once, "s3")?.id).toBe("c1");
    const twice = stepSceneInBook(once, scenes, "s3", "up");
    expect(planOrder(twice, scenes)).toEqual(["s1", "s3", "s2", "s4"]);
  });

  it("aux extrémités : rien ne bouge", () => {
    expect(stepSceneInBook(plan, scenes, "s1", "up")).toBe(plan);
    expect(stepSceneInBook(plan, scenes, "s4", "down")).toBe(plan);
  });
});
