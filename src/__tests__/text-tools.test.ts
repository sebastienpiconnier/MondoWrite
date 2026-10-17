// @vitest-environment happy-dom
// Outils du texte : rechercher et remplacer (manuscrit, scénario, cartes), renommer partout, recherche dans
// le texte des scènes, typographie à la frappe.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { finder, keepCase, replaceInElements, replaceInHtml } from "../replace";
import { mentionHtml } from "../mentions";
import { searchCards } from "../search";
import { NBSP, NNBSP, smartType, typographyMode } from "../typography";
import { headingOf, sceneBody } from "../screenplay/sceneText";
import { SHORTCUT_GROUPS } from "../shortcuts";

const state = () => useCosmos.getState();

describe("remplacer (fonctions pures)", () => {
  it("garde la forme de ce qu'il remplace : capitales, capitale initiale", () => {
    expect(keepCase("LOUP", "renard")).toBe("RENARD");
    expect(keepCase("Loup", "renard")).toBe("Renard");
    expect(keepCase("loup", "renard")).toBe("renard");
    expect(keepCase("Loup", "renard", true)).toBe("renard");
  });

  it("dans le HTML : le texte seulement, jamais les balises ni les mentions ; mot entier", () => {
    const re = finder("Inès", { wholeWord: true })!;
    const html = `<p class="Inès">Inès &amp; Yann. ${mentionHtml("a1", "Inès")} Inèsa</p>`;
    const done = replaceInHtml(html, re, "Lise");
    expect(done.count).toBe(1);
    expect(done.html).toBe(`<p class="Inès">Lise &amp; Yann. ${mentionHtml("a1", "Inès")} Inèsa</p>`);
    expect(replaceInHtml(html, finder("Paul")!, "x").html).toBe(html);
    // Un trait d'union lie deux mots : « Mère » n'est pas trouvée dans « Mère-grand ».
    expect(replaceInHtml("<p>la Mère-grand et la Mère</p>", finder("Mère", { wholeWord: true })!, "Tante").html).toBe("<p>la Mère-grand et la Tante</p>");
  });

  it("dans le scénario : les éléments éditables de la plage, en capitales pour un personnage", () => {
    const elements = [
      { type: "sceneHeading" as const, text: "INT. CHAUMIÈRE - JOUR", cardId: "s1" },
      { type: "character" as const, text: "LE LOUP" },
      { type: "dialogue" as const, text: "Le loup a faim." },
      { type: "note" as const, text: "loup" },
    ];
    const done = replaceInElements(elements, finder("loup")!, "renard");
    expect(done.count).toBe(2);
    expect(done.elements.map((el) => el.text)).toEqual(["INT. CHAUMIÈRE - JOUR", "LE RENARD", "Le renard a faim.", "loup"]);
    expect(replaceInElements(elements, finder("loup")!, "renard", false, 2, 3).elements[1]).toBe(elements[1]);
  });
});

describe("dans le projet", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
  });
  afterEach(() => useSettings.setState({ lang: "en" }));

  it("roman : une scène ou tout le texte, les cartes en option ; « Annuler » remet tout", async () => {
    await state().createProject({ title: "Phare", kind: "roman" });
    const a = state().addCard({ x: 0, y: 0 }, "scene");
    const b = state().addCard({ x: 0, y: 400 }, "scene");
    const note = state().addCard({ x: 600, y: 0 });
    state().setManuscriptText(a, "<p>Inès monte.</p>");
    state().setManuscriptText(b, "<p>Inès descend.</p>");
    state().updateCard(note, { html: "<p>Inès a peur.</p>" });
    const req = { find: "Inès", replacement: "Lise", wholeWord: true };
    expect(state().countReplace({ ...req, sceneId: a })).toBe(1);
    expect(state().countReplace({ ...req, cards: true })).toBe(3);
    expect(state().replaceText({ ...req, sceneId: a })).toBe(1);
    expect(state().manuscript).toMatchObject({ [a]: "<p>Lise monte.</p>", [b]: "<p>Inès descend.</p>" });
    state().undoReplace();
    expect(state().manuscript[a]).toBe("<p>Inès monte.</p>");
    expect(state().replaceText({ ...req, cards: true })).toBe(3);
    expect(state().nodes.find((n) => n.id === note)!.data.html).toBe("<p>Lise a peur.</p>");
    state().undoReplace();
    expect(state().nodes.find((n) => n.id === note)!.data.html).toBe("<p>Inès a peur.</p>");
    expect(state().manuscript[b]).toBe("<p>Inès descend.</p>");
  });

  it("renommer partout : la carte, ses mentions, et le texte", async () => {
    await state().createProject({ title: "Phare", kind: "roman" });
    const ines = state().addCard({ x: 0, y: 0 }, "personnage");
    state().updateCard(ines, { title: "Inès" });
    const scene = state().addCard({ x: 0, y: 400 }, "scene");
    state().setManuscriptText(scene, `<p>${mentionHtml(ines, "Inès")} arrive. Inès a froid.</p>`);
    state().replaceText({ find: "Inès", replacement: "Lise", wholeWord: true, cards: true, renameId: ines });
    expect(state().nodes.find((n) => n.id === ines)!.data.title).toBe("Lise");
    expect(state().manuscript[scene]).toBe(`<p>${mentionHtml(ines, "Inès")} arrive. Lise a froid.</p>`);
    state().undoReplace();
    expect(state().nodes.find((n) => n.id === ines)!.data.title).toBe("Inès");
    expect(state().manuscript[scene]).toBe(`<p>${mentionHtml(ines, "Inès")} arrive. Inès a froid.</p>`);
  });

  it("scénario : les en-têtes changés renomment leur carte", async () => {
    await state().createProject({ title: "Phare", kind: "scenario" });
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    state().setSceneText(id, [{ type: "action", text: "Le phare tourne." }]);
    expect(state().replaceText({ find: "phare", replacement: "moulin" })).toBe(2);
    expect(state().nodes.find((n) => n.id === id)!.data.title).toBe("INT. MOULIN - NUIT");
    const elements = state().screenplay!.elements;
    expect(sceneBody(elements, headingOf(elements, id))[0].text).toBe("Le moulin tourne.");
  });
});

describe("recherche dans le texte des scènes", () => {
  it("une scène trouvée par son texte est signalée « dans le texte »", () => {
    const cards = [{ id: "s1", type: "scene" as const, title: "Arrivée", html: "" }];
    const [hit] = searchCards(cards, "chevillette", "fr", 20, { s1: "Tire la chevillette, la bobinette cherra." });
    expect(hit).toMatchObject({ id: "s1", inText: true });
    expect(searchCards(cards, "arrivée", "fr", 20, { s1: "Rien." })[0].inText).toBeUndefined();
  });
});

describe("typographie à la frappe", () => {
  it("français : guillemets, espaces insécables, ponctuation haute", () => {
    expect(smartType("Il dit ", '"', "fr")).toEqual({ remove: 0, insert: `«${NBSP}` });
    expect(smartType(`Il dit «${NBSP}oui `, '"', "fr")).toEqual({ remove: 1, insert: `${NBSP}»` });
    expect(smartType(`«${NBSP}`, " ", "fr")).toEqual({ remove: 0, insert: "" });
    expect(smartType("Vraiment ", "?", "fr")).toEqual({ remove: 1, insert: `${NNBSP}?` });
    expect(smartType("Vraiment", "!", "fr")).toEqual({ remove: 0, insert: `${NNBSP}!` });
    expect(smartType(`Quoi${NNBSP}?`, "!", "fr")).toBeNull();
    expect(smartType("Voici ", ":", "fr")).toEqual({ remove: 1, insert: `${NBSP}:` });
    expect(smartType("12", ":", "fr")).toBeNull();
    expect(smartType("l", "'", "fr")).toEqual({ remove: 0, insert: "’" });
  });

  it("anglais, et commun aux deux", () => {
    expect(smartType("She said ", '"', "en")).toEqual({ remove: 0, insert: "“" });
    expect(smartType("She said “yes", '"', "en")).toEqual({ remove: 0, insert: "”" });
    expect(smartType("don", "'", "en")).toEqual({ remove: 0, insert: "’" });
    expect(smartType("Wait..", ".", "en")).toEqual({ remove: 2, insert: "…" });
    expect(smartType("-", "-", "fr")).toEqual({ remove: 1, insert: "—" });
    expect(smartType("Vraiment ", "?", "en")).toBeNull();
    expect(smartType("x", '"', "off")).toBeNull();
    expect(typographyMode("auto", "fr")).toBe("fr");
    expect(typographyMode("auto", "en")).toBe("en");
  });

  it("le raccourci est dans la liste d'aide", () => {
    expect(SHORTCUT_GROUPS.everywhere.some(([item]) => item === "replace")).toBe(true);
  });
});

describe("renommer un nom qui est aussi un mot", () => {
  it("« Will » ne touche jamais « will », et l'auteur décide en tête de phrase", async () => {
    const { findOccurrences, isAlsoAWord } = await import("../replace");
    await state().createProject({ title: "Hope", kind: "roman" });
    const will = state().addCard({ x: 0, y: 0 }, "personnage");
    state().updateCard(will, { title: "Will" });
    const scene = state().addCard({ x: 0, y: 400 }, "scene");
    state().setManuscriptText(scene, "<p>Will you come? Will said he will.</p><p>Rose rose early. WILL.</p>");
    const req = { find: "Will", replacement: "Liam", wholeWord: true, nameCase: true, cards: true, renameId: will };
    const occ = findOccurrences(state(), req);
    expect(occ.map((o) => o.match)).toEqual(["Will", "Will", "WILL"]);
    expect(occ.map((o) => o.sentenceStart)).toEqual([true, true, true]);
    expect(isAlsoAWord(state(), "Will")).toBe(true);
    expect(isAlsoAWord(state(), "Rose")).toBe(true);
    expect(isAlsoAWord(state(), "Liam")).toBe(false);
    // L'auteur garde « Will you come? » (le mot) et renomme le reste.
    expect(state().replaceText({ ...req, skip: [occ[0].key] })).toBe(2);
    expect(state().manuscript[scene]).toBe("<p>Will you come? Liam said he will.</p><p>Rose rose early. LIAM.</p>");
    expect(state().nodes.find((n) => n.id === will)!.data.title).toBe("Liam");
    state().undoReplace();
    expect(state().manuscript[scene]).toBe("<p>Will you come? Will said he will.</p><p>Rose rose early. WILL.</p>");
  });

  it("dans un scénario, une réplique en capitales n'est jamais en doute", async () => {
    const { findOccurrences } = await import("../replace");
    await state().createProject({ title: "Phare", kind: "scenario" });
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    state().setSceneText(id, [
      { type: "character", text: "HOPE" },
      { type: "dialogue", text: "Hope is all we have." },
    ]);
    const occ = findOccurrences(state(), { find: "Hope", replacement: "Ada", wholeWord: true, nameCase: true });
    expect(occ.map((o) => [o.match, o.sentenceStart, o.label])).toEqual([
      ["HOPE", false, "INT. PHARE - NUIT"],
      ["Hope", true, "INT. PHARE - NUIT"],
    ]);
  });
});

describe("nom à article", () => {
  it("« The Wolf » trouve aussi « the Wolf » et garde l'article en minuscule", async () => {
    const { finder, replaceInText, caseMode } = await import("../replace");
    const req = { find: "The Wolf", wholeWord: true, nameCase: true };
    const re = finder(req.find, req)!;
    expect(replaceInText("The Wolf ran. Said the Wolf to the wolf.", re, "The Ogre", caseMode(req)).text).toBe("The Ogre ran. Said the Ogre to the wolf.");
    const dv = { find: "de Villiers", wholeWord: true, nameCase: true };
    expect(replaceInText("Puis de Villiers partit. DE VILLIERS.", finder(dv.find, dv)!, "Dupont", caseMode(dv)).text).toBe("Puis Dupont partit. DUPONT.");
  });
});
