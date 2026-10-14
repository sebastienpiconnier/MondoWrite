// @vitest-environment happy-dom
// États d'affichage du canevas : mise en avant, filtres, carte agrandie, menu d'une carte. Jamais enregistrés,
// jamais dans l'historique d'annulation ; « Organiser » et l'export montrent tout.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { META_FILE, storage } from "../storage";
import { NO_FILTER, hiddenCards, neighbourhood } from "../canvasFilter";
import { mentionHtml } from "../mentions";

const state = () => useCosmos.getState();
const card = (id: string, type: "idee" | "personnage" | "lieu" = "idee", html = "") => ({ id, type, title: id, html });

beforeEach(async () => {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
  await state().start();
  await state().createProject({ title: "Phare", kind: "roman" });
});
afterEach(() => useSettings.setState({ lang: "en" }));

describe("voisinage et cartes masquées (fonctions pures)", () => {
  const cards = [card("a", "personnage", mentionHtml("c", "c")), card("b", "lieu"), card("c"), card("d", "idee", mentionHtml("a", "a")), card("e")];
  const edges = [{ source: "b", target: "a" }];

  it("voisines : fils et mentions, dans les deux sens", () => {
    expect([...neighbourhood("a", cards, edges)].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("par type, sur une carte, et les deux ensemble ; la carte du filtre reste visible", () => {
    expect([...hiddenCards(cards, edges, { ...NO_FILTER, types: ["idee"] })].sort()).toEqual(["c", "d", "e"]);
    expect([...hiddenCards(cards, edges, { ...NO_FILTER, card: "a" })]).toEqual(["e"]);
    expect([...hiddenCards(cards, edges, { types: ["personnage", "lieu"], card: "a", base: null })].sort()).toEqual(["b", "e"]);
    expect(hiddenCards(cards, edges, NO_FILTER).size).toBe(0);
  });

  it("une carte créée pendant le filtre reste visible", () => {
    expect(hiddenCards(cards, edges, { types: ["idee"], card: null, base: ["a", "b", "c", "d"] })).toEqual(new Set(["c", "d"]));
  });
});

describe("filtres dans le projet", () => {
  const two = () => {
    const idea = state().addCard({ x: 0, y: 0 });
    const hero = state().addCard({ x: 600, y: 0 }, "personnage");
    return { idea, hero };
  };

  it("masquer un type retire la sélection de ses cartes, et Ctrl/Cmd + A ne les prend pas", () => {
    const { idea, hero } = two();
    useCosmos.setState({ nodes: state().nodes.map((n) => ({ ...n, selected: true })) });
    state().setFilterTypes(["idee"]);
    expect(state().nodes.find((n) => n.id === idea)!.selected).toBe(false);
    state().selectAll();
    expect(state().nodes.filter((n) => n.selected).map((n) => n.id)).toEqual([hero]);
  });

  it("une carte créée pendant le filtre reste visible", () => {
    two();
    state().setFilterTypes(["idee"]);
    const fresh = state().addCard({ x: 0, y: 900 });
    expect(hiddenCards(state().nodes.map((n) => n.data), state().edges, state().filter).has(fresh)).toBe(false);
  });

  it("ni enregistré, ni annulable ; « Tout afficher » et « Organiser » l'enlèvent", async () => {
    const { hero } = two();
    state().setFilterCard(hero);
    state().setSpotlight(hero);
    await state().save();
    const meta = (await storage.readAll())![META_FILE];
    expect(meta).not.toMatch(/filter|spotlight/);
    state().undo();
    expect(state().filter.card).toBe(hero);
    state().clearFilter();
    expect(state().filter).toEqual(NO_FILTER);
    state().setFilterTypes(["lieu"]);
    state().organizeCanvas();
    expect(state()).toMatchObject({ filter: NO_FILTER, spotlightId: null });
  });
});

describe("mise en avant, carte agrandie", () => {
  it("une carte qui n'existe pas n'est pas mise en avant ; null rend tout", () => {
    const id = state().addCard({ x: 0, y: 0 });
    state().setSpotlight("inconnue");
    expect(state().spotlightId).toBeNull();
    state().setSpotlight(id);
    expect(state().spotlightId).toBe(id);
    state().setSpotlight(null);
    expect(state().spotlightId).toBeNull();
  });

  it("agrandir ouvre la fenêtre de la carte (menu fermé) ; la fermer l'oublie", () => {
    const id = state().addCard({ x: 0, y: 0 });
    state().setCardMenu(id);
    state().expandCard(id);
    expect(state()).toMatchObject({ dialog: "card", expandedId: id, cardMenu: null });
    // Même carte, même état : ce qu'on écrit dans la fenêtre est sur le canevas.
    state().updateCard(id, { title: "Inès" });
    expect(state().nodes.find((n) => n.id === id)!.data.title).toBe("Inès");
    state().setDialog(null);
    expect(state()).toMatchObject({ dialog: null, expandedId: null });
    state().expandCard("inconnue");
    expect(state().dialog).toBeNull();
  });
});
