// @vitest-environment happy-dom
// Roman interactif et assistant externe (#84, lot 6) : choix et faits dans l'instantané, outil `set_choices`.

import { describe, expect, it } from "vitest";
import { fr } from "../i18n/fr";
import { EMPTY_PLAN } from "../plan";
import type { CardData } from "../types";
import type { CardNode } from "../projectState";
import { buildMcpSnapshot, type McpSource } from "../mcpSnapshot";
import { choicesHtml, choicesIn, sceneSlugs } from "../interactive/choices";
import { storyFacts } from "../interactive/facts";
import { applyMcpRequest, choiceFromRequest, type McpInteractive, type McpStore } from "../mcpWrite";

const node = (data: Partial<CardData> & Pick<CardData, "id" | "type">, y = 0): CardNode =>
  ({ id: data.id, type: "card", position: { x: 0, y }, data: { title: "", html: "", ...data } }) as CardNode;

const source = (interactive: boolean): McpSource => ({
  title: "La grille",
  kind: "roman",
  nodes: [node({ id: "a", type: "scene", title: "La grille" }, 0), node({ id: "b", type: "scene", title: "La cour" }, 100)],
  edges: [],
  plan: EMPTY_PLAN,
  manuscript: {
    a: `<p>Devant la grille.</p>${choicesHtml("* [Entrer] -> la_cour\n  ~ cle = true\n* { not cle } [Fuir] -> END\n* [Ailleurs] -> nulle_part")}`,
    b: "<p>Une cour.</p>",
  },
  screenplay: null,
  pitch: {},
  interactive,
  metaKeep: { interactive: true, storyFacts: { cle: "a trouvé la clé" } },
});

describe("instantané d'un roman interactif", () => {
  it("choix en clair, faits, texte sans le bloc", () => {
    const snap = buildMcpSnapshot(source(true), fr, new Date(0), "");
    expect(snap.project.interactive).toBe(true);
    expect(snap.project.facts).toEqual([{ name: "cle", label: "a trouvé la clé", kind: "bool" }]);
    expect(snap.scenes[0].text).toBe("Devant la grille.");
    expect(snap.scenes[0].choices).toEqual([
      { label: "Entrer", to: 2, target: "La cour", gives: "a trouvé la clé" },
      { label: "Fuir", target: "END", end: true, if: "not: a trouvé la clé" },
      { label: "Ailleurs", target: "nulle_part", broken: true },
    ]);
    expect(snap.scenes[1].choices).toBeUndefined();
  });

  it("option coupée : un roman ordinaire, rien de plus", () => {
    const snap = buildMcpSnapshot(source(false), fr, new Date(0), "");
    expect(snap.project.interactive).toBeUndefined();
    expect(snap.scenes[0].choices).toBeUndefined();
  });
});

function store(interactive: boolean) {
  const scenes = [
    { n: 1, id: "a", title: "La grille" },
    { n: 2, id: "b", title: "La cour" },
  ];
  const state = { manuscript: { a: "<p>Devant la grille.</p>", b: "" } as Record<string, string>, labels: {} as Record<string, string>, journal: [] as string[], batches: 0 };
  const ix = (): McpInteractive => ({
    slugs: sceneSlugs(scenes),
    facts: storyFacts(state.manuscript, ["a", "b"], new Set(sceneSlugs(scenes).values()), state.labels),
    createFact: (label) => {
      const name = label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
      state.labels[name] = label;
      return name;
    },
    forgetFact: (name) => void delete state.labels[name],
  });
  const s = {
    kind: "roman",
    cards: () => [],
    scenes: () => scenes,
    manuscript: () => state.manuscript,
    setManuscriptText: (id: string, html: string) => void (state.manuscript = { ...state.manuscript, [id]: html }),
    batch: <T,>(fn: () => T) => {
      state.batches++;
      return fn();
    },
    log: (target: string) => void state.journal.push(target),
    interactive: () => (interactive ? ix() : null),
    keepVersion: async () => "v1",
    linkCards: () => {},
    addTitledCard: () => {
      const id = `n${scenes.length + 1}`;
      scenes.push({ n: scenes.length + 1, id, title: "" });
      return id;
    },
    updateCard: (id: string, patch: { title?: string }) => {
      const sc = scenes.find((x) => x.id === id);
      if (sc && patch.title) sc.title = patch.title;
    },
    startChapterAt: () => "ch1",
  } as unknown as McpStore;
  return { state, store: s };
}

describe("outil set_choices", () => {
  it("pose les choix d'une scène, crée les faits, une étape, journal", async () => {
    const { state, store: s } = store(true);
    const res = await applyMcpRequest(
      {
        id: "1",
        tool: "set_choices",
        args: { scene: "1", choices: [{ text: "Entrer", to: "La cour", gives: "a trouvé la clé" }, { text: "Fuir", to: "end", only_if_not: "a trouvé la clé" }] },
      },
      s,
      fr,
    );
    expect(res.ok).toBe(true);
    expect(state.batches).toBe(1);
    expect(state.journal).toEqual(["La grille"]);
    expect(state.labels).toEqual({ a_trouv_la_cl: "a trouvé la clé" });
    expect(choicesIn(state.manuscript.a)).toEqual([
      { kind: "choice", label: "Entrer", target: "la_cour", effects: ["a_trouv_la_cl = true"] },
      { kind: "choice", label: "Fuir", target: "END", cond: "not a_trouv_la_cl" },
    ]);
    expect(state.manuscript.a.startsWith("<p>Devant la grille.</p>")).toBe(true);
  });

  it("append garde les choix ; replace garde les lignes écrites à la main ; liste vide retire le bloc", async () => {
    const { state, store: s } = store(true);
    state.manuscript.a = `<p>x</p>${choicesHtml("* [Rester] -> END\n-> la_cour")}`;
    await applyMcpRequest({ id: "1", tool: "set_choices", args: { scene: "1", mode: "append", choices: [{ text: "Entrer", to: "2" }] } }, s, fr);
    expect(choicesIn(state.manuscript.a).map((l) => (l.kind === "choice" ? l.label : l.text))).toEqual(["Rester", "-> la_cour", "Entrer"]);
    await applyMcpRequest({ id: "2", tool: "set_choices", args: { scene: "1", choices: [{ text: "Partir", to: "end" }] } }, s, fr);
    expect(choicesIn(state.manuscript.a).map((l) => (l.kind === "choice" ? l.label : l.text))).toEqual(["-> la_cour", "Partir"]);
    await applyMcpRequest({ id: "3", tool: "set_choices", args: { scene: "2", choices: [] } }, s, fr);
    expect(state.manuscript.b).toBe("");
  });

  it("refus : projet ordinaire, scène visée introuvable, rien n'est écrit", async () => {
    const plain = store(false);
    expect((await applyMcpRequest({ id: "1", tool: "set_choices", args: { scene: "1", choices: [{ text: "x", to: "end" }] } }, plain.store, fr)).ok).toBe(false);
    const { state, store: s } = store(true);
    const res = await applyMcpRequest({ id: "1", tool: "set_choices", args: { scene: "1", choices: [{ text: "x", to: "Le grenier" }] } }, s, fr);
    expect(res.ok).toBe(false);
    expect(state.manuscript.a).toBe("<p>Devant la grille.</p>");
  });

  it("un fait existant est retrouvé par son libellé", () => {
    const { state, store: s } = store(true);
    state.labels.cle = "a trouvé la clé";
    const got = choiceFromRequest({ text: "Ouvrir", to: "2", only_if: "A trouvé la clé" }, s.interactive!()!, () => ({ id: "b" }));
    expect(got).toEqual({ line: { kind: "choice", label: "Ouvrir", target: "la_cour", cond: "cle" } });
  });
});

describe("retours du « Puits » (novembre 2026)", () => {
  it("set_choices : compteurs et conditions combinées, lus avant d'être écrits", async () => {
    const { state, store: s } = store(true);
    const ok = await applyMcpRequest(
      {
        id: "1",
        tool: "set_choices",
        args: {
          scene: "1",
          choices: [
            { text: "Prendre la lanterne", to: "2", effects: ["lanterne = true", "flamme = 3"] },
            { text: "Lever la lanterne", to: "end", condition: "not nom_donne and ourdas and flamme > 0", effects: ["flamme -= 1"] },
          ],
        },
      },
      s,
      fr,
    );
    expect(ok.ok).toBe(true);
    expect(choicesIn(state.manuscript.a)).toEqual([
      { kind: "choice", label: "Prendre la lanterne", target: "la_cour", effects: ["lanterne = true", "flamme = 3"] },
      { kind: "choice", label: "Lever la lanterne", target: "END", cond: "not nom_donne and ourdas and flamme > 0", effects: ["flamme -= 1"] },
    ]);
    for (const bad of [{ condition: "RANDOM(1, 6) > 3" }, { effects: ["flamme = RANDOM(1,6)"] }, { effects: ["la_cour = true"] }]) {
      const res = await applyMcpRequest({ id: "2", tool: "set_choices", args: { scene: "2", choices: [{ text: "x", to: "end", ...bad }] } }, s, fr);
      expect(res.ok).toBe(false);
    }
    expect(state.manuscript.b).toBe("");
  });

  it("write_scene garde les choix de la scène, et signale ceux qu'il écrit mal", async () => {
    const { state, store: s } = store(true);
    state.manuscript.a = `<p>Avant.</p>${choicesHtml("* [Entrer] -> la_cour")}`;
    const res = await applyMcpRequest({ id: "1", tool: "write_scene", args: { scene: "1", mode: "replace", text: "Après." } }, s, fr);
    expect(res.text).toMatch(/choix sont gardés/);
    expect(state.manuscript.a).toMatch(/Après\./);
    expect(choicesIn(state.manuscript.a).map((l) => (l.kind === "choice" ? l.label : ""))).toEqual(["Entrer"]);
    // Ajout de texte : le bloc reste en fin de scène.
    await applyMcpRequest({ id: "2", tool: "write_scene", args: { scene: "1", text: "Encore." } }, s, fr);
    expect(state.manuscript.a.indexOf("Encore.")).toBeLessThan(state.manuscript.a.indexOf("data-choices"));
    // Un bloc écrit à la main remplace l'ancien ; une destination inconnue est signalée.
    const raw = await applyMcpRequest({ id: "3", tool: "write_scene", args: { scene: "1", mode: "replace", text: "Neuf.\n\n```choix\n* [Monter] -> le_grenier\n```" } }, s, fr);
    expect(raw.ok).toBe(true);
    expect(raw.text).toMatch(/le_grenier/);
    expect(choicesIn(state.manuscript.a).map((l) => (l.kind === "choice" ? l.target : ""))).toEqual(["le_grenier"]);
  });

  it("un bloc de choix hors d'un roman interactif est refusé", async () => {
    const { state, store: s } = store(false);
    const res = await applyMcpRequest({ id: "1", tool: "write_scene", args: { scene: "1", text: "```choix\n* [x] -> END\n```" } }, s, fr);
    expect(res.ok).toBe(false);
    expect(state.manuscript.a).toBe("<p>Devant la grille.</p>");
  });

  it("pas de chapitre dans un roman interactif", async () => {
    const { store: s } = store(true);
    const res = await applyMcpRequest({ id: "1", tool: "create_chapter", args: { scene: "1", title: "La ferme" } }, s, fr);
    expect(res.ok).toBe(false);
    expect(res.text).toMatch(/pas de chapitres/);
  });

  it("create_scene pose aussi ses choix et donne son nom", async () => {
    const { state, store: s } = store(true);
    const res = await applyMcpRequest({ id: "1", tool: "create_scene", args: { title: "Le grenier", text: "Il fait noir.", choices: [{ text: "Redescendre", to: "1" }] } }, s, fr);
    expect(res.ok).toBe(true);
    expect(res.text).toMatch(/`le_grenier`/);
    expect(choicesIn(state.manuscript.n3)).toEqual([{ kind: "choice", label: "Redescendre", target: "la_grille" }]);
    // Un « Continuer » sans texte, donné exprès ; un texte oublié est refusé.
    expect((await applyMcpRequest({ id: "2", tool: "set_choices", args: { scene: "2", choices: [{ text: "", to: "1" }] } }, s, fr)).ok).toBe(true);
    expect((await applyMcpRequest({ id: "3", tool: "set_choices", args: { scene: "2", choices: [{ to: "1" }] } }, s, fr)).ok).toBe(false);
  });

  it("remove_fact : retire un fait qu'aucun choix n'emploie, refuse un fait employé", async () => {
    const { state, store: s } = store(true);
    state.labels.courage = "Le courage";
    await applyMcpRequest({ id: "1", tool: "set_choices", args: { scene: "1", choices: [{ text: "Entrer", to: "2", gives: "a la lanterne" }] } }, s, fr);
    const used = await applyMcpRequest({ id: "2", tool: "remove_fact", args: { fact: "a la lanterne" } }, s, fr);
    expect(used.ok).toBe(false);
    expect(used.text).toMatch(/1 choix/);
    const res = await applyMcpRequest({ id: "3", tool: "remove_fact", args: { fact: "Le courage" } }, s, fr);
    expect(res.ok).toBe(true);
    expect(state.labels.courage).toBeUndefined();
  });
});
