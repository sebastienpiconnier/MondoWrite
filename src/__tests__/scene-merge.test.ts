// @vitest-environment happy-dom
// Fusionner deux scènes (#23) : texte, synopsis, fils et commentaires rejoignent la première scène, la carte de la
// seconde part à la corbeille, « Annuler » remet tout.

import { beforeEach, describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import { joinSynopses, mergeComments, mergeEdges, mergeScreenplayScenes, nextInStory } from "../sceneMerge";
import type { ScreenplayElement } from "../screenplay/model";
import { EMPTY_PLAN } from "../plan";
import { useCosmos } from "../store";
import { useSettings } from "../settings";

const edge = (id: string, source: string, target: string, label = ""): Edge => ({ id, source, target, label });

describe("fonctions pures", () => {
  it("synopsis bout à bout, sans doublon", () => {
    expect(joinSynopses("Inès arrive.", "Elle repart.")).toBe("Inès arrive. Elle repart.");
    expect(joinSynopses("", " Elle repart. ")).toBe("Elle repart.");
    expect(joinSynopses("Même.", "Même.")).toBe("Même.");
  });

  it("les fils de la seconde scène passent à la première, sans boucle ni doublon", () => {
    const edges = [edge("1", "a", "b", "puis"), edge("2", "b", "ines", "avec"), edge("3", "phare", "b"), edge("4", "a", "phare"), edge("5", "x", "y")];
    const out = mergeEdges(edges, "b", "a");
    expect(out.map((e) => `${e.id}:${e.source}>${e.target}:${e.label}`)).toEqual(["2:a>ines:avec", "4:a>phare:", "5:x>y:"]);
    expect(mergeEdges([edge("5", "x", "y")], "b", "a")).toEqual([edge("5", "x", "y")]);
  });

  it("commentaires rangés avec la scène qui reste", () => {
    const c = (id: string) => ({ id, date: "2026-11-06", text: id, quote: "" });
    expect(mergeComments({ a: [c("c1")], b: [c("c2")] }, "b", "a")).toEqual({ a: [c("c1"), c("c2")] });
  });

  it("scénario : l'en-tête part, synopsis et corps suivent, jamais à travers une section", () => {
    const els: ScreenplayElement[] = [
      { type: "sceneHeading", text: "INT. PHARE - NUIT", cardId: "a" },
      { type: "synopsis", text: "Inès arrive." },
      { type: "action", text: "La lampe tourne." },
      { type: "sceneHeading", text: "EXT. QUAI - NUIT", cardId: "b" },
      { type: "synopsis", text: "Elle repart." },
      { type: "action", text: "Le vent." },
      { type: "section", text: "Acte 2", depth: 1 } as ScreenplayElement,
      { type: "sceneHeading", text: "INT. CAFÉ - JOUR", cardId: "c" },
    ];
    expect(mergeScreenplayScenes(els, "b", "a")!.map((e) => e.text)).toEqual(["INT. PHARE - NUIT", "Inès arrive. Elle repart.", "La lampe tourne.", "Le vent.", "Acte 2", "INT. CAFÉ - JOUR"]);
    expect(mergeScreenplayScenes(els, "c", "b")).toBeNull();
    expect(mergeScreenplayScenes(els, "a", "b")).toBeNull();
  });

  it("scène suivante dans l'ordre du récit", () => {
    expect(nextInStory(["a", "b", "c"], "a", () => true)).toBe("b");
    expect(nextInStory(["a", "b", "c"], "c", () => true)).toBeNull();
    expect(nextInStory(["a", "b"], "a", () => false)).toBeNull();
  });
});

describe("dans le projet", () => {
  const state = () => useCosmos.getState();
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, comments: {}, lastFiles: {}, past: [], future: [], pitch: {}, trash: [], trashNotice: null });
    await state().start();
  });

  it("roman : texte, synopsis, fils et commentaires rejoignent la première scène ; Annuler remet tout", async () => {
    await state().createProject({ title: "K", kind: "roman" });
    const a = state().addTitledCard("scene", "Arrivée");
    const b = state().addTitledCard("scene", "Départ");
    const ines = state().addTitledCard("personnage", "Inès");
    state().setManuscriptText(a, "<p>Début.</p>");
    state().setManuscriptText(b, "<p>Suite.</p>");
    state().setFiche(a, "synopsis", "Inès arrive.");
    state().setFiche(b, "synopsis", "Elle repart.");
    state().linkCards(b, ines, "avec");
    useCosmos.setState({ comments: { [b]: [{ id: "cmt123", date: "2026-11-06", text: "À revoir", quote: "Suite" }] } });

    expect(state().nextMergeable(a)).toBe(b);
    expect(state().mergeWithNext(a)).toBe(b);
    await Promise.resolve();
    expect(state().manuscript[a]).toBe("<p>Début.</p><p>Suite.</p>");
    expect(state().nodes.find((n) => n.id === a)?.data.fiche?.synopsis).toBe("Inès arrive. Elle repart.");
    expect(state().edges.some((e) => (e.source === a && e.target === ines) || (e.source === ines && e.target === a))).toBe(true);
    expect(state().comments[a]?.map((c) => c.id)).toEqual(["cmt123"]);
    expect(state().trash.some((c) => c.id === b)).toBe(true);
    expect(state().trashNotice?.merged?.into).toBe("Arrivée");

    state().undoMerge(state().trashNotice!.merged!.undo);
    expect(state().nodes.some((n) => n.id === b)).toBe(true);
    expect(state().manuscript[a]).toBe("<p>Début.</p>");
    expect(state().manuscript[b]).toBe("<p>Suite.</p>");
    expect(state().nodes.find((n) => n.id === a)?.data.fiche?.synopsis).toBe("Inès arrive.");
    expect(state().comments[b]?.map((c) => c.id)).toEqual(["cmt123"]);
    expect(state().comments[a]).toBeUndefined();
  });

  it("roman : pas de fusion avec une scène d'un autre chapitre", async () => {
    await state().createProject({ title: "K", kind: "roman" });
    const a = state().addTitledCard("scene", "Un");
    const b = state().addTitledCard("scene", "Deux");
    state().startChapterAt(b);
    expect(state().nextMergeable(a)).toBeNull();
  });

  it("scénario : la scène suivante rejoint la première dans le Fountain, sa carte part à la corbeille", async () => {
    await state().createProject({ title: "K", kind: "scenario" });
    const a = state().addTitledCard("scene", "INT. PHARE - NUIT");
    const b = state().addTitledCard("scene", "EXT. QUAI - NUIT");
    state().setScreenplay({ titlePage: {}, elements: [
      { type: "sceneHeading", text: "INT. PHARE - NUIT", cardId: a },
      { type: "action", text: "La lampe tourne." },
      { type: "sceneHeading", text: "EXT. QUAI - NUIT", cardId: b },
      { type: "action", text: "Le vent." },
    ] }, true);
    expect(state().nextMergeable(a)).toBe(b);
    expect(state().mergeWithNext(a)).toBe(b);
    const headings = state().screenplay!.elements.filter((e) => e.type === "sceneHeading");
    expect(headings.map((h) => h.cardId)).toEqual([a]);
    expect(state().screenplay!.elements.map((e) => e.text)).toEqual(["INT. PHARE - NUIT", "La lampe tourne.", "Le vent."]);
    expect(state().trash.some((c) => c.id === b)).toBe(true);
    await Promise.resolve();
    state().undoMerge(state().trashNotice!.merged!.undo);
    expect(state().screenplay!.elements.filter((e) => e.type === "sceneHeading").map((h) => h.cardId)).toEqual([a, b]);
  });
});
