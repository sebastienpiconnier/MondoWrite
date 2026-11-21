// @vitest-environment happy-dom
// Mode focus (barre qui revient seulement en haut, largeur de colonne) et fils entre scènes dessinés en flèches,
// avec la scène créée en lâchant un fil dans le vide (roman et scénario).

import { beforeEach, describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { BAR_REVEAL_PX, inRevealZone } from "../components/FocusBar";
import { FOCUS_COLUMNS, nextColumn } from "../focusText";
import { SCENE_ARROW_CLASS, sceneIdsKey, withSceneArrows } from "../sceneArrows";

const state = () => useCosmos.getState();

describe("mode focus", () => {
  it("la barre ne revient que dans la bande du haut", () => {
    expect(inRevealZone(0)).toBe(true);
    expect(inRevealZone(BAR_REVEAL_PX)).toBe(true);
    expect(inRevealZone(BAR_REVEAL_PX + 1)).toBe(false);
    expect(inRevealZone(400)).toBe(false);
    expect(inRevealZone(BAR_REVEAL_PX + 40, 56)).toBe(true);
  });

  it("la largeur de colonne fait le tour des choix", () => {
    expect(nextColumn("narrow")).toBe("medium");
    expect(nextColumn("medium")).toBe("wide");
    expect(nextColumn("wide")).toBe("narrow");
    expect(FOCUS_COLUMNS.map(nextColumn).sort()).toEqual([...FOCUS_COLUMNS].sort());
  });
});

describe("flèches entre scènes", () => {
  const edge = (id: string, source: string, target: string): Edge => ({ id, source, target, type: "floating" });

  it("seuls les fils entre deux scènes reçoivent une pointe", () => {
    const edges = [edge("e1", "s1", "s2"), edge("e2", "s1", "p1")];
    const out = withSceneArrows(edges, new Set(["s1", "s2"]));
    expect(out[0].markerEnd).toBeTruthy();
    expect(out[0].className).toContain(SCENE_ARROW_CLASS);
    expect(out[1]).toBe(edges[1]);
  });

  it("rend le même tableau quand rien ne relie deux scènes", () => {
    const edges = [edge("e1", "s1", "p1")];
    expect(withSceneArrows(edges, new Set(["s1", "s2"]))).toBe(edges);
    expect(withSceneArrows(edges, new Set())).toBe(edges);
  });

  it("la liste des scènes ne dépend pas de la place des cartes", () => {
    const a = [
      { id: "b", type: "card", data: { type: "scene" }, position: { x: 0, y: 0 } },
      { id: "a", type: "card", data: { type: "scene" }, position: { x: 9, y: 9 } },
      { id: "c", type: "card", data: { type: "personnage" }, position: { x: 0, y: 0 } },
      { id: "f", type: "frame", data: {}, position: { x: 0, y: 0 } },
    ];
    expect(sceneIdsKey(a)).toBe("a b");
  });
});

describe("fil lâché dans le vide depuis une scène", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {}, past: [], future: [], trash: [], trashNotice: null });
    await state().start();
    await state().createProject({ title: "Essai", kind: "roman" });
  });

  it("crée une scène reliée, et une seule annulation retire les deux", () => {
    const from = state().addCard({ x: 0, y: 0 }, "scene");
    const past = state().past.length;
    const id = state().addLinkedScene(from, { x: 600, y: 0 });
    expect(id).toBeTruthy();
    const made = state().nodes.find((n) => n.id === id);
    expect(made?.data.type).toBe("scene");
    expect(made?.selected).toBe(true);
    expect(state().edges).toMatchObject([{ source: from, target: id }]);
    expect(state().past.length).toBe(past + 1);
    state().undo();
    expect(state().nodes.map((n) => n.id)).toEqual([from]);
    expect(state().edges).toEqual([]);
  });

  it("ne fait rien depuis une carte inconnue", () => {
    expect(state().addLinkedScene("inconnue", { x: 0, y: 0 })).toBeNull();
    expect(state().nodes).toEqual([]);
  });
});
