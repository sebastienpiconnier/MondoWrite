// Message de l'assistant externe : regroupement et étapes encore annulables.
import { describe, expect, it } from "vitest";
import { noteAssistantWrite, undoableSteps, useAssistantNotice } from "../assistantNotice";

describe("message de l'assistant", () => {
  it("regroupe les écritures rapprochées d'un même client", () => {
    const a = {}, b = {};
    noteAssistantWrite("Claude", a, 1000);
    noteAssistantWrite("Claude", null, 2000);
    noteAssistantWrite("Claude", b, 3000);
    expect(useAssistantNotice.getState().notice).toMatchObject({ count: 3, steps: [a, b] });
    noteAssistantWrite("Claude", null, 30_000);
    expect(useAssistantNotice.getState().notice?.count).toBe(1);
  });

  it("n'annule que les étapes encore au sommet de l'historique", () => {
    const a = {}, b = {}, mine = {};
    expect(undoableSteps([a, b], [{}, a, b])).toBe(2);
    expect(undoableSteps([a, b], [a, b, mine])).toBe(0);
    expect(undoableSteps([a, b], [b])).toBe(1);
  });
});
