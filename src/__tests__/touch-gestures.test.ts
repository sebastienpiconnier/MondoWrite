import { describe, expect, it } from "vitest";
import { panelAfterSwipe, pinchKind, swipeDir } from "../touchGestures";

describe("gestes au doigt des vues d'écriture", () => {
  it("écarter deux doigts, les pincer, ou trembler", () => {
    expect(pinchKind(100, 160)).toBe("spread");
    expect(pinchKind(200, 120)).toBe("pinch");
    expect(pinchKind(100, 120)).toBeNull();
    // Écart relatif suffisant mais trop petit en pixels.
    expect(pinchKind(40, 60)).toBeNull();
    expect(pinchKind(0, 100)).toBeNull();
  });

  it("un glisser de côté, assez long, assez vif et surtout horizontal", () => {
    expect(swipeDir(120, 10, 200)).toBe("right");
    expect(swipeDir(-90, 20, 300)).toBe("left");
    expect(swipeDir(40, 0, 100)).toBeNull();
    expect(swipeDir(120, 80, 200)).toBeNull();
    expect(swipeDir(120, 0, 900)).toBeNull();
  });

  it("le volet suit le doigt comme un tiroir", () => {
    expect(panelAfterSwipe("right", { left: false, right: false })).toEqual({ side: "left", open: true });
    expect(panelAfterSwipe("right", { left: false, right: true })).toEqual({ side: "right", open: false });
    expect(panelAfterSwipe("right", { left: true, right: false })).toBeNull();
    expect(panelAfterSwipe("left", { left: true, right: true })).toEqual({ side: "left", open: false });
    expect(panelAfterSwipe("left", { left: false, right: false })).toEqual({ side: "right", open: true });
    expect(panelAfterSwipe("left", { left: false, right: true })).toBeNull();
  });

  it("la Bible n'a qu'un volet, à gauche", () => {
    expect(panelAfterSwipe("right", { left: false })).toEqual({ side: "left", open: true });
    expect(panelAfterSwipe("left", { left: true })).toEqual({ side: "left", open: false });
    expect(panelAfterSwipe("left", { left: false })).toBeNull();
    expect(panelAfterSwipe("right", { left: true })).toBeNull();
  });
});
