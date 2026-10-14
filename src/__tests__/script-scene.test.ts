// @vitest-environment happy-dom
// Scénario : une scène s'écrit depuis sa carte agrandie (corps de la scène, entre son synopsis et la scène ou
// la section suivante) ; les notes d'une carte Scène passent dans le synopsis Fountain de la scène.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { parse } from "../screenplay/parse";
import { headingOf, sceneBody, sceneText, setSceneBody } from "../screenplay/sceneText";
import { sceneSynopsis } from "../screenplay/scenes";
import { foldScreenplayNotes } from "../sceneNotes";
import { toNode } from "../projectState";

const state = () => useCosmos.getState();

const fountain = `INT. PHARE - NUIT [[cosmos:s1]]

= Inès arrive.

Inès monte l'escalier.

INÈS
Il y a quelqu'un ?

# Acte II

EXT. FALAISE - JOUR [[cosmos:s2]]

Le vent.
`;

describe("corps d'une scène (fonctions pures)", () => {
  const { elements } = parse(fountain);
  const at = headingOf(elements, "s1");

  it("après le synopsis, jusqu'à la section suivante", () => {
    expect(sceneBody(elements, at).map((el) => el.type)).toEqual(["action", "character", "dialogue"]);
    expect(sceneText(sceneBody(elements, at), "fr")).toBe("Inès monte l'escalier. INÈS : Il y a quelqu'un ?");
    expect(sceneText(sceneBody(elements, at), "en")).toContain("INÈS: Il y a");
  });

  it("remplacer le corps ne touche ni l'en-tête, ni le synopsis, ni la suite ; même tableau si rien ne change", () => {
    const body = sceneBody(elements, at);
    expect(setSceneBody(elements, at, body)).toBe(elements);
    const next = setSceneBody(elements, at, [...body, { type: "action", text: "Personne." }, { type: "action", text: "" }]);
    expect(sceneBody(next, at).map((el) => el.text)).toEqual(["Inès monte l'escalier.", "INÈS", "Il y a quelqu'un ?", "Personne."]);
    expect(sceneSynopsis(next, at)).toBe("Inès arrive.");
    expect(next.some((el) => el.type === "section")).toBe(true);
    expect(sceneBody(next, headingOf(next, "s2")).map((el) => el.text)).toEqual(["Le vent."]);
  });

  it("une carte sans en-tête : rien", () => {
    expect(headingOf(elements, "inconnue")).toBe(-1);
    expect(setSceneBody(elements, -1, [])).toBe(elements);
  });
});

describe("notes → synopsis Fountain", () => {
  it("les notes d'une scène reliée vont à la suite de son synopsis ; une scène sans en-tête les garde", () => {
    const screenplay = parse(fountain);
    const nodes = [
      toNode({ id: "s1", type: "scene", title: "INT. PHARE - NUIT", html: "<p>La lampe est froide.</p>" }, 0, 0),
      toNode({ id: "s3", type: "scene", title: "", html: "<p>Une idée.</p>" }, 0, 0),
    ];
    const folded = foldScreenplayNotes(nodes, screenplay);
    expect(sceneSynopsis(folded.screenplay!.elements, headingOf(folded.screenplay!.elements, "s1"))).toBe("Inès arrive. La lampe est froide.");
    expect(folded.nodes[0].data.html).toBe("");
    expect(folded.nodes[1]).toBe(nodes[1]);
    expect(foldScreenplayNotes(folded.nodes, folded.screenplay)).toEqual({ nodes: folded.nodes, screenplay: folded.screenplay });
  });
});

describe("dans le projet", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Phare", kind: "scenario" });
  });
  afterEach(() => useSettings.setState({ lang: "en" }));

  it("écrire la scène depuis sa carte, et son synopsis", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    state().setSceneText(id, [{ type: "action", text: "La lampe tourne." }]);
    const elements = state().screenplay!.elements;
    expect(sceneBody(elements, headingOf(elements, id))).toEqual([{ type: "action", text: "La lampe tourne." }]);
    state().setCardSceneSynopsis(id, "Inès arrive.");
    expect(sceneSynopsis(state().screenplay!.elements, headingOf(state().screenplay!.elements, id))).toBe("Inès arrive.");
    expect(sceneBody(state().screenplay!.elements, headingOf(state().screenplay!.elements, id))).toEqual([{ type: "action", text: "La lampe tourne." }]);
  });

  it("une scène qui reçoit son titre range ses notes dans son synopsis", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { html: "<p>Orage sur la côte.</p>" });
    expect(state().nodes.find((n) => n.id === id)!.data.html).toBe("<p>Orage sur la côte.</p>");
    state().updateCard(id, { title: "EXT. CÔTE - NUIT" });
    const elements = state().screenplay!.elements;
    expect(sceneSynopsis(elements, headingOf(elements, id))).toBe("Orage sur la côte.");
    expect(state().nodes.find((n) => n.id === id)!.data.html).toBe("");
  });
});
