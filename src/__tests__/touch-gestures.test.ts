import { describe, expect, it } from "vitest";
import { isTrackpadPinch, panelAfterSwipe, pinchKind, scaleKind, swipeDir, wheelPinchKind } from "../touchGestures";

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

describe("pincement du trackpad d'un ordinateur (mode focus)", () => {
  it("Mac : l'échelle du geste, au même rapport que les doigts", () => {
    expect(scaleKind(1.4)).toBe("spread");
    expect(scaleKind(0.7)).toBe("pinch");
    expect(scaleKind(1.1)).toBeNull();
    expect(scaleKind(0.9)).toBeNull();
    expect(scaleKind(0)).toBeNull();
    expect(scaleKind(Number.NaN)).toBeNull();
  });

  it("Chrome, Edge, Linux : molette avec Ctrl à petits pas, jamais la molette d'une souris", () => {
    expect(isTrackpadPinch({ ctrlKey: true, deltaMode: 0, deltaY: -4.5 })).toBe(true);
    expect(isTrackpadPinch({ ctrlKey: false, deltaMode: 0, deltaY: -4.5 })).toBe(false);
    expect(isTrackpadPinch({ ctrlKey: true, deltaMode: 0, deltaY: -100 })).toBe(false);
    expect(isTrackpadPinch({ ctrlKey: true, deltaMode: 1, deltaY: -3 })).toBe(false);
    expect(isTrackpadPinch({ ctrlKey: true, deltaMode: 0, deltaY: 0 })).toBe(false);
  });

  it("la somme des pas décide : écarter (deltaY négatif) ou pincer", () => {
    expect(wheelPinchKind(-30)).toBe("spread");
    expect(wheelPinchKind(30)).toBe("pinch");
    expect(wheelPinchKind(-10)).toBeNull();
    expect(wheelPinchKind(10)).toBeNull();
  });
});
