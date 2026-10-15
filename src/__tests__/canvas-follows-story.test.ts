// @vitest-environment happy-dom
// Le canevas suit l'ordre du récit : déplacer une scène dans le Plan, le Manuscrit ou le séquencier
// la déplace aussi sur le canevas, sans passer par « Organiser ».

import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_PLAN } from "../plan";
import { reorderSlots } from "../organize";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { moveBlock } from "../screenplay/sequence";
import { storyScenes } from "../book";

const state = () => useCosmos.getState();
const pos = (id: string) => state().nodes.find((n) => n.id === id)!.position;

async function fresh(kind: "roman" | "scenario") {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
  await state().start();
  await state().createProject({ title: "Kerlaouen", kind });
}

describe("reorderSlots", () => {
  it("les places lues de haut en bas vont aux scènes dans l'ordre voulu", () => {
    const cards = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 300, y: 0 },
      { id: "c", x: 0, y: 200 },
    ];
    const moved = reorderSlots(cards, ["c", "a", "b"]);
    expect(Object.fromEntries(moved)).toEqual({ c: { x: 0, y: 0 }, a: { x: 300, y: 0 }, b: { x: 0, y: 200 } });
    expect(reorderSlots(cards, ["a", "b", "c"]).size).toBe(0);
  });
});

describe("le canevas suit le récit", () => {
  beforeEach(() => fresh("roman"));

  it("canevas libre : les scènes échangent leurs places, le reste ne bouge pas, une seule étape", () => {
    const a = state().addTitledCard("scene", "A");
    const b = state().addTitledCard("scene", "B");
    const idea = state().addTitledCard("idee", "Idée");
    const [pa, pb, pi] = [pos(a), pos(b), pos(idea)];
    expect(storyScenes(state().nodes)).toEqual([a, b]);
    const past = state().past.length;
    expect(state().stepInPlan(b, "up")).toBe(true);
    expect(pos(b)).toEqual(pa);
    expect(pos(a)).toEqual(pb);
    expect(pos(idea)).toEqual(pi);
    expect(state().past.length).toBe(past + 1);
    expect(storyScenes(state().nodes)).toEqual([b, a]);
    state().undo();
    expect(pos(a)).toEqual(pa);
  });

  it("canevas rangé : il est rangé de nouveau, chapitres compris", () => {
    const a = state().addTitledCard("scene", "A");
    const b = state().addTitledCard("scene", "B");
    const c = state().addTitledCard("scene", "C");
    state().organizeCanvas();
    expect(state().frames.map((f) => f.data.title)).toEqual(["Scènes"]);
    state().startChapterAt(a);
    expect(state().frames.map((f) => f.data.title)).toContain("Chapitre 1");
    state().moveBookScene(c, a, "before");
    const xs = [c, a, b].map((id) => pos(id).x);
    expect(xs).toEqual([...xs].sort((p, q) => p - q));
  });
});

describe("scénario : le séquencier déplace aussi les cartes", () => {
  beforeEach(() => fresh("scenario"));

  it("ordre du fichier Fountain", () => {
    const a = state().addResearchCard({ title: "INT. PHARE - NUIT", html: "", type: "scene" });
    const b = state().addResearchCard({ title: "EXT. PORT - JOUR", html: "", type: "scene" });
    const [pa, pb] = [pos(a), pos(b)];
    const sp = state().screenplay!;
    const headings = sp.elements.map((e, i) => [e, i] as const).filter(([e]) => e.type === "sceneHeading");
    expect(headings).toHaveLength(2);
    state().setScreenplay({ ...sp, elements: moveBlock(sp.elements, 1, 0) }, true);
    expect(pos(b)).toEqual(pa);
    expect(pos(a)).toEqual(pb);
  });
});
