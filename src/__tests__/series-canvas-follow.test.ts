// @vitest-environment happy-dom
// Série sur le canevas (novembre 2026, retours de l'auteur) : une scène écrite dans la vue Scénario rejoint le
// cadre de son épisode, même canevas fermé ; une carte plus haute que prévu fait ranger de nouveau ; le fil
// « puis » ne court pas d'un épisode à l'autre ; les sections d'une série se disent Saison, Épisode, Case.

import { beforeEach, describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { screenplayExtensions, toDoc } from "../screenplay/editor";
import type { ScreenplayElement } from "../screenplay/model";
import { EMPTY_PLAN } from "../plan";
import { frameBox } from "../projectState";
import { currentScript, useCosmos } from "../store";
import { useSettings } from "../settings";

const s = useCosmos.getState;
const inside = (cardId: string, frameId: string) => {
  const card = s().nodes.find((n) => n.id === cardId)!;
  const box = frameBox(s().frames.find((f) => f.id === frameId)!);
  const cx = card.position.x + 140;
  const cy = card.position.y + 60;
  return cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
};

/** Ce que ferait l'éditeur : une scène écrite à la fin de l'épisode, sa carte née par adopt.ts. */
function writeScene(episode: string, heading: string, body: string) {
  const card = s().addTitledCard("scene", heading);
  const script = currentScript(s())!;
  s().setScript({ ...script, elements: [...script.elements, { type: "sceneHeading", text: heading, cardId: card }, { type: "action", text: body }] }, false, episode);
  return card;
}

describe("la série suit sur le canevas", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await useCosmos.getState().start();
    await useCosmos.getState().createProject({ title: "Odyssée", kind: "scenario" });
  });

  it("une scène écrite dans l'épisode de la saison 2, même en-tête que dans la saison 1, va dans son cadre", () => {
    const first = s().addSeriesEpisode()!;
    s().addSeriesSeason();
    const second = s().addSeriesEpisode()!;
    s().openEpisode(first);
    const a = writeScene(first, "INT. NAVETTE SPATIALE - NUIT", "Le vaisseau dérive.");
    s().openEpisode(second);
    const b = writeScene(second, "INT. NAVETTE SPATIALE - NUIT", "Rien ne bouge.");
    const frameOf = (ep: string) => s().frames.find((f) => f.data.episode === ep)!.id;
    expect(inside(a, frameOf(first))).toBe(true);
    expect(inside(b, frameOf(second))).toBe(true);
    expect(inside(b, frameOf(first))).toBe(false);
    // Deux épisodes : pas de fil « puis » de l'un à l'autre.
    expect(s().edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a))).toBe(false);
  });

  it("un canevas sans cadre du récit n'est pas rangé pendant la frappe", () => {
    const card = s().addTitledCard("scene", "INT. PHARE - NUIT");
    const at = { ...s().nodes.find((n) => n.id === card)!.position };
    const sp = s().screenplay!;
    s().setScreenplay({ ...sp, elements: [...sp.elements.filter((e) => e.cardId !== card), { type: "sceneHeading", text: "INT. PORT - JOUR", cardId: s().addTitledCard("scene", "INT. PORT - JOUR") }] });
    expect(s().nodes.find((n) => n.id === card)!.position).toEqual(at);
  });

  it("une carte mesurée plus haute que son cadre fait ranger de nouveau, une seule fois", () => {
    const ep = s().addSeriesEpisode()!;
    s().openEpisode(ep);
    const card = writeScene(ep, "INT. PHARE - NUIT", "La lanterne tourne.");
    const frame = s().frames.find((f) => f.data.episode === ep)!;
    const before = frameBox(frame).height;
    // React Flow mesure la carte : bien plus haute que la hauteur estimée.
    useCosmos.setState({ nodes: s().nodes.map((n) => (n.id === card ? { ...n, measured: { width: 280, height: 600 } } : n)) });
    s().refitStory();
    const after = frameBox(s().frames.find((f) => f.data.episode === ep)!).height;
    expect(after).toBeGreaterThan(before);
    const frames = s().frames;
    s().refitStory();
    expect(s().frames).toBe(frames);
  });
});

describe("sections d'une série dans l'éditeur", () => {
  const schema = getSchema(screenplayExtensions({ locale: () => "fr", placeholder: () => "", onEscape: () => {} }));
  const html = (elements: ScreenplayElement[]) => {
    const doc = schema.nodeFromJSON(toDoc({ titlePage: {}, elements }));
    const div = document.createElement("div");
    div.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));
    return div;
  };

  it("saison, épisode et case se reconnaissent ; un épisode sans titre reste vide (le CSS dit « Sans titre »)", () => {
    const div = html([
      { type: "section", depth: 1, text: "Saison 1 [[cosmos:season:s1]]" },
      { type: "section", depth: 2, text: "[[cosmos:episode:e1]]" },
      { type: "section", depth: 3, text: "Pré-générique [[cosmos:beat:e_teaser]]" },
      { type: "section", depth: 1, text: "Acte de l'auteur" },
    ]);
    const roles = [...div.querySelectorAll(".sp-preserved")].map((el) => el.getAttribute("data-series"));
    expect(roles).toEqual(["season", "episode", "beat", null]);
    expect(div.querySelectorAll(".sp-preserved")[1].textContent).toBe("");
    expect(div.querySelectorAll(".sp-preserved")[0].textContent).toBe("Saison 1");
  });
});
