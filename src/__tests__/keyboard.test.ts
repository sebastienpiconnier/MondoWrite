// @vitest-environment happy-dom
// Clavier virtuel : la hauteur masquée vient de visualViewport et alimente --keyboard-h.

import { afterEach, describe, expect, it, vi } from "vitest";
import { hiddenByKeyboard, watchKeyboard } from "../keyboard";

describe("hauteur masquée par le clavier", () => {
  it("zéro sans clavier", () => {
    expect(hiddenByKeyboard(1024, 1024, 0)).toBe(0);
  });
  it("la différence entre la fenêtre et la zone visible", () => {
    expect(hiddenByKeyboard(1024, 700, 0)).toBe(324);
  });
  it("tient compte du défilement de la zone visible", () => {
    expect(hiddenByKeyboard(1024, 700, 40)).toBe(284);
  });
  it("jamais négative (zone visible plus grande que la fenêtre)", () => {
    expect(hiddenByKeyboard(800, 820, 0)).toBe(0);
  });
  it("arrondit au pixel", () => {
    expect(hiddenByKeyboard(1024, 700.4, 0)).toBe(324);
  });
});

describe("suivi du clavier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--keyboard-h");
  });

  const fakeViewport = (height: number) => {
    const listeners = new Map<string, () => void>();
    return {
      height,
      offsetTop: 0,
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
      fire: (type: string) => listeners.get(type)?.(),
      count: () => listeners.size,
    };
  };

  it("ne fait rien sans écran tactile", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const stop = watchKeyboard();
    expect(document.documentElement.style.getPropertyValue("--keyboard-h")).toBe("");
    stop();
  });

  it("pose --keyboard-h au tactile, le met à jour, puis le retire à l'arrêt", () => {
    const vv = fakeViewport(1024);
    vi.stubGlobal("visualViewport", vv);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    Object.defineProperty(window, "innerHeight", { value: 1024, configurable: true });
    const stop = watchKeyboard();
    expect(document.documentElement.style.getPropertyValue("--keyboard-h")).toBe("0px");
    vv.height = 700;
    vv.fire("resize");
    expect(document.documentElement.style.getPropertyValue("--keyboard-h")).toBe("324px");
    stop();
    expect(vv.count()).toBe(0);
    expect(document.documentElement.style.getPropertyValue("--keyboard-h")).toBe("");
  });
});
