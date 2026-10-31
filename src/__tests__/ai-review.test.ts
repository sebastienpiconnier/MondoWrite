// Relecture par l'IA (1.9.0) : scènes dans l'ordre du récit, paquets, marqueurs de temps, répliques,
// consignes bornées et lecteurs stricts des réponses.

import { describe, expect, it } from "vitest";
import {
  betaPrompt,
  cardsInScenes,
  continuityPrompts,
  elementFor,
  findQuote,
  novelScenes,
  packScenes,
  parseReview,
  proseLines,
  REVIEW_BUDGET,
  screenplayScenes,
  timeMarkers,
  timelinePrompts,
  voicesPrompt,
  type ReviewScene,
} from "../ai/review";
import { EMPTY_PLAN } from "../plan";
import type { CardData } from "../types";
import type { ScreenplayElement } from "../screenplay/model";
import type { CardNames } from "../ai/tasks";

const card = (id: string, type: CardData["type"], title: string, extra: Partial<CardData> = {}): CardData => ({ id, type, title, html: "", ...extra });
const node = (data: CardData, y: number) => ({ id: data.id, data, position: { x: 0, y } });
const names: CardNames = { type: (t) => (t === "personnage" ? "personnage" : t), untitled: "Sans titre" };

const scene = (n: number, extra: Partial<ReviewScene> = {}): ReviewScene => ({ ref: `s${n}`, number: n, cardId: `c${n}`, at: -1, title: `Scène ${n}`, synopsis: "", text: "", time: "", lines: [], ...extra });

describe("scènes du récit", () => {
  it("roman : ordre du livre, pages calmes écartées, prologue gardé, texte et répliques lus", () => {
    const nodes = [
      node(card("b", "scene", "Le retour"), 200),
      node(card("a", "scene", "L'arrivée", { fiche: { synopsis: "Inès arrive au phare." } }), 100),
      node(card("t", "scene", "Titre", { page: "titre" }), 0),
      node(card("p", "scene", "Prologue", { page: "prologue" }), 0),
      node(card("x", "personnage", "Inès"), 0),
    ];
    const manuscript = { a: "<p>Inès monte.</p><p>— Il y a quelqu’un ?</p><p>Elle dit « Bonsoir » et attend.</p>", b: "<p>Retour.</p>" };
    const list = novelScenes(nodes, EMPTY_PLAN, manuscript);
    expect(list.map((s) => s.cardId)).toEqual(["p", "a", "b"]);
    expect(list.map((s) => s.ref)).toEqual(["s1", "s2", "s3"]);
    expect(list[1]).toMatchObject({ title: "L'arrivée", synopsis: "Inès arrive au phare.", at: -1 });
    expect(list[1].text).toContain("Inès monte.");
    expect(list[1].lines.map((l) => l.text)).toEqual(["Il y a quelqu’un ?", "Bonsoir"]);
  });

  it("passages dialogués d'un roman : guillemets français, anglais, droits et tiret en tête", () => {
    expect(proseLines("<p>“Come in,” she said. \"Now.\"</p><p>– Who’s there?</p><p>Pas de dialogue - ici.</p>")).toEqual(["Come in,", "Now.", "Who’s there?"]);
  });

  it("scénario : ordre du Fountain, moment de l'en-tête, répliques par personnage", () => {
    const elements: ScreenplayElement[] = [
      { type: "sceneHeading", text: "INT. PHARE - NUIT", cardId: "k1" },
      { type: "synopsis", text: "Inès veille." },
      { type: "action", text: "La lanterne tourne." },
      { type: "character", text: "INÈS (V.O.)" },
      { type: "parenthetical", text: "(bas)" },
      { type: "dialogue", text: "Encore une nuit." },
      { type: "sceneHeading", text: "EXT. CÔTE – JOUR" },
      { type: "character", text: "YANN" },
      { type: "dialogue", text: "Tu dors ?" },
    ];
    const list = screenplayScenes(elements, "fr");
    expect(list.map((s) => [s.ref, s.cardId, s.at, s.time])).toEqual([["s1", "k1", 0, "NUIT"], ["s2", null, 6, "JOUR"]]);
    expect(list[0].synopsis).toBe("Inès veille.");
    expect(list[0].lines).toEqual([{ who: "INÈS", text: "Encore une nuit." }]);
    expect(list[0].text).toContain("La lanterne tourne.");
  });
});

describe("paquets", () => {
  it("dans l'ordre, sans dépasser le budget ; un élément trop gros reste seul", () => {
    expect(packScenes([3, 4, 2, 6, 1], (n) => n, 7)).toEqual([[3, 4], [2], [6, 1]]);
    expect(packScenes([10, 1], (n) => n, 5)).toEqual([[10], [1]]);
    expect(packScenes([], (n: number) => n, 5)).toEqual([]);
  });

  it("cohérence : un envoi par paquet, chacun dans le budget, fiches des cartes nommées ou reliées, scènes d'avant résumées", () => {
    const long = "Inès regarde la mer. ".repeat(900); // ~ 19 000 caractères
    const scenes = [1, 2, 3, 4].map((n) => scene(n, { text: n === 4 ? "Yann arrive." : long, synopsis: `Synopsis ${n}` }));
    const cards = [card("ines", "personnage", "Inès Morvan", { fiche: { yeux: "verts" } }), card("yann", "personnage", "Yann"), card("lampe", "objet", "La lampe"), card("idee", "idee", "Inès")];
    const prompts = continuityPrompts(scenes, cards, [{ source: "c4", target: "lampe", label: "" }], "fr", "roman");
    expect(prompts.length).toBeGreaterThanOrEqual(3);
    for (const p of prompts) expect(p.user.length).toBeLessThan(REVIEW_BUDGET);
    const last = JSON.parse(prompts[prompts.length - 1].user);
    expect(last.scenes.map((s: { ref: string }) => s.ref)).toContain("s4");
    expect(last.cards.map((c: { id: string }) => c.id).sort()).toEqual(expect.arrayContaining(["yann", "lampe"]));
    expect(last.cards.map((c: { id: string }) => c.id)).not.toContain("idee");
    expect(last.earlier[0]).toMatchObject({ ref: "s1", title: "Scène 1" });
    expect(prompts[0].system).toMatch(/never by its ref/);
    expect(JSON.parse(prompts[0].user).earlier).toEqual([]);
  });

  it("cartes en jeu : prénom, surnom, titre entier d'un objet, jamais « Max » dans « maximum »", () => {
    const cards = [card("m", "personnage", "Max Dubois"), card("r", "personnage", "Rose", { fiche: { surnoms: "la Rouquine" } }), card("o", "objet", "Clé rouillée")];
    expect(cardsInScenes([scene(1, { text: "Au maximum, la rouquine trouve la clé rouillée." })], cards, []).map((c) => c.id)).toEqual(["r", "o"]);
  });

  it("lecteur bêta : tout le récit tient dans un envoi, même long", () => {
    const scenes = Array.from({ length: 300 }, (_, i) => scene(i + 1, { text: "Texte ".repeat(400), synopsis: "Un synopsis assez long ".repeat(10) }));
    const p = betaPrompt(scenes, "en", "roman")!;
    expect(JSON.parse(p.user).scenes).toHaveLength(300);
    expect(p.user.length).toBeLessThan(REVIEW_BUDGET);
    expect(p.system).toMatch(/"kind"/);
    expect(betaPrompt([scene(1)], "fr", "roman")).toBeNull();
  });
});

describe("marqueurs de temps", () => {
  it("français", () => {
    expect(timeMarkers("Trois jours plus tard, à l’aube, Inès revient. Le lendemain matin, elle repart ; la veille au soir, rien.")).toEqual(["Trois jours plus tard", "à l’aube", "Le lendemain matin", "la veille au soir"]);
    expect(timeMarkers("Le 3 mars 1942, vers midi. En hiver, lundi soir, à 19 h 30. Cette nuit-là.")).toEqual(["Le 3 mars 1942".slice(3), "vers midi", "En hiver", "lundi soir", "19 h 30", "Cette nuit-là"]);
    expect(timeMarkers("Depuis deux semaines, l’été suivant, aujourd’hui.")).toEqual(["Depuis deux semaines", "l’été suivant", "aujourd’hui"]);
  });

  it("anglais", () => {
    expect(timeMarkers("The next morning she left. Two weeks later, in March, at dawn. That night, on Monday.")).toEqual(["The next morning", "Two weeks later", "in March", "at dawn", "That night", "Monday"]);
    expect(timeMarkers("On May 3rd, 1999 at 7:30 pm, later that day; she may go.")).toEqual(["May 3rd, 1999", "7:30 pm", "later that day"]);
  });

  it("pas de faux repère dans les mots, pas de doublon", () => {
    expect(timeMarkers("Max a mangé le maximum ; l’hiverne ; demain, Demain.")).toEqual(["demain"]);
    expect(timeMarkers("Il marche.")).toEqual([]);
  });

  it("chronologie : rien à envoyer sans aucun repère, sinon les marqueurs et le moment de l'en-tête", () => {
    expect(timelinePrompts([scene(1, { text: "Il marche." })], "fr", "roman")).toEqual([]);
    const prompts = timelinePrompts([scene(1, { text: "Le lendemain, il part." }), scene(2, { time: "NUIT", text: "Il dort." })], "fr", "scenario");
    expect(prompts).toHaveLength(1);
    const rows = JSON.parse(prompts[0].user).scenes;
    expect(rows[0].markers).toEqual(["Le lendemain"]);
    expect(rows[1]).toMatchObject({ time: "NUIT", markers: [] });
  });
});

describe("voix", () => {
  it("scénario : répliques par personnage, fiche jointe quand une carte porte le nom, personnages muets écartés", () => {
    const scenes = [
      scene(1, { lines: [{ who: "INÈS", text: "Bonsoir." }, { who: "YANN", text: "Salut." }, { who: "INÈS", text: "Tu viens ?" }] }),
      scene(2, { lines: [{ who: "YANN", text: "Non." }, { who: "LE FACTEUR", text: "Courrier." }] }),
    ];
    const cards = [card("i", "personnage", "Inès Morvan", { fiche: { voix: "Phrases courtes, vouvoie tout le monde." } })];
    const p = voicesPrompt(scenes, cards, "fr", "scenario")!;
    const list = JSON.parse(p.user).characters;
    expect(list.map((c: { name: string }) => c.name)).toEqual(["INÈS", "YANN"]);
    expect(list[0]).toMatchObject({ id: "i", voice: "Phrases courtes, vouvoie tout le monde.", lines: ["s1: Bonsoir.", "s1: Tu viens ?"] });
    expect(list[1].id).toBeUndefined();
    expect(voicesPrompt([scene(1)], cards, "fr", "scenario")).toBeNull();
  });

  it("roman : passages par scène avec les personnages nommés, sans attribution", () => {
    const scenes = [scene(1, { text: "Inès dit : « Bonsoir ».", lines: [{ who: "", text: "Bonsoir" }] }), scene(2, { text: "Rien." })];
    const p = voicesPrompt(scenes, [card("i", "personnage", "Inès Morvan")], "fr", "roman")!;
    expect(JSON.parse(p.user).scenes).toEqual([{ ref: "s1", title: "Scène 1", names: ["Inès Morvan"], lines: ["Bonsoir"] }]);
    expect(p.system).toMatch(/not attributed/);
  });
});

describe("lecture des réponses", () => {
  const scenes = [scene(1, { title: "L'arrivée", text: "Inès a les yeux verts et regarde la mer." }), scene(2, { title: "INT. PHARE - NUIT", cardId: null, at: 7, text: "Ses yeux bleus brillent." })];
  const cards = [card("ines", "personnage", "Inès Morvan"), card("c1", "scene", "L'arrivée")];

  it("scènes par référence, numéro, titre ou carte Scène ; cartes par identifiant ou titre ; rien d'inconnu", () => {
    const reply = JSON.stringify({
      items: [
        { scenes: ["s1", "2"], cards: ["ines", "inconnue"], question: "Inès a-t-elle les yeux verts (s1) ou bleus (s2) ?", quote: "les YEUX verts" },
        { scenes: ["INT. PHARE - NUIT"], cards: ["Inès Morvan (personnage)"], question: "Qui allume la lanterne ?" },
        { scenes: [], cards: ["c1"], question: "Pourquoi arrive-t-elle seule ?" },
        { scenes: ["s9"], cards: [], question: "Scène inventée ?" },
        { scenes: ["s1"], question: "" },
      ],
    });
    const items = parseReview(`Voici : ${reply}`, "continuity", scenes, cards, "fr", names);
    expect(items).toHaveLength(3);
    expect(items[0].scenes.map((s) => s.number)).toEqual([1, 2]);
    expect(items[0].scenes[1]).toMatchObject({ cardId: null, at: 7 });
    expect(items[0].cards).toEqual(["ines"]);
    expect(items[0].question).toBe("Inès a-t-elle les yeux verts («\u00a0L'arrivée\u00a0») ou bleus («\u00a0INT. PHARE - NUIT\u00a0») ?");
    expect(items[0].quote).toBe("les yeux verts");
    expect(items[1].cards).toEqual(["ines"]);
    expect(items[2].scenes[0]).toMatchObject({ cardId: "c1", number: 1 });
    expect(items[2].cards).toEqual([]);
  });

  it("passage cité introuvable : écarté, la question reste ; doublon écarté ; type du bêta vérifié", () => {
    const reply = JSON.stringify([
      { scenes: ["s1"], question: "Je décroche ici ?", quote: "une phrase jamais écrite", kind: "lost" },
      { scenes: ["s1"], question: "Je décroche ici ?" },
      { scenes: ["s2"], question: "Qui parle ?", kind: "boring" },
    ]);
    const items = parseReview(reply, "beta", scenes, cards, "en");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "lost" });
    expect(items[0].quote).toBeUndefined();
    expect(items[1].kind).toBeUndefined();
  });

  it("voix : une carte seule suffit ; ailleurs il faut une scène", () => {
    const reply = JSON.stringify({ items: [{ cards: ["ines"], question: "Inès parle-t-elle comme Yann ?" }] });
    expect(parseReview(reply, "voices", scenes, cards, "fr")).toHaveLength(1);
    expect(parseReview(reply, "timeline", scenes, cards, "fr")).toHaveLength(0);
    expect(parseReview("pas de JSON", "beta", scenes, cards, "fr")).toEqual([]);
  });

  it("passage retrouvé dans une réplique, tel qu'écrit", () => {
    expect(findQuote("« encore UNE nuit »", [scene(1, { lines: [{ who: "INÈS", text: "Encore une nuit." }] })])).toBe("Encore une nuit");
    expect(findQuote("ab", [scene(1, { text: "abc" })])).toBeUndefined();
  });
});

describe("aller à une scène du scénario", () => {
  const elements: ScreenplayElement[] = [
    { type: "sceneHeading", text: "INT. PHARE - NUIT", cardId: "k1" },
    { type: "action", text: "La lanterne tourne." },
    { type: "sceneHeading", text: "EXT. CÔTE - JOUR" },
    { type: "character", text: "YANN" },
    { type: "dialogue", text: "Tu dors\nencore ?" },
  ];
  it("par la carte, par l'index et le titre, par le titre seul, jusqu'au passage cité", () => {
    expect(elementFor(elements, { cardId: "k1", at: 9, number: 1, title: "x" })).toBe(0);
    expect(elementFor(elements, { cardId: "k1", at: 0, number: 1, title: "" }, "lanterne tourne")).toBe(1);
    expect(elementFor(elements, { cardId: null, at: 2, number: 2, title: "EXT. CÔTE - JOUR" }, "tu dors encore")).toBe(4);
    expect(elementFor(elements, { cardId: null, at: 0, number: 2, title: "EXT. CÔTE - JOUR" })).toBe(2);
    expect(elementFor(elements, { cardId: null, at: 2, number: 2, title: "INT. CAVE" })).toBe(-1);
  });
});
