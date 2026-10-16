// @vitest-environment happy-dom
// Cadres de regroupement : création, déplacement avec leurs cartes, enregistrement, annulation.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { META_FILE, storage } from "../storage";

const state = () => useCosmos.getState();
const frame = () => state().frames[0];
const at = (id: string) => state().nodes.find((n) => n.id === id)!.position;
const pause = () => vi.advanceTimersByTime(2000);
/** Une carte qu'on vient de créer est sélectionnée : sans cela, un nouveau cadre l'entourerait. */
const deselect = () => useCosmos.setState({ nodes: state().nodes.map((n) => ({ ...n, selected: false })) });
/** Cadre vide de 520 × 360 centré sur (220, 175) : de (-40, -5) à (480, 355). */
const frameAroundOrigin = () => {
  deselect();
  return state().addFrame({ x: 220, y: 175 });
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
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

describe("créer un cadre", () => {
  it("sans sélection : un cadre vide, centré sur le point donné, sélectionné", () => {
    const id = state().addFrame({ x: 1000, y: 600 });
    expect(frame()).toMatchObject({ id, type: "frame", position: { x: 740, y: 420 }, width: 520, height: 360, selected: true, zIndex: -1 });
    expect(frame().data.title).toBe("");
  });

  it("avec des cartes sélectionnées : il les entoure, avec la place du titre", () => {
    const a = state().addCard({ x: 100, y: 100 });
    const b = state().addCard({ x: 500, y: 300 });
    state().addCard({ x: 2000, y: 2000 }); // la dernière créée est sélectionnée : on corrige
    useCosmos.setState({ nodes: state().nodes.map((n) => ({ ...n, selected: n.id === a || n.id === b })) });

    state().addFrame({ x: 0, y: 0 });
    // Cartes de 240 × 150 (non mesurées) : de (100, 100) à (740, 450), plus les marges.
    expect(frame()).toMatchObject({ position: { x: 68, y: 36 }, width: 704, height: 446 });
  });

  it("nommer, puis supprimer : les cartes restent", () => {
    const card = state().addCard({ x: 100, y: 100 });
    const id = frameAroundOrigin();
    state().updateFrame(id, { title: "Acte 1 ?" });
    expect(frame().data.title).toBe("Acte 1 ?");
    state().deleteFrame(id);
    expect(state().frames).toEqual([]);
    expect(state().nodes.map((n) => n.id)).toEqual([card]);
  });
});

describe("déplacer un cadre", () => {
  it("les cartes dont le centre est dedans suivent, les autres non", () => {
    // Le cadre d'abord : un cadre vide ne se pose jamais sur des cartes, une carte demandée dedans y reste.
    const id = frameAroundOrigin();
    const inside = state().addCard({ x: 100, y: 100 });
    const outside = state().addCard({ x: 900, y: 100 });
    pause();

    state().onNodesChange([{ id, type: "position", position: { x: 60, y: 195 }, dragging: true }]);
    state().onNodesChange([{ id, type: "position", position: { x: 160, y: 395 }, dragging: true }]);

    expect(frame().position).toEqual({ x: 160, y: 395 });
    expect(at(inside)).toEqual({ x: 300, y: 500 });
    expect(at(outside)).toEqual({ x: 900, y: 100 });
  });

  it("un déplacement entier s'annule en une fois, cartes comprises", () => {
    const id = frameAroundOrigin();
    const inside = state().addCard({ x: 100, y: 100 });
    pause();
    for (let step = 1; step <= 5; step++) {
      state().onNodesChange([{ id, type: "position", position: { x: -40 + step * 40, y: -5 }, dragging: true }]);
      vi.advanceTimersByTime(40);
    }
    expect(at(inside).x).toBe(300);
    state().undo();
    expect(frame().position).toEqual({ x: -40, y: -5 });
    expect(at(inside)).toEqual({ x: 100, y: 100 });
  });

  it("redimensionner par le coin haut gauche ne déplace pas les cartes", () => {
    const inside = state().addCard({ x: 100, y: 100 });
    const id = frameAroundOrigin();
    state().onNodesChange([
      { id, type: "position", position: { x: -140, y: -105 } },
      { id, type: "dimensions", dimensions: { width: 620, height: 460 }, resizing: true, setAttributes: true },
    ]);
    expect(frame()).toMatchObject({ position: { x: -140, y: -105 }, width: 620, height: 460 });
    expect(at(inside)).toEqual({ x: 100, y: 100 });
    expect(state().status).toBe("modifie");
  });

  it("la mesure initiale d'un cadre ne modifie pas le projet", () => {
    const id = state().addFrame({ x: 0, y: 0 });
    useCosmos.setState({ status: "enregistre" });
    const steps = state().past.length;
    state().onNodesChange([{ id, type: "dimensions", dimensions: { width: 520, height: 360 } }]);
    expect(state().status).toBe("enregistre");
    expect(state().past).toHaveLength(steps);
  });

  it("supprimer un cadre au clavier (Suppr) : ses cartes restent, et ça s'annule", () => {
    const card = state().addCard({ x: 100, y: 100 });
    const id = frameAroundOrigin();
    pause();
    state().onNodesChange([{ id, type: "remove" }]);
    expect(state().frames).toEqual([]);
    expect(state().nodes.map((n) => n.id)).toEqual([card]);
    state().undo();
    expect(state().frames).toHaveLength(1);
  });
});

describe("enregistrer", () => {
  it("un projet sans cadre n'a pas de champ frames ; les cadres sont écrits et relus", async () => {
    await state().save();
    expect(JSON.parse((await storage.readAll())![META_FILE])).not.toHaveProperty("frames");

    const id = state().addFrame({ x: 1000.4, y: 600.6 });
    state().updateFrame(id, { title: "Le phare" });
    expect(state().status).toBe("modifie");
    await state().closeProject();
    const meta = JSON.parse((await storage.readAll())![META_FILE]);
    expect(meta.frames).toEqual([{ id, title: "Le phare", x: 740, y: 421, width: 520, height: 360 }]);

    await state().openProject(state().projects[0].id);
    expect(frame()).toMatchObject({ id, type: "frame", position: { x: 740, y: 421 }, width: 520, height: 360, data: { title: "Le phare" } });
    expect(state().status).toBe("enregistre");
  });

  it("un cadre abîmé dans cosmos.json est ignoré, le projet s'ouvre", async () => {
    const files = (await storage.readAll())!;
    const meta = JSON.parse(files[META_FILE]);
    meta.frames = [{ id: "ok", title: "Bon", x: 0, y: 0, width: 300, height: 200 }, { id: "ko", title: "Sans taille", x: 0, y: 0 }, null];
    await storage.write({ [META_FILE]: JSON.stringify(meta) }, []);
    await state().closeProject(true);
    await state().openProject(state().projects[0].id);
    expect(state().frames.map((f) => f.id)).toEqual(["ok"]);
  });
});
