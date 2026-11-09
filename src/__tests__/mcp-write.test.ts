// @vitest-environment happy-dom
// Assistant externe par MCP, écriture (#62, lot 3) : résolution, marques « IA », Fountain, et application d'une
// demande sur un store simulé.

import { describe, expect, it } from "vitest";
import { fr } from "../i18n/fr";
import type { CardData, CardType } from "../types";
import type { Screenplay } from "../screenplay/model";
import { parse } from "../screenplay/parse";
import { serialize } from "../screenplay/serialize";
import { applyMcpRequest, cardTypeOf, findCard, iaFountain, iaHtml, resolveFields, withIaSynopsis, withSceneText, type McpStore } from "../mcpWrite";

const card = (c: Partial<CardData> & Pick<CardData, "id" | "type" | "title">): CardData => ({ html: "", ...c });

describe("résolution", () => {
  const cards = [card({ id: "c1", type: "personnage", title: "Inès Morvan" }), card({ id: "l1", type: "lieu", title: "Le phare" })];

  it("trouve une carte par identifiant, titre exact sans accents, puis titre qui le contient", () => {
    expect(findCard(cards, "c1")?.id).toBe("c1");
    expect(findCard(cards, "INES MORVAN")?.id).toBe("c1");
    expect(findCard(cards, "morvan")?.id).toBe("c1");
    expect(findCard(cards, "xx")).toBeNull();
  });

  it("type par clé, par libellé ou par nom anglais", () => {
    expect(cardTypeOf("personnage", fr, "roman")).toBe("personnage");
    expect(cardTypeOf("Lieu", fr, "roman")).toBe("lieu");
    expect(cardTypeOf("Décor", fr, "scenario")).toBe("lieu");
    expect(cardTypeOf("character", fr, "roman")).toBe("personnage");
    expect(cardTypeOf("locations", fr, "roman")).toBe("lieu");
    expect(cardTypeOf("licorne", fr, "roman")).toBeNull();
  });

  it("champs par clé ou libellé ; champs à choix et références vérifiés", () => {
    const r = resolveFields("personnage", { Âge: "34 ans", metier: "Gardienne", "Type d’arc": "Tragique", Taille: "1,70 m" }, fr, cards);
    expect(r.fiche).toMatchObject({ age: "34 ans", metier: "Gardienne", arcType: "negatif" });
    expect(r.refused).toEqual(["Taille"]);
    const scene = resolveFields("scene", { statut: "À revoir", pov: "Inès", issue: "n'importe" }, fr, cards);
    expect(scene.fiche).toEqual({ statut: "revoir", pov: "c1" });
    expect(scene.refused[0]).toMatch(/^issue/);
  });
});

describe("marques IA", () => {
  it("chaque bloc de texte est marqué, la mise en forme gardée", () => {
    const html = iaHtml("Un **passage**.\n\nDeux.", "m1");
    expect(html).toBe('<p><span data-ia="m1">Un <strong>passage</strong>.</span></p><p><span data-ia="m1">Deux.</span></p>');
  });

  it("Fountain : répliques et actions marquées, un en-tête refusé", () => {
    const els = iaFountain("Inès monte.\n\nINÈS\nIl y a quelqu’un ?")!;
    expect(els.map((e) => [e.type, e.ia ?? false])).toEqual([
      ["action", true],
      ["character", false],
      ["dialogue", true],
    ]);
    expect(iaFountain("INT. PHARE - NUIT\n\nAction.")).toBeNull();
  });

  it("synopsis et corps d'une scène du scénario", () => {
    const sp = parse("INT. PHARE - NUIT [[cosmos:s1]]\n\n= Ancien.\n\nAction.\n\nEXT. FALAISE - JOUR [[cosmos:s2]]\n\nVent.");
    const syn = withIaSynopsis(sp, "s1", "Inès arrive.");
    expect(serialize(syn)).toContain("= Inès arrive. [[ia]]");
    expect(serialize(syn)).not.toContain("Ancien");
    const added = withSceneText(sp, "s1", iaFountain("Elle allume.")!, false);
    const text = serialize(added);
    expect(text.indexOf("Action.")).toBeLessThan(text.indexOf("Elle allume. [[ia]]"));
    expect(text.indexOf("Elle allume.")).toBeLessThan(text.indexOf("EXT. FALAISE"));
    expect(serialize(withSceneText(sp, "s1", iaFountain("Tout neuf.")!, true))).not.toContain("Action.");
  });
});

/** Store simulé : garde cartes, manuscrit, scénario ; compte les étapes d'annulation (`batch`). */
function fakeStore(kind: "roman" | "scenario", screenplay: Screenplay | null = null) {
  const state = {
    cards: [card({ id: "c1", type: "personnage", title: "Inès Morvan" }), card({ id: "s1", type: "scene", title: "L’arrivée" })] as CardData[],
    manuscript: { s1: "<p>Avant.</p>" } as Record<string, string>,
    screenplay,
    edges: [] as [string, string, string][],
    batches: 0,
    versions: [] as string[],
    journal: [] as string[],
  };
  let n = 0;
  const store: McpStore = {
    kind,
    cards: () => state.cards,
    screenplay: () => state.screenplay,
    manuscript: () => state.manuscript,
    scenes: () => state.cards.filter((c) => c.type === "scene").map((c, i) => ({ n: i + 1, id: c.id, title: c.title })),
    batch: (fn) => {
      state.batches++;
      return fn();
    },
    addTitledCard: (type: CardType, title: string) => {
      const id = `new${++n}`;
      state.cards = [...state.cards, card({ id, type, title })];
      return id;
    },
    updateCard: (id, patch) => {
      state.cards = state.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
    },
    linkCards: (a, b, label) => void state.edges.push([a, b, label]),
    addQuestionAbout: (title, ids) => {
      const id = store.addTitledCard("question", title);
      for (const target of ids) state.edges.push([id, target, ""]);
      return id;
    },
    setManuscriptText: (id, html) => void (state.manuscript = { ...state.manuscript, [id]: html }),
    setScreenplay: (sp) => void (state.screenplay = sp),
    keepVersion: async (id) => {
      state.versions.push(id);
      return "v";
    },
    log: (target) => void state.journal.push(target),
  };
  return { state, store };
}

describe("application d'une demande", () => {
  it("créer une carte : champs et titre marqués IA, notes marquées, une étape, journal", async () => {
    const { state, store } = fakeStore("roman");
    const res = await applyMcpRequest({ id: "1", tool: "create_card", args: { type: "lieu", title: "La crique", notes: "Abritée du vent.", fields: { Époque: "1912" } } }, store, fr);
    expect(res.ok).toBe(true);
    const created = state.cards.find((c) => c.title === "La crique")!;
    expect(created.type).toBe("lieu");
    expect(created.ia).toEqual(expect.arrayContaining(["title"]));
    expect(created.html).toContain("data-ia=");
    expect(state.batches).toBe(1);
    expect(state.journal).toEqual(["La crique"]);
  });

  it("une scène se crée par create_scene, pas par create_card", async () => {
    const { store } = fakeStore("roman");
    expect((await applyMcpRequest({ id: "1", tool: "create_card", args: { type: "scene", title: "X" } }, store, fr)).ok).toBe(false);
  });

  it("réécrire une scène de roman garde d'abord une version, compléter non", async () => {
    const { state, store } = fakeStore("roman");
    await applyMcpRequest({ id: "1", tool: "write_scene", args: { scene: "1", text: "Après." } }, store, fr);
    expect(state.manuscript.s1).toMatch(/^<p>Avant\.<\/p><p><span data-ia="[^"]+">Après\.<\/span><\/p>$/);
    expect(state.versions).toEqual([]);
    const res = await applyMcpRequest({ id: "2", tool: "write_scene", args: { scene: "L'arrivée", text: "Tout neuf.", mode: "replace" } }, store, fr);
    expect(res.ok).toBe(true);
    expect(state.versions).toEqual(["s1"]);
    expect(state.manuscript.s1).not.toContain("Avant");
  });

  it("question reliée aux cartes nommées, fil étiqueté", async () => {
    const { state, store } = fakeStore("roman");
    await applyMcpRequest({ id: "1", tool: "add_question", args: { question: "Pourquoi Inès ment-elle ?", about: ["Inès"] } }, store, fr);
    expect(state.edges.some(([, to]) => to === "c1")).toBe(true);
    await applyMcpRequest({ id: "2", tool: "link_cards", args: { from: "Inès", to: "L’arrivée", label: "ouvre" } }, store, fr);
    expect(state.edges).toContainEqual(["c1", "s1", "ouvre"]);
  });

  it("scénario : texte de scène en Fountain, annulable comme le séquencier", async () => {
    const { state, store } = fakeStore("scenario", parse("INT. PHARE - NUIT [[cosmos:s1]]\n\nAction."));
    const res = await applyMcpRequest({ id: "1", tool: "write_scene", args: { scene: "1", text: "INÈS\nQui est là ?" } }, store, fr);
    expect(res.ok).toBe(true);
    expect(serialize(state.screenplay!)).toContain("Qui est là ? [[ia]]");
    const bad = await applyMcpRequest({ id: "2", tool: "write_scene", args: { scene: "1", text: "EXT. DEHORS - JOUR\n\nVent." } }, store, fr);
    expect(bad.ok).toBe(false);
  });

  it("outil ou scène inconnus : refus clair", async () => {
    const { store } = fakeStore("roman");
    expect((await applyMcpRequest({ id: "1", tool: "delete_all", args: {} }, store, fr)).ok).toBe(false);
    expect((await applyMcpRequest({ id: "2", tool: "write_scene", args: { scene: "9", text: "x" } }, store, fr)).ok).toBe(false);
  });
});
