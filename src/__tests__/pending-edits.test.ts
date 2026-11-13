import { describe, expect, it, vi } from "vitest";
import { flushPendingEdits, registerPendingEdit } from "../pendingEdits";

describe("frappes en attente", () => {
  it("pousse toutes les frappes inscrites", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = registerPendingEdit(a);
    const offB = registerPendingEdit(b);
    flushPendingEdits();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("ne rappelle pas une frappe retirée", () => {
    const a = vi.fn();
    registerPendingEdit(a)();
    flushPendingEdits();
    expect(a).not.toHaveBeenCalled();
  });

  it("supporte qu'une fonction se retire pendant le vidage", () => {
    let off = () => {};
    const a = vi.fn(() => off());
    off = registerPendingEdit(a);
    const b = vi.fn();
    const offB = registerPendingEdit(b);
    expect(() => flushPendingEdits()).not.toThrow();
    expect(b).toHaveBeenCalledTimes(1);
    offB();
  });
});
