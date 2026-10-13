// @vitest-environment happy-dom
// Cadres verrouillés : « Organiser » n'y touche pas, ni à leurs cartes ; le verrou s'enregistre et s'annule.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { heldCardIds, useCosmos } from "../store";
import { useSettings } from "../settings";
import { META_FILE, storage } from "../storage";
import { frameBox } from "../projectState";

const state = () => useCosmos.getState();
const at = (id: string) => state().nodes.find((n) => n.id === id)!.position;
const frameOf = (id: string) => state().frames.find((f) => f.id === id)!;
const deselect = () => useCosmos.setState({ nodes: state().nodes.map((n) => ({ ...n, selected: false })) });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {}, past: [], future: [] });
  await state().start();
  await state().createProject({ title: "Essai", kind: "roman" });
});
afterEach(() => {
  vi.useRealTimers();
  useSettings.setState({ lang: "en" });
});

/** Une carte Personnage dans un cadre « Le phare », verrouillé, et deux idées en vrac ailleurs. */
const lockedSetup = () => {
  const inside = state().addCard({ x: 100, y: 100 }, "personnage");
  deselect();
  useCosmos.setState({ nodes: state().nodes.map((n) => (n.id === inside ? { ...n, selected: true } : n)) });
  const frame = state().addFrame({ x: 0, y: 0 });
  state().updateFrame(frame, { title: "Le phare" });
  state().toggleFrameLock(frame);
  deselect();
  const a = state().addCard({ x: 900, y: 900 });
  const b = state().addCard({ x: 1400, y: 300 }, "lieu");
  return { inside, frame, a, b };
};

describe("verrouiller un cadre", () => {
  it("le cadre verrouillé ne se déplace ni ne se supprime", () => {
    const frame = state().addFrame({ x: 300, y: 300 });
    state().toggleFrameLock(frame);
    expect(frameOf(frame)).toMatchObject({ draggable: false, deletable: false, data: { locked: true } });
    state().deleteFrame(frame);
    expect(state().frames).toHaveLength(1);
    state().toggleFrameLock(frame);
    expect(frameOf(frame).data.locked).toBeUndefined();
    expect(frameOf(frame)).toMatchObject({ draggable: true, deletable: true });
  });

  it("Organiser laisse le cadre et ses cartes en place, range le reste dessous", () => {
    const { inside, frame, a, b } = lockedSetup();
    const before = { card: { ...at(inside) }, box: frameBox(frameOf(frame)) };
    state().organizeCanvas();
    expect(at(inside)).toEqual(before.card);
    expect(frameBox(frameOf(frame))).toEqual(before.box);
    expect(frameOf(frame).data).toMatchObject({ title: "Le phare", locked: true });
    // Les autres cartes sont rangées sous le cadre verrouillé, dans des cadres neufs.
    const bottom = before.box.y + before.box.height;
    for (const id of [a, b]) expect(at(id).y).toBeGreaterThan(bottom);
    for (const f of state().frames.filter((f) => f.id !== frame)) expect(frameBox(f).y).toBeGreaterThan(bottom);
    // Aucun cadre de type « Personnages » n'a été créé pour la carte du cadre verrouillé.
    expect(state().frames.some((f) => f.data.title === "Personnages")).toBe(false);
  });

  it("le verrou s'annule et se rétablit", () => {
    const frame = state().addFrame({ x: 300, y: 300 });
    state().toggleFrameLock(frame);
    state().undo();
    expect(frameOf(frame).data.locked).toBeUndefined();
    state().redo();
    expect(frameOf(frame).data.locked).toBe(true);
  });

  it("s'enregistre dans cosmos.json et se relit", async () => {
    const { frame } = lockedSetup();
    await state().save();
    const meta = JSON.parse((await storage.readAll())![META_FILE]);
    expect(meta.frames.find((f: { id: string }) => f.id === frame)).toMatchObject({ title: "Le phare", locked: true });
    // Un cadre libre n'écrit pas la clé.
    const free = state().addFrame({ x: 3000, y: 3000 });
    await state().save();
    const again = JSON.parse((await storage.readAll())![META_FILE]);
    expect(again.frames.find((f: { id: string }) => f.id === free)).not.toHaveProperty("locked");
  });
});

describe("les cartes d'un cadre verrouillé", () => {
  it("ne se déplacent plus (glisser, flèches) ; les autres, si, dans le même geste", () => {
    const { inside, frame, a } = lockedSetup();
    const before = { ...at(inside) };
    expect(heldCardIds(state().nodes, state().frames)).toEqual(new Set([inside]));
    state().onNodesChange([
      { type: "position", id: inside, position: { x: before.x + 300, y: before.y + 300 }, dragging: false },
      { type: "position", id: a, position: { x: 50, y: 2000 }, dragging: false },
    ]);
    expect(at(inside)).toEqual(before);
    expect(at(a)).toEqual({ x: 50, y: 2000 });
    // Déverrouillé : la carte bouge de nouveau.
    state().toggleFrameLock(frame);
    expect(heldCardIds(state().nodes, state().frames).size).toBe(0);
    state().onNodesChange([{ type: "position", id: inside, position: { x: 10, y: 20 }, dragging: false }]);
    expect(at(inside)).toEqual({ x: 10, y: 20 });
  });

  it("restent modifiables et supprimables", () => {
    const { inside } = lockedSetup();
    state().updateCard(inside, { title: "Inès" });
    expect(state().nodes.find((n) => n.id === inside)!.data.title).toBe("Inès");
    state().deleteCard(inside);
    expect(state().nodes.some((n) => n.id === inside)).toBe(false);
  });

  it("une carte déposée dans un cadre verrouillé y reste tenue", () => {
    const { frame, a } = lockedSetup();
    const box = frameBox(frameOf(frame));
    state().onNodesChange([{ type: "position", id: a, position: { x: box.x + 40, y: box.y + 80 }, dragging: false }]);
    expect(heldCardIds(state().nodes, state().frames).has(a)).toBe(true);
  });
});
