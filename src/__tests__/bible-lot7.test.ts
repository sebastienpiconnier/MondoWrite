// @vitest-environment happy-dom
// Lot 7 de la Bible v2 : cartes du monde, couverture d'une série (Final Draft), fiches, questions de « Vérifier ».

import { describe, expect, it } from "vitest";
import { PART_OF } from "../bibleParts";
import { CARD_TYPES, type CardData } from "../types";
import { isSettledQuestion, readFiche, sheetFields } from "../character";
import { cardToFile, fileToCard } from "../storage/markdown";
import { bySeason, episodeGrid, episodeNumbers, episodeOrder } from "../episodes";
import { chipsFor, pitchFields, readPitch } from "../pitch";
import { readWires, setWireField, wiresToMeta } from "../wires";
import { checkStory, expectedPages } from "../review/checks";
import { scenesNaming } from "../review/filter";
import { scenesNaming as novelScenesNaming } from "../manuscript";
import { bibleDoc } from "../export/doc";
import { buildBiblePack, type PackSource } from "../export/biblePack";
import { defaultsFor } from "../bibleExport";
import { demoProject } from "../demo";
import { fromProject, toProject } from "../projectState";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const card = (id: string, type: CardData["type"], title: string, fiche?: Record<string, string>, html = ""): CardData => ({ id, type, title, html, ...(fiche ? { fiche } : {}) });

describe("cartes du monde", () => {
  it("cinq types, chacun dans sa partie, avec sa fiche et ses libellés", () => {
    for (const type of ["groupe", "objet", "evenement", "regle", "secret"] as const) {
      expect(CARD_TYPES).toContain(type);
      expect(sheetFields(type).length).toBeGreaterThan(2);
      expect(fr.types[type].section).toBeTruthy();
      expect(en.types[type].section).toBeTruthy();
      for (const key of sheetFields(type)) {
        expect((fr.fiche.fields as Record<string, string>)[key] ?? (fr.character.fields as Record<string, string>)[key]).toBeTruthy();
        expect((en.fiche.fields as Record<string, string>)[key] ?? (en.character.fields as Record<string, string>)[key]).toBeTruthy();
      }
    }
    expect(PART_OF.groupe).toBe("univers");
    expect(PART_OF.evenement).toBe("univers");
    expect(PART_OF.secret).toBe("structure");
  });

  it("une carte Secret garde sa fiche dans son fichier", () => {
    const c = card("s1", "secret", "Yann a survécu", { verite: "Il a nagé jusqu’à la côte.", revelation: "Épisode 6", certitude: "provisoire" });
    expect(fileToCard(cardToFile(c))).toEqual(c);
  });

  it("champs à choix : une valeur inconnue est ignorée ; pas de certitude sur une scène", () => {
    expect(readFiche({ certitude: "sur", etat: "decidee", decision: "Elle part." }, "question")).toEqual({ etat: "decidee", decision: "Elle part." });
    expect(readFiche({ certitude: "etabli" }, "lieu")).toEqual({ certitude: "etabli" });
    expect(sheetFields("scene")).not.toContain("certitude");
    expect(sheetFields("scene")).toEqual(expect.arrayContaining(["but", "obstacle", "tournant", "changement"]));
    expect(sheetFields("lien")).toEqual(expect.arrayContaining(["retenir", "fiabilite"]));
    expect(sheetFields("personnage")).toEqual(expect.arrayContaining(["paradoxe", "dilemme", "croyance", "valeur", "angleMort", "strategie"]));
    expect(isSettledQuestion(card("q", "question", "?", { etat: "abandonnee" }))).toBe(true);
    expect(isSettledQuestion(card("q", "question", "?", { etat: "ouverte" }))).toBe(false);
  });
});

describe("saisons et repères", () => {
  const eps = [
    card("a", "episode", "Retour", { saison: "2", numero: "1" }),
    card("b", "episode", "Le phare", { numero: "2" }),
    card("c", "episode", "Le signal", { numero: "1", repere: "final" }),
    card("d", "episode", "Les autres", { saison: "2", numero: "2" }),
  ];
  it("par saison puis par numéro, « 2.1 » dès deux saisons", () => {
    const order = episodeOrder(eps);
    expect(order.map((c) => c.id)).toEqual(["c", "b", "a", "d"]);
    expect([...episodeNumbers(order).values()]).toEqual(["1.1", "1.2", "2.1", "2.2"]);
    expect(bySeason(order).map((g) => [g.season, g.episodes.length])).toEqual([[1, 2], [2, 2]]);
    expect(episodeGrid(eps, []).cols).toEqual(["1.1", "1.2", "2.1", "2.2"]);
  });
  it("une seule saison : les numéros restent simples", () => {
    expect([...episodeNumbers(episodeOrder(eps.slice(1, 3))).values()]).toEqual(["1", "2"]);
  });
  it("repère gardé seulement s'il est connu", () => {
    expect(readFiche({ repere: "milieu" }, "episode")).toEqual({ repere: "milieu" });
    expect(readFiche({ repere: "debut" }, "episode")).toBeUndefined();
  });
});

describe("couverture d'une série", () => {
  it("forme et pilote pour une série seulement ; nouveaux textes relus", () => {
    expect(chipsFor("scenario")).toEqual(expect.arrayContaining(["forme", "pilote"]));
    expect(chipsFor("roman")).not.toContain("forme");
    expect(chipsFor("scenario")).not.toContain("pov");
    expect(pitchFields("scenario")).toEqual(expect.arrayContaining(["avantPilote", "ensemble", "suite", "supports", "forme", "pilote"]));
    expect(pitchFields("roman")).not.toContain("supports");
    expect(readPitch({ avantPilote: "Le naufrage.", forme: "Hybride" })).toEqual({ avantPilote: "Le naufrage.", forme: "Hybride" });
  });
});

describe("fiche d'un fil", () => {
  it("lue pour les fils qui existent, écrite à part des fils", () => {
    const wires = readWires({ l1: { enjeu: "La garde du phare", autre: 3 }, gone: { enjeu: "x" } }, new Set(["l1"]));
    expect([...wires]).toEqual([["l1", { enjeu: "La garde du phare" }]]);
    expect(setWireField({ enjeu: "x" }, "enjeu", " ")).toBeUndefined();
    expect(wiresToMeta([{ id: "l1", data: { fiche: { histoire: "Enfance" } } }, { id: "l2" }])).toEqual({ l1: { histoire: "Enfance" } });
  });

  it("passe par cosmos.json, et un fil supprimé emporte sa fiche", () => {
    const s = fromProject(demoProject());
    const edge = s.edges[0];
    const state = { ...s, edges: s.edges.map((e) => (e.id === edge.id ? { ...e, data: { fiche: { evolution: "De la méfiance à la confiance" } } } : e)), screenplay: null, viewport: undefined };
    const meta = toProject(state as never).meta as { wires?: unknown };
    expect(meta.wires).toEqual({ [edge.id]: { evolution: "De la méfiance à la confiance" } });
    const back = fromProject(toProject(state as never));
    expect(back.edges.find((e) => e.id === edge.id)?.data).toEqual({ fiche: { evolution: "De la méfiance à la confiance" } });
    const without = fromProject(toProject({ ...state, edges: state.edges.filter((e) => e.id !== edge.id) } as never));
    expect((toProject({ ...without, screenplay: null } as never).meta as { wires?: unknown }).wires).toBeUndefined();
  });
});

describe("Vérifier", () => {
  it("longueur attendue d'après le format", () => {
    expect(expectedPages("Série, épisodes de 52 min")).toEqual([47, 60]);
    expect(expectedPages("Series, 30-minute episodes")).toEqual([27, 35]);
    expect(expectedPages("Long métrage")).toEqual([85, 125]);
    expect(expectedPages("Court métrage")).toBeNull();
    expect(expectedPages(undefined)).toBeNull();
  });

  it("pilote trop long, secrets sans révélation ou sans indice, objet nommé une fois", () => {
    const cards = [
      card("s1", "secret", "Yann a survécu"),
      card("s2", "secret", "La dette", { revelation: "Épisode 4" }),
      card("s3", "secret", "Le pacte", { revelation: "Fin de saison", indices: "Les lettres" }),
      card("o1", "objet", "La clé"),
      card("o2", "objet", "Le carnet"),
    ];
    const found = checkStory(cards, [], "scenario", { format: "Série, épisodes de 52 min" }, { pages: 72, named: new Map([["o1", 1], ["o2", 3]]) });
    // Pas de carte Épisode : la question du lot 6 vient aussi, en tête.
    expect(found.map((f) => f.key)).toEqual(["noEpisodes", "pilotLength:47-60", "secretNoReveal:s1", "secretNoClue:s2", "objectOnce:o1"]);
    expect(found[1].counts).toEqual([72, 47, 60]);
    expect(checkStory(cards, [], "scenario", { format: "Série, épisodes de 52 min" }, { pages: 55 }).some((f) => f.rule === "pilotLength")).toBe(false);
  });

  it("scènes qui nomment un objet, dans l'action ou les répliques", () => {
    const elements = [
      { type: "sceneHeading", text: "INT. PHARE - NUIT" },
      { type: "action", text: "Inès cache la clé." },
      { type: "sceneHeading", text: "EXT. PORT - JOUR" },
      { type: "dialogue", text: "Où est la Clé ?" },
      { type: "sceneHeading", text: "INT. CUISINE - JOUR" },
      { type: "action", text: "Rien." },
    ];
    expect(scenesNaming(elements, "La clé")).toEqual([0, 2]);
    const o = card("o", "objet", "La clé");
    expect(novelScenesNaming(o, { a: "<p>Elle prend la clé.</p>", b: "<p>Rien.</p>" }, ["a", "b"])).toBe(1);
  });
});

describe("exports", () => {
  const source = (): PackSource => {
    const s = fromProject(demoProject());
    const extra = [
      card("w1", "groupe", "Les gardiens", { nature: "Confrérie", but: "Garder la lumière", certitude: "provisoire" }, "<p>Ils sont sept.</p>"),
      card("w2", "evenement", "Le naufrage", { quand: "Il y a dix ans" }),
      card("q1", "question", "Inès part-elle ?", { etat: "decidee", decision: "Oui, au dernier épisode." }),
      card("q2", "question", "Yann ment-il ?", { etat: "abandonnee" }),
    ];
    const nodes = [...s.nodes, ...extra.map((data) => ({ ...s.nodes[0], id: data.id, data }))];
    return { title: s.title, kind: "scenario", nodes, edges: s.edges, plan: s.plan, manuscript: s.manuscript, pitch: { ...s.pitch, supports: "Un podcast.", ensemble: "Le phare les retient.", forme: "Hybride" }, screenplay: null, goals: s.goals };
  };
  const ctx = { t: fr, lang: "fr", author: "Camille", date: new Date(2026, 9, 27) };
  const texts = (pack: ReturnType<typeof buildBiblePack>, part: string) => JSON.stringify(pack.sections.filter((x) => x.part === part).map((x) => x.blocks));

  it("PDF : cartes du monde dans l'Univers, certitude pour soi seulement, autres supports pour un tiers seulement", () => {
    const mine = buildBiblePack(source(), defaultsFor("moi"), ctx);
    const theirs = buildBiblePack(source(), defaultsFor("tiers"), ctx);
    expect(texts(mine, "univers")).toContain("Les gardiens");
    expect(texts(mine, "univers")).toContain("Provisoire");
    expect(texts(theirs, "univers")).toContain("Les gardiens");
    expect(texts(theirs, "univers")).not.toContain("Provisoire");
    expect(texts(theirs, "presentation")).toContain("Un podcast.");
    expect(texts(mine, "presentation")).not.toContain("Un podcast.");
    expect(texts(theirs, "presentation")).toContain("Hybride");
    expect(texts(mine, "personnages")).toContain("Le phare les retient.");
    // Questions : la décision prise ; une question abandonnée n'est plus listée.
    expect(texts(mine, "pourVous")).toContain("Oui, au dernier épisode.");
    expect(texts(mine, "pourVous")).not.toContain("Yann ment-il");
  });

  it("Word et Markdown : sans la certitude pour un tiers", () => {
    const cards = [card("w1", "groupe", "Les gardiens", { nature: "Confrérie", certitude: "provisoire" })];
    const strings = { sections: Object.fromEntries(CARD_TYPES.map((t) => [t, t])) as Record<CardData["type"], string>, untitled: "?", linkedTo: "Relié à", fields: { ...fr.character.fields, ...fr.fiche.fields }, arcTypes: { provisoire: "Provisoire" } };
    const mine = JSON.stringify(bibleDoc({ title: "T", author: "", lang: "fr" } as never, cards, [], strings, {}, ["groupe"]));
    const theirs = JSON.stringify(bibleDoc({ title: "T", author: "", lang: "fr" } as never, cards, [], { ...strings, forOther: true }, {}, ["groupe"]));
    expect(mine).toContain("Provisoire");
    expect(theirs).not.toContain("Provisoire");
    expect(theirs).toContain("Confrérie");
  });
});
