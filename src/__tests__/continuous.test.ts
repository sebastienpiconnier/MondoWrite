// Lecture continue du manuscrit : un titre quand un chapitre commence, « * * * » entre deux scènes du même
// chapitre (ou hors chapitre), rien entre deux chapitres.

import { describe, expect, it } from "vitest";
import { continuousBlocks } from "../components/ContinuousBook";
import type { Plan } from "../plan";

describe("continuousBlocks", () => {
  it("chapitres numérotés, séparateurs entre scènes d'un même chapitre", () => {
    const plan: Plan = { template: "libre", beats: { libre: ["a", "b", "c", "d"] }, chapters: [{ id: "c1", title: "Le bois", scenes: ["a", "b"] }, { id: "c2", title: "", scenes: ["c", "d"] }] };
    expect(continuousBlocks(["a", "b", "c", "d"], plan)).toEqual([
      { id: "a", chapter: { id: "c1", n: 1, title: "Le bois" }, breakBefore: false },
      { id: "b", chapter: null, breakBefore: true },
      { id: "c", chapter: { id: "c2", n: 2, title: "" }, breakBefore: false },
      { id: "d", chapter: null, breakBefore: true },
    ]);
  });

  it("sans chapitres : des séparateurs seulement, et pas avant la première scène", () => {
    const blocks = continuousBlocks(["a", "b"], { template: "libre", beats: {} });
    expect(blocks.map((b) => b.breakBefore)).toEqual([false, true]);
  });
});
