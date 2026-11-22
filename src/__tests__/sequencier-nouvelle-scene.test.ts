// @vitest-environment happy-dom
// Séquencier d'un scénario : « Nouvelle scène… » au bout d'une case du gabarit, comme le Plan d'un roman.

import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_PLAN } from "../plan";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { customOf, screenplayPlan } from "../screenplay/template";
import { readPlan } from "../plan";

describe("nouvelle scène dans une case du séquencier", () => {
  const state = () => useCosmos.getState();
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Le Phare", kind: "scenario" });
  });

  it("la scène entre dans le texte, dans sa case et à sa fin, en une seule étape", () => {
    state().setCustomTemplate("Deux temps", [
      { label: "Avant", hint: "Le monde tel qu’il est" },
      { label: "Après", hint: "Le monde changé" },
    ]);
    const custom = screenplayPlan(state().screenplay!.elements).custom!;
    const [first, second] = custom.beats.map((b) => b.key);
    const a = state().addBeatScene("INT. PHARE - NUIT", second);
    const b = state().addBeatScene("EXT. CÔTE - JOUR", first);
    const c = state().addBeatScene("INT. CUISINE - JOUR", second);
    const beats = screenplayPlan(state().screenplay!.elements).beats;
    expect(beats[first]).toEqual([b]);
    expect(beats[second]).toEqual([a, c]);
    expect(state().nodes.find((n) => n.id === a)?.data).toMatchObject({ type: "scene", title: "INT. PHARE - NUIT" });
    // Annuler : la dernière scène part avec sa carte, les autres restent.
    state().undo();
    expect(state().nodes.some((n) => n.id === c)).toBe(false);
    expect(screenplayPlan(state().screenplay!.elements).beats[second]).toEqual([a]);
  });

  it("gabarit de l'auteur : son nom et les aides de ses cases sont gardés (cosmos.json), relus avec les sections", () => {
    state().setCustomTemplate("Deux temps", [
      { label: "Avant", hint: "Le monde tel qu’il est" },
      { label: "Après", hint: "" },
    ]);
    const custom = customOf(state().screenplay!.elements, state().plan.scriptBeats)!;
    expect(custom.name).toBe("Deux temps");
    expect(custom.beats.map((b) => b.hint ?? "")).toEqual(["Le monde tel qu’il est", ""]);
    // Relu depuis le fichier.
    const again = readPlan(JSON.parse(JSON.stringify(state().plan)));
    expect(customOf(state().screenplay!.elements, again.scriptBeats)!.beats[0].hint).toBe("Le monde tel qu’il est");
  });

  it("passer d'un gabarit de l'auteur à un autre : les scènes restent dans le gabarit, nom et aides suivent", () => {
    state().setCustomTemplate("A", [{ label: "Un", hint: "aide un" }, { label: "Deux" }]);
    const [, deux] = customOf(state().screenplay!.elements)!.beats.map((b) => b.key);
    const scene = state().addBeatScene("INT. PHARE - NUIT", deux);
    state().setCustomTemplate("B", [{ label: "Alpha", hint: "aide alpha" }, { label: "Beta" }]);
    const custom = customOf(state().screenplay!.elements, state().plan.scriptBeats)!;
    expect(custom.name).toBe("B");
    expect(custom.beats.map((b) => b.label)).toEqual(["Alpha", "Beta"]);
    expect(custom.beats[0].hint).toBe("aide alpha");
    // Comme un gabarit livré : la scène est dans la première case, jamais hors du gabarit.
    expect(screenplayPlan(state().screenplay!.elements).beats[custom.beats[0].key]).toEqual([scene]);
  });
});
