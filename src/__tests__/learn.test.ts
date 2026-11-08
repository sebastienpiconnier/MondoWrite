import { describe, expect, it } from "vitest";
import { CANVAS_STEPS, stepsAfter } from "../learn";
import { readLearned } from "../settings";

describe("aides apprises (#59)", () => {
  it("la consigne du canevas attend les trois gestes, dans n'importe quel ordre", () => {
    let done: string[] = [];
    for (const step of ["wire", "card", "wire"]) {
      const r = stepsAfter(done, step, CANVAS_STEPS);
      expect(r.complete).toBe(false);
      done = r.done;
    }
    expect(done).toEqual(["wire", "card"]);
    expect(stepsAfter(done, "type", CANVAS_STEPS).complete).toBe(true);
  });

  it("ne garde des réglages que les aides connues, sans doublon", () => {
    expect(readLearned(["canvasHint", "canvasHint", "inconnue", 3])).toEqual(["canvasHint"]);
    expect(readLearned("canvasHint")).toEqual([]);
    expect(readLearned(undefined)).toEqual([]);
  });
});
