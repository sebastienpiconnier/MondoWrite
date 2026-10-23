// @vitest-environment happy-dom
// Molette et trackpad sur le canevas : pincement = zoom (même sur une carte), deux doigts = déplacement,
// sauf dans un contenu qui défile vraiment.

import { afterEach, describe, expect, it, vi } from "vitest";
import { attachCanvasWheel, canScroll, panBy, pinchFactor, pinchView, wheelPixels, wheelZoomFactor, zoomAround, type ScrollBox, type Viewport } from "../canvasWheel";

const wheel = (o: Partial<{ deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; shiftKey: boolean }>) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  shiftKey: false,
  ...o,
});

describe("unités de la molette", () => {
  it("pixels tels quels", () => {
    expect(wheelPixels(wheel({ deltaX: 3, deltaY: -7 }), 800)).toEqual({ dx: 3, dy: -7 });
  });
  it("lignes et pages converties en pixels", () => {
    expect(wheelPixels(wheel({ deltaY: 2, deltaMode: 1 }), 800).dy).toBe(32);
    expect(wheelPixels(wheel({ deltaY: 1, deltaMode: 2 }), 800).dy).toBe(800);
  });
  it("Maj + molette d'une souris : horizontal", () => {
    expect(wheelPixels(wheel({ deltaY: 40, shiftKey: true }), 800)).toEqual({ dx: 40, dy: 0 });
  });
});

describe("zoom par pincement", () => {
  it("écarter les doigts zoome, les rapprocher dézoome", () => {
    expect(pinchFactor(wheel({ deltaY: -5, ctrlKey: true }))).toBeGreaterThan(1);
    expect(pinchFactor(wheel({ deltaY: 5, ctrlKey: true }))).toBeLessThan(1);
  });
  it("un cran de Ctrl + molette reste mesuré", () => {
    const f = pinchFactor(wheel({ deltaY: 100, ctrlKey: true }));
    expect(f).toBeGreaterThan(0.75);
  });
  it("le point sous le pointeur ne bouge pas", () => {
    const vp: Viewport = { x: 100, y: 50, zoom: 1 };
    const next = zoomAround(vp, 2, 300, 250, 0.15, 2);
    expect(next.zoom).toBe(2);
    // Point du canevas sous le pointeur, avant et après.
    expect((300 - vp.x) / vp.zoom).toBeCloseTo((300 - next.x) / next.zoom);
    expect((250 - vp.y) / vp.zoom).toBeCloseTo((250 - next.y) / next.zoom);
  });
  it("bornes respectées, rien ne change à la borne", () => {
    const vp: Viewport = { x: 0, y: 0, zoom: 2 };
    expect(zoomAround(vp, 1.5, 10, 10, 0.15, 2)).toBe(vp);
    expect(zoomAround({ x: 0, y: 0, zoom: 0.2 }, 0.1, 0, 0, 0.15, 2).zoom).toBe(0.15);
  });
});

describe("pincement à deux doigts (écran tactile)", () => {
  it("écarter les doigts zoome, le point entre les doigts reste en place", () => {
    const start: Viewport = { x: 40, y: 20, zoom: 1 };
    const mid = { x: 300, y: 200 };
    const next = pinchView(start, mid, 100, mid, 200, 0.15, 2);
    expect(next.zoom).toBe(2);
    expect((mid.x - next.x) / next.zoom).toBeCloseTo((mid.x - start.x) / start.zoom);
  });
  it("les doigts qui glissent ensemble déplacent la vue", () => {
    const next = pinchView({ x: 0, y: 0, zoom: 1 }, { x: 100, y: 100 }, 80, { x: 130, y: 90 }, 80, 0.15, 2);
    expect(next).toEqual({ x: 30, y: -10, zoom: 1 });
  });
  it("bornes du zoom respectées", () => {
    expect(pinchView({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 100, { x: 0, y: 0 }, 1000, 0.15, 2).zoom).toBe(2);
  });
});

describe("molette qui zoome (réglage)", () => {
  it("un cran de souris : un pas mesuré, dans le bon sens", () => {
    expect(wheelZoomFactor(wheel({ deltaY: 100 }))).toBeCloseTo(Math.pow(2, -0.2));
    expect(wheelZoomFactor(wheel({ deltaY: -100 }))).toBeGreaterThan(1);
  });
});

describe("déplacement", () => {
  it("les doigts poussent le contenu", () => {
    expect(panBy({ x: 0, y: 0, zoom: 1 }, 10, 20)).toEqual({ x: -10, y: -20, zoom: 1 });
  });
});

const box = (o: Partial<ScrollBox>): ScrollBox => ({
  scrollTop: 0,
  scrollLeft: 0,
  scrollHeight: 100,
  scrollWidth: 100,
  clientHeight: 100,
  clientWidth: 100,
  overflowX: "visible",
  overflowY: "visible",
  ...o,
});

describe("un contenu garde le geste seulement s'il défile vraiment", () => {
  it("carte sans contenu caché : non", () => {
    expect(canScroll(box({ overflowY: "auto" }), 0, 10)).toBe(false);
  });
  it("contenu coupé sans barre (overflow hidden) : non", () => {
    expect(canScroll(box({ overflowY: "hidden", scrollHeight: 400 }), 0, 10)).toBe(false);
  });
  it("contenu qui défile, vers le bas : oui ; arrivé en bas : non", () => {
    expect(canScroll(box({ overflowY: "auto", scrollHeight: 400 }), 0, 10)).toBe(true);
    expect(canScroll(box({ overflowY: "auto", scrollHeight: 400, scrollTop: 300 }), 0, 10)).toBe(false);
  });
  it("en haut, vers le haut : non", () => {
    expect(canScroll(box({ overflowY: "auto", scrollHeight: 400 }), 0, -10)).toBe(false);
  });
  it("geste surtout horizontal : on regarde le défilement horizontal", () => {
    expect(canScroll(box({ overflowY: "auto", scrollHeight: 400 }), 30, 2)).toBe(false);
    expect(canScroll(box({ overflowX: "auto", scrollWidth: 400 }), 30, 2)).toBe(true);
  });
});

describe("branchement sur le canevas", () => {
  let detach: (() => void) | undefined;
  afterEach(() => {
    detach?.();
    document.body.innerHTML = "";
  });

  function setup(mode: "pan" | "zoom" = "pan") {
    document.body.innerHTML = `<div id="root"><div class="react-flow"><div class="pane"></div><div class="card-body" style="overflow-y:auto"><p>texte</p></div></div><div class="dock"></div></div>`;
    const root = document.getElementById("root") as HTMLElement;
    let vp: Viewport = { x: 0, y: 0, zoom: 1 };
    const setViewport = vi.fn((next: Viewport) => {
      vp = next;
    });
    detach = attachCanvasWheel({ root, getViewport: () => vp, setViewport, minZoom: 0.15, maxZoom: 2, mode: () => mode });
    return { root, setViewport, view: () => vp };
  }

  const fire = (el: Element, init: WheelEventInit) => {
    const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
    // happy-dom ne reprend pas les champs de MouseEvent dans un WheelEvent : on les pose à la main.
    for (const k of ["ctrlKey", "shiftKey", "clientX", "clientY"] as const) {
      if (init[k] !== undefined) Object.defineProperty(e, k, { value: init[k] });
      else if (!(k in e) || e[k] === undefined) Object.defineProperty(e, k, { value: k.startsWith("client") ? 0 : false });
    }
    el.dispatchEvent(e);
    return e;
  };

  it("deux doigts sur le fond : le canevas se déplace", () => {
    const { root, view } = setup();
    const e = fire(root.querySelector(".pane")!, { deltaX: 15, deltaY: 30 });
    expect(view()).toEqual({ x: -15, y: -30, zoom: 1 });
    expect(e.defaultPrevented).toBe(true);
  });

  it("pincement au-dessus d'une carte : le canevas zoome quand même", () => {
    const { root, view } = setup();
    const e = fire(root.querySelector(".card-body p")!, { deltaY: -10, ctrlKey: true });
    expect(view().zoom).toBeGreaterThan(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("deux doigts sur une carte sans contenu à faire défiler : le canevas se déplace", () => {
    const { root, view } = setup();
    fire(root.querySelector(".card-body p")!, { deltaY: 20 });
    expect(view().y).toBe(-20);
  });

  it("deux doigts sur une carte qui défile : la carte défile, pas le canevas", () => {
    const { root, setViewport } = setup();
    const body = root.querySelector(".card-body") as HTMLElement;
    Object.defineProperty(body, "scrollHeight", { value: 500 });
    Object.defineProperty(body, "clientHeight", { value: 200 });
    const e = fire(body.querySelector("p")!, { deltaY: 20 });
    expect(setViewport).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("réglage « la molette zoome » : la molette seule zoome, comme avant", () => {
    const { root, view } = setup("zoom");
    fire(root.querySelector(".pane")!, { deltaY: -100 });
    expect(view().zoom).toBeGreaterThan(1);
    expect(view().zoom).toBeLessThan(1.3);
  });

  it("réglage « la molette zoome » : une carte qui défile garde la molette", () => {
    const { root, setViewport } = setup("zoom");
    const body = root.querySelector(".card-body") as HTMLElement;
    Object.defineProperty(body, "scrollHeight", { value: 500 });
    Object.defineProperty(body, "clientHeight", { value: 200 });
    fire(body.querySelector("p")!, { deltaY: 20 });
    expect(setViewport).not.toHaveBeenCalled();
  });

  const touch = (el: Element, type: string, points: [number, number][], targets: Element[]) => {
    const list = points.map(([clientX, clientY], i) => ({ clientX, clientY, target: targets[i] ?? el, identifier: i }));
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : list });
    el.dispatchEvent(e);
    return e;
  };

  it("pincement à deux doigts posés sur une carte : le canevas zoome", () => {
    document.body.innerHTML = `<div id="root"><div class="react-flow"><div class="react-flow__node"><p>carte</p></div></div></div>`;
    const root = document.getElementById("root") as HTMLElement;
    let vp: Viewport = { x: 0, y: 0, zoom: 1 };
    detach = attachCanvasWheel({ root, getViewport: () => vp, setViewport: (n) => (vp = n), minZoom: 0.15, maxZoom: 2 });
    const p = root.querySelector("p")!;
    touch(p, "touchstart", [[100, 100], [200, 100]], [p, p]);
    const move = touch(p, "touchmove", [[50, 100], [250, 100]], [p, p]);
    expect(vp.zoom).toBeCloseTo(2);
    expect(move.defaultPrevented).toBe(true);
    touch(p, "touchend", [], []);
    touch(p, "touchmove", [[0, 0], [10, 0]], [p, p]);
    expect(vp.zoom).toBeCloseTo(2);
  });

  it("deux doigts sur le fond : React Flow garde le geste", () => {
    const { root, setViewport } = setup();
    const pane = root.querySelector(".pane")!;
    touch(pane, "touchstart", [[100, 100], [200, 100]], [pane, pane]);
    const move = touch(pane, "touchmove", [[50, 100], [250, 100]], [pane, pane]);
    expect(setViewport).not.toHaveBeenCalled();
    expect(move.defaultPrevented).toBe(false);
  });

  it("hors du canevas (rangée d'outils) : rien n'est intercepté", () => {
    const { root, setViewport } = setup();
    fire(root.querySelector(".dock")!, { deltaY: 20, ctrlKey: true });
    expect(setViewport).not.toHaveBeenCalled();
  });
});
