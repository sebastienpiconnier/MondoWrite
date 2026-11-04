// @vitest-environment happy-dom
// Série : l'écriture commence sous la première case (un en-tête de scène, pas de l'action), et les saisons et
// épisodes posés dans le séquencier ont leurs cadres sur le canevas avant la première scène.

import { beforeEach, describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { screenplayExtensions, toDoc, fromDoc } from "../screenplay/editor";
import { enter, gapType, insertAtGap, startGap } from "../screenplay/editor/keymap";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import { EMPTY_PLAN } from "../plan";
import { useCosmos } from "../store";
import { useSettings } from "../settings";

const section = (depth: number, text: string): ScreenplayElement => ({ type: "section", depth, text });
const schema = getSchema(screenplayExtensions({ locale: () => "fr", placeholder: () => "", onEscape: () => {} }));
const docOf = (elements: ScreenplayElement[]) => schema.nodeFromJSON(toDoc({ titlePage: {}, elements }));
const beats = [section(1, "Pré-générique [[cosmos:beat:e_teaser]]"), section(1, "Acte 1 [[cosmos:beat:e_act1]]"), section(1, "Épilogue [[cosmos:beat:e_tag]]")];

function typeAt(elements: ScreenplayElement[], at: number, text: string, how: "type" | "enter" = "type") {
  const doc = docOf(elements);
  let state = EditorState.create({ schema, doc });
  state = state.apply(state.tr.setSelection(new GapCursor(state.doc.resolve(at))));
  let after = state;
  const dispatch = (tr: Transaction) => (after = state.apply(tr));
  if (how === "enter") enter(state, dispatch);
  else insertAtGap(state, dispatch, text);
  return fromDoc(after.doc.toJSON(), {}).elements;
}

describe("écrire sous une case du gabarit", () => {
  it("le curseur se pose sous la première case, et la frappe y commence un en-tête de scène", () => {
    const doc = docOf(beats);
    const at = startGap(doc)!;
    expect(at).toBe(doc.child(0).nodeSize);
    expect(gapType(doc.resolve(at))).toBe("sceneHeading");
    const typed = typeAt(beats, at, "i");
    expect(typed.map((e) => e.type)).toEqual(["section", "sceneHeading", "section", "section"]);
    expect(typed[1].text).toBe("i");
    // Entrée fait de même, avec un en-tête vide.
    expect(typeAt(beats, at, "", "enter")[1].type).toBe("sceneHeading");
  });

  it("série : le curseur descend jusqu'à la première case de l'épisode", () => {
    const elements = [section(1, "Saison 1 [[cosmos:season:s1]]"), section(2, "Pilote [[cosmos:episode:e1]]"), { type: "synopsis" as const, text: "Tout commence." }, section(3, "Pré-générique [[cosmos:beat:e_teaser]]"), section(3, "Acte 1 [[cosmos:beat:e_act1]]")];
    const doc = docOf(elements);
    const at = startGap(doc)!;
    let expected = 0;
    for (let i = 0; i < 4; i++) expected += doc.child(i).nodeSize;
    expect(at).toBe(expected);
  });

  it("rien à faire quand une scène suit déjà, ou sous une note (de l'action)", () => {
    const withScene: ScreenplayElement[] = [beats[0], { type: "sceneHeading", text: "INT. MANOIR - JOUR" }, beats[1]];
    expect(startGap(docOf(withScene))).toBeNull();
    expect(startGap(docOf([{ type: "action", text: "Rien." }]))).toBeNull();
    const noted: ScreenplayElement[] = [{ type: "note", text: "à revoir" }, beats[1]];
    const doc = docOf(noted);
    expect(gapType(doc.resolve(doc.child(0).nodeSize))).toBe("action");
  });
});

describe("les cadres de la série avant la première scène", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await useCosmos.getState().start();
    await useCosmos.getState().createProject({ title: "Le Phare", kind: "scenario" });
  });

  it("créer des épisodes et une saison dessine leurs cadres, sans aucune carte", () => {
    const s = useCosmos.getState;
    expect(s().nodes.filter((n) => n.data.type === "scene")).toHaveLength(0);
    s().addSeriesEpisode();
    s().addSeriesEpisode();
    const episodes = s().frames.filter((f) => f.data.episode);
    expect(episodes).toHaveLength(2);
    expect(s().frames.some((f) => f.data.season)).toBe(true);
    s().addSeriesSeason();
    expect(s().frames.filter((f) => f.data.season)).toHaveLength(2);
    // Un épisode renommé : son cadre suit.
    const id = episodes[0].data.episode!;
    s().renameSeriesPart(id, "Tempête");
    expect(s().frames.find((f) => f.data.episode === id)?.data.title).toContain("Tempête");
  });

  it("un canevas aux cadres de l'auteur n'est pas rangé d'office", () => {
    const s = useCosmos.getState;
    s().addFrame({ x: 0, y: 0 });
    const mine = s().frames.map((f) => f.id);
    expect(mine).toHaveLength(1);
    s().addSeriesEpisode();
    expect(s().frames.map((f) => f.id)).toEqual(mine);
    const sp: Screenplay = s().screenplay!;
    expect(sp.elements.some((e) => e.type === "section")).toBe(true);
  });
});
