// @vitest-environment happy-dom
// Annuler, rétablir et recherche.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { findInText, findPassages, highlightRanges, matchesIn, nthMatch, plainText, searchCards } from "../search";
import { serialize } from "../screenplay/serialize";
import type { CardData } from "../types";

const state = () => useCosmos.getState();
const titles = () => state().nodes.map((n) => n.data.title);

async function newProject(kind: "roman" | "scenario") {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {}, past: [], future: [] });
  await state().start();
  await state().createProject({ title: "Essai", kind });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  useSettings.setState({ lang: "en" });
});
/** Une pause entre deux gestes : ils ne seront pas fondus en une seule étape. */
const pause = () => vi.advanceTimersByTime(2000);

describe("annuler et rétablir", () => {
  beforeEach(() => newProject("roman"));

  it("projet tout juste ouvert : rien à annuler", () => {
    expect(state().past).toEqual([]);
    state().undo();
    state().redo();
    expect(state().nodes).toEqual([]);
  });

  it("créer, nommer, supprimer une carte, puis tout remonter et redescendre", () => {
    const id = state().addCard({ x: 0, y: 0 }, "personnage");
    pause();
    state().updateCard(id, { title: "Inès Morvan" });
    pause();
    state().deleteCard(id);
    expect(titles()).toEqual([]);

    state().undo();
    expect(titles()).toEqual(["Inès Morvan"]);
    state().undo();
    expect(titles()).toEqual([""]);
    state().undo();
    expect(titles()).toEqual([]);
    expect(state().past).toEqual([]);

    state().redo();
    state().redo();
    expect(titles()).toEqual(["Inès Morvan"]);
    state().redo();
    expect(titles()).toEqual([]);
    expect(state().future).toEqual([]);
  });

  it("les lettres d'un titre tapées d'affilée ne font qu'une étape ; après une pause, une nouvelle", () => {
    const id = state().addCard({ x: 0, y: 0 });
    pause();
    for (const title of ["I", "In", "Inè", "Inès"]) {
      state().updateCard(id, { title });
      vi.advanceTimersByTime(150);
    }
    pause();
    for (const title of ["Inès M", "Inès Morvan"]) state().updateCard(id, { title });

    state().undo();
    expect(titles()).toEqual(["Inès"]);
    state().undo();
    expect(titles()).toEqual([""]);
  });

  it("le texte d'une carte et son titre sont des étapes distinctes", () => {
    const id = state().addCard({ x: 0, y: 0 });
    state().updateCard(id, { title: "Inès" });
    state().updateCard(id, { html: "<p>Gardienne.</p>" });
    state().undo();
    expect(state().nodes[0].data).toMatchObject({ title: "Inès", html: "" });
  });

  it("un déplacement est une seule étape, quelle que soit sa longueur", () => {
    const id = state().addCard({ x: 0, y: 0 });
    pause();
    for (let x = 10; x <= 200; x += 10) {
      state().onNodesChange([{ id, type: "position", position: { x, y: 0 }, dragging: true }]);
      vi.advanceTimersByTime(30);
    }
    expect(state().nodes[0].position.x).toBe(200);
    state().undo();
    expect(state().nodes[0].position.x).toBe(0);
    state().redo();
    expect(state().nodes[0].position.x).toBe(200);
  });

  it("la sélection et la mesure d'une carte n'entrent pas dans l'historique", () => {
    const id = state().addCard({ x: 0, y: 0 });
    const steps = state().past.length;
    state().onNodesChange([{ id, type: "select", selected: true }]);
    state().onNodesChange([{ id, type: "dimensions", dimensions: { width: 240, height: 180 } }]);
    expect(state().past).toHaveLength(steps);
  });

  it("fils : tirer, étiqueter, supprimer", () => {
    const a = state().addCard({ x: 0, y: 0 });
    const b = state().addCard({ x: 400, y: 0 });
    pause();
    state().onConnect({ source: a, target: b, sourceHandle: null, targetHandle: null });
    const link = state().edges[0].id;
    pause();
    state().renameLink(link, "soupçonne");
    pause();
    state().onEdgesChange([{ id: link, type: "remove" }]);
    expect(state().edges).toEqual([]);

    state().undo();
    expect(state().edges[0].label).toBe("soupçonne");
    state().undo();
    expect(state().edges[0].label).toBe("");
    state().undo();
    expect(state().edges).toEqual([]);
  });

  it("supprimer une carte emporte ses fils ; annuler les ramène", () => {
    const a = state().addCard({ x: 0, y: 0 });
    const b = state().addCard({ x: 400, y: 0 });
    state().linkCards(a, b, "y travaille");
    pause();
    state().deleteCard(a);
    expect(state().edges).toEqual([]);
    state().undo();
    expect(state().nodes).toHaveLength(2);
    expect(state().edges).toHaveLength(1);
  });

  it("une nouvelle action après une annulation efface ce qui pouvait être rétabli", () => {
    state().addCard({ x: 0, y: 0 });
    pause();
    state().addCard({ x: 400, y: 0 });
    state().undo();
    expect(state().future).toHaveLength(1);
    state().addCard({ x: 0, y: 400 });
    expect(state().future).toEqual([]);
  });

  it("annuler marque le projet comme modifié et désélectionne les cartes", () => {
    const id = state().addCard({ x: 0, y: 0 });
    pause();
    state().updateCard(id, { title: "Inès" });
    useCosmos.setState({ status: "enregistre" });
    state().undo();
    expect(state().status).toBe("modifie");
    expect(state().nodes.every((n) => !n.selected)).toBe(true);
  });

  it("ouvrir un autre projet repart d'un historique vide", async () => {
    state().addCard({ x: 0, y: 0 });
    await state().closeProject();
    await state().openProject(state().projects[0].id);
    expect(state().past).toEqual([]);
    expect(state().nodes).toHaveLength(1);
  });
});

describe("annuler dans un scénario", () => {
  beforeEach(() => newProject("scenario"));
  const fountain = () => serialize(state().screenplay!);

  it("une carte Scène et son en-tête partent et reviennent ensemble", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    pause();
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    expect(fountain()).toContain("INT. PHARE - NUIT");
    state().undo();
    expect(fountain()).toBe("Title: Essai\n");
    state().redo();
    expect(fountain()).toContain(`INT. PHARE - NUIT [[cosmos:${id}]]`);
  });

  it("carte Scène supprimée au clavier (Suppr) : son en-tête vide part aussi, et revient à l'annulation", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    pause();
    state().onNodesChange([{ id, type: "remove" }]);
    expect(fountain()).toBe("Title: Essai\n");
    state().undo();
    expect(fountain()).toContain(`INT. PHARE - NUIT [[cosmos:${id}]]`);
  });

  it("le texte écrit dans l'éditeur n'est jamais effacé par une annulation du canevas", () => {
    state().addCard({ x: 0, y: 0 }, "personnage");
    expect(state().past.length).toBeGreaterThan(0);
    // L'éditeur de scénario envoie son texte : l'historique du canevas est vidé.
    const sp = state().screenplay!;
    state().setScreenplay({ ...sp, elements: [{ type: "action", text: "Dix pages plus tard." }] });
    expect(state().past).toEqual([]);
    state().undo();
    expect(fountain()).toContain("Dix pages plus tard.");
  });

  it("réordonner des scènes dans le séquencier s'annule", () => {
    const sp = state().screenplay!;
    const elements = [
      { type: "sceneHeading" as const, text: "INT. A - JOUR" },
      { type: "sceneHeading" as const, text: "EXT. B - NUIT" },
    ];
    state().setScreenplay({ ...sp, elements });
    state().setScreenplay({ ...sp, elements: [elements[1], elements[0]] }, true);
    state().undo();
    expect(state().screenplay!.elements.map((el) => el.text)).toEqual(["INT. A - JOUR", "EXT. B - NUIT"]);
  });
});

describe("recherche", () => {
  const card = (id: string, type: CardData["type"], title: string, html = ""): CardData => ({ id, type, title, html });
  const cards = [
    card("1", "personnage", "Inès Morvan", "<p>Gardienne <strong>remplaçante</strong>.</p><p>Ne supporte pas le silence.</p>"),
    card("2", "lieu", "Phare de Kerlaouen", "<p>Îlot accessible à marée basse.</p>"),
    card("3", "scene", "Inès trouve le journal de bord", "<p>Dernière entrée datée d’après la disparition.</p>"),
    card("4", "idee", "", "<p>Un phare qui s’allume tout seul chaque 13 du mois ?</p>"),
    card("5", "personnage", "Hugo Le Bris", "<p>Pêcheur, ancien ami d’Inès &amp; du gardien.</p>"),
  ];
  const found = (query: string) => searchCards(cards, query, "fr").map((r) => r.id);

  it("sans casse ni accents, dans les titres et le texte", () => {
    expect(found("ines")).toEqual(["1", "3", "5"]);
    expect(found("PHARE")).toEqual(["2", "4"]);
    expect(found("marée")).toEqual(["2"]);
    expect(found("remplacante")).toEqual(["1"]);
  });

  it("le titre passe avant le texte ; un titre qui commence par le mot, avant les autres", () => {
    expect(found("inès")).toEqual(["1", "3", "5"]);
    expect(found("journal")).toEqual(["3"]);
  });

  it("plusieurs mots : tous doivent être présents, où qu'ils soient", () => {
    expect(found("inès silence")).toEqual(["1"]);
    // « gardien » se trouve aussi dans « Gardienne » : un mot cherché peut être le début d'un autre.
    expect(found("inès gardien")).toEqual(["5", "1"]);
    expect(found("inès pêcheur")).toEqual(["5"]);
    expect(found("inès tempête")).toEqual([]);
  });

  it("rien de tapé, ou que des espaces : aucun résultat", () => {
    expect(found("")).toEqual([]);
    expect(found("   ")).toEqual([]);
  });

  it("extrait lisible, sans balises ni entités", () => {
    expect(plainText(cards[0].html)).toBe("Gardienne remplaçante. Ne supporte pas le silence.");
    expect(searchCards(cards, "hugo", "fr")[0]).toEqual({
      id: "5",
      type: "personnage",
      title: "Hugo Le Bris",
      excerpt: "Pêcheur, ancien ami d’Inès & du gardien.",
    });
  });

  it("un long texte est coupé autour de ce qui a été trouvé", () => {
    const long = card("6", "theme", "Le silence", `<p>${"mot ".repeat(60)}tempête ${"fin ".repeat(60)}</p>`);
    const [result] = searchCards([long], "tempête", "fr");
    expect(result.excerpt).toContain("tempête");
    expect(result.excerpt.length).toBeLessThan(110);
    expect(result.excerpt.startsWith("…")).toBe(true);
  });

  it("montrer une carte : vue Canevas, carte centrée et sélectionnée", async () => {
    await newProject("roman");
    const a = state().addCard({ x: 0, y: 0 });
    const b = state().addCard({ x: 400, y: 0 });
    state().setView("bible");
    state().revealCard(a);
    expect(state()).toMatchObject({ view: "toile", focusId: a });
    expect(state().nodes.map((n) => n.selected)).toEqual([true, false]);
    state().revealCard("inconnue");
    expect(state().focusId).toBe(a);
    expect(b).not.toBe(a);
  });
});

describe("mot trouvé dans le texte d'une scène (#85)", () => {
  it("sans casse ni accents, à la position du texte d'origine", () => {
    const text = "Le jeune Edmond Dantès revint à Marseille.";
    expect(findInText(text, "dantes")).toEqual({ at: text.indexOf("Dantès"), length: 6 });
    expect(findInText(text, "MARSEILLE")).toEqual({ at: text.indexOf("Marseille"), length: 9 });
  });

  it("plusieurs mots : la saisie entière, sinon le premier mot trouvé", () => {
    const text = "Mercédès attend. Plus tard, Edmond Dantès revient.";
    expect(findInText(text, "edmond  dantes")).toEqual({ at: text.indexOf("Edmond"), length: 13 });
    expect(findInText(text, "dantes mercedes")).toEqual({ at: text.indexOf("Dantès"), length: 6 });
    expect(findInText(text, "dantes mercedes", true)).toBeNull();
  });

  it("une espace insécable vaut une espace ; une lettre décomposée garde sa place", () => {
    const text = "Il dit\u00a0: « Abbe\u0301 Faria ».";
    expect(findInText(text, "dit :")).toEqual({ at: 3, length: 5 });
    expect(findInText(text, "faria")?.at).toBe(text.indexOf("Faria"));
  });

  it("rien à chercher ou rien trouvé : null", () => {
    expect(findInText("Texte", "   ")).toBeNull();
    expect(findInText("Texte", "absent")).toBeNull();
  });
});

describe("recherche des vues d'écriture : un résultat par passage (#85)", () => {
  const units = [
    { target: "s1", title: "Le château d’If", texts: ["Dantès entre au cachot.", "Dantès creuse, encore et encore."] },
    { target: "s2", title: "Le trésor", texts: ["L’abbé parle à DANTES du trésor."] },
  ];

  it("chaque occurrence, sans casse ni accents, dans l'ordre du livre, avec son rang dans la scène", () => {
    const found = findPassages(units, "dantes");
    expect(found.map((p) => [p.target, p.nth])).toEqual([["s1", 0], ["s1", 1], ["s2", 0]]);
    expect(found[1].excerpt).toContain("creuse");
  });

  it("plusieurs mots : la saisie entière seulement ; limite du nombre de résultats", () => {
    expect(findPassages(units, "dantes creuse").map((p) => p.target)).toEqual(["s1"]);
    expect(findPassages(units, "creuse dantes")).toEqual([]);
    expect(findPassages(units, "dantes", 2)).toHaveLength(2);
    expect(findPassages(units, "  ")).toEqual([]);
  });

  it("nthMatch retrouve la même occurrence que la liste, dans le bon paragraphe", () => {
    const texts = units[0].texts;
    expect(nthMatch(texts, "DANTÈS", 1)).toEqual({ index: 1, at: 0, length: 6 });
    expect(nthMatch(texts, "encore", 1)).toEqual({ index: 1, at: texts[1].lastIndexOf("encore"), length: 6 });
    expect(nthMatch(texts, "dantes", 2)).toBeNull();
  });

  it("surligne tous les mots des cartes, mais seulement la saisie entière des passages", () => {
    const text = "Le loup dans le blé, un autre LOUP.";
    expect(highlightRanges(text, "ble loup lou", true).map(({ start, end }) => text.slice(start, end))).toEqual(["loup", "blé", "LOUP"]);
    expect(highlightRanges(text, "ble loup")).toEqual([]);
    expect(highlightRanges(text, "le ble")).toEqual([{ start: 13, end: 19 }]);
  });

  it("matchesIn : occurrences sans chevauchement", () => {
    expect(matchesIn("aaaa", "aa")).toEqual([0, 2]);
    expect(matchesIn("Été, été.", "ete")).toEqual([0, 5]);
  });
});
