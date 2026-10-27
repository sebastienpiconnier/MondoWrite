// @vitest-environment happy-dom
// Corrections d'octobre 2026 : fiche de personnage, questions dans la carte, chapitres du plan,
// rangement du canevas, statistiques du manuscrit.

import { beforeEach, describe, expect, it } from "vitest";
import { addQuestion, legacyParkedCards, readFiche, readQuestions, removeQuestion, setFicheField } from "../character";
import { cardToFile, fileToCard } from "../storage/markdown";
import {
  EMPTY_PLAN,
  assignChapter,
  chapterNumbers,
  groupByChapter,
  prunePlan,
  readPlan,
  removeChapter,
  renameChapter,
  startChapter,
  type Plan,
} from "../plan";
import { organize, typeColumns } from "../organize";
import { dayKey, firstPageOf, manuscriptStats, readGoals, readProgress, recordProgress, streak, wordsOn } from "../stats";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string, html = ""): CardData => ({ id, type, title, html });

describe("fiche de personnage", () => {
  it("lecture prudente : clés connues et textes seulement", () => {
    expect(readFiche({ age: "34", metier: " ", inconnu: "x", peur: 3 })).toEqual({ age: "34" });
    expect(readFiche(["age"])).toBeUndefined();
    expect(readQuestions(["  Pourquoi ? ", "Pourquoi ?", 4, ""])).toEqual(["Pourquoi ?"]);
    expect(setFicheField({ age: "34" }, "age", "")).toBeUndefined();
    expect(addQuestion(["a"], "a")).toEqual(["a"]);
    expect(removeQuestion(["a"], "a")).toBeUndefined();
  });

  it("aller-retour sur disque : fiche et questions dans le frontmatter", () => {
    const c: CardData = { ...card("p1", "personnage", "Inès"), html: "<p>Gardienne.</p>", fiche: { age: "34", secret: "Elle a: un \"frère\"" }, questions: ["Que cache-t-elle ?"] };
    const file = cardToFile(c);
    expect(file).toContain('fiche: {"age":"34"');
    expect(fileToCard(file)).toMatchObject({ fiche: c.fiche, questions: c.questions });
    // Un fichier d'une version précédente n'a ni l'un ni l'autre.
    expect(fileToCard("---\nid: p1\ntype: personnage\ntitle: \"Inès\"\n---\n")).not.toHaveProperty("fiche");
  });

  it("anciennes cartes « à creuser » : retrouvées d'après leur fil et leur titre", () => {
    const cards = [card("p1", "personnage", "Inès"), card("q1", "question", "Inès : Que cache-t-elle ?"), card("q2", "question", "Autre"), card("q3", "question", "Inès : Écrite", "<p>notes</p>")];
    const links = [
      { source: "q1", target: "p1", label: "à creuser" },
      { source: "q2", target: "p1", label: "soupçonne" },
      { source: "q3", target: "p1", label: "à creuser" },
    ];
    expect(legacyParkedCards(cards, links, ["à creuser", "to dig into"])).toEqual([{ cardId: "q1", characterId: "p1", question: "Que cache-t-elle ?" }]);
  });
});

describe("chapitres", () => {
  const order = ["s1", "s2", "s3", "s4"];

  it("couper le récit : un chapitre commence à une scène et prend la suite", () => {
    let plan = startChapter(EMPTY_PLAN, order, "s1", "c1", "Le phare");
    expect(plan.chapters).toEqual([{ id: "c1", title: "Le phare", scenes: order }]);
    plan = startChapter(plan, order, "s3", "c2");
    expect(plan.chapters!.map((c) => c.scenes)).toEqual([["s1", "s2"], ["s3", "s4"]]);
    expect(groupByChapter(plan, order).map((g) => [g.chapter?.id, g.ids])).toEqual([["c1", ["s1", "s2"]], ["c2", ["s3", "s4"]]]);
    expect([...chapterNumbers(plan, order)]).toEqual([["c1", 1], ["c2", 2]]);
  });

  it("ranger, renommer, supprimer (les scènes rejoignent le chapitre précédent)", () => {
    let plan = startChapter(startChapter(EMPTY_PLAN, order, "s1", "c1"), order, "s3", "c2");
    plan = assignChapter(plan, "s2", "c2");
    expect(plan.chapters!.map((c) => c.scenes)).toEqual([["s1"], ["s3", "s4", "s2"]]);
    expect(assignChapter(plan, "s2", "c2")).toBe(plan);
    expect(renameChapter(plan, "c2", "Retour").chapters![1].title).toBe("Retour");
    plan = removeChapter(plan, order, "c2");
    expect(plan.chapters).toEqual([{ id: "c1", title: "", scenes: ["s1", "s3", "s4", "s2"] }]);
  });

  it("fichier : lu, élagué, ignoré s'il est mal formé", () => {
    const raw = { template: "libre", beats: {}, chapters: [{ id: "c1", title: "A", scenes: ["s1", "s1", 3] }, { id: "c1" }, { title: "sans id" }, { id: "c2", scenes: ["s1"] }] };
    const plan = readPlan(raw);
    expect(plan.chapters).toEqual([{ id: "c1", title: "A", scenes: ["s1"] }, { id: "c2", title: "", scenes: [] }]);
    const pruned = prunePlan(plan, new Set(["s9"]));
    expect(pruned.chapters).toEqual([{ id: "c1", title: "A", scenes: [] }]);
    expect(prunePlan({ template: "libre", beats: {}, chapters: [{ id: "c", title: "", scenes: [] }] }, new Set())).toEqual(EMPTY_PLAN);
  });
});

describe("organiser le canevas", () => {
  const labels = {
    groups: { idee: "Idées", personnage: "Personnages", lieu: "Lieux", scene: "Scènes", intrigue: "Intrigues", theme: "Thèmes", question: "Questions", image: "Images", lien: "Liens", document: "Documents" },
    beat: (k: string) => k,
    chapter: (n: number, title: string) => (title ? `Chapitre ${n} · ${title}` : `Chapitre ${n}`),
    continued: (label: string) => `${label} (suite)`,
    unplaced: "À placer",
    story: "Scènes",
    pages: "Pages du livre",
  };
  let n = 0;
  const newId = () => `f${++n}`;
  beforeEach(() => (n = 0));
  const cards = [
    { id: "p1", type: "personnage" as const, width: 240, height: 120 },
    { id: "s1", type: "scene" as const, width: 240, height: 120 },
    { id: "s2", type: "scene" as const, width: 240, height: 120 },
    { id: "s3", type: "scene" as const, width: 240, height: 120 },
    { id: "i1", type: "idee" as const, width: 240, height: 120 },
  ];

  it("cadres par type, chapitres dans les cases du gabarit, scènes reliées dans l'ordre", () => {
    const plan: Plan = { template: "troisActes", beats: { a_setup: ["s1", "s2"], a_climax: ["s3"] }, chapters: [{ id: "c1", title: "Arrivée", scenes: ["s1", "s2"] }] };
    const r = organize({ cards, plan, sceneIds: ["s1", "s2", "s3"], labels, origin: { x: 0, y: 0 }, newId });
    expect(r.frames.map((f) => f.title)).toEqual(["Personnages", "a_setup", "Chapitre 1 · Arrivée", "a_climax", "Idées"]);
    expect(r.positions.size).toBe(5);
    expect(r.sequence).toEqual([["s1", "s2"], ["s2", "s3"]]);
    // Le chapitre est dans sa case, ses scènes dans le chapitre.
    const [, beat, chapter] = r.frames;
    const inside = (a: typeof beat, b: typeof beat) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
    expect(inside(chapter, beat)).toBe(true);
    const s1 = r.positions.get("s1")!;
    expect(inside({ ...chapter, ...s1, width: 240, height: 120 }, chapter)).toBe(true);
    // Aucun chevauchement entre cartes.
    const boxes = [...r.positions.values()].map((p) => ({ ...p, width: 240, height: 120 }));
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.x + 240 <= b.x || b.x + 240 <= a.x || a.y + 120 <= b.y || b.y + 120 <= a.y).toBe(true);
  });

  it("un chapitre sur deux cases : son titre une fois, « (suite) » ensuite ; un cadre étroit laisse lire son titre", () => {
    const plan: Plan = { template: "troisActes", beats: { a_setup: ["s1"], a_climax: ["s2", "s3"] }, chapters: [{ id: "c1", title: "Une très longue arrivée au phare", scenes: ["s1", "s2", "s3"] }] };
    const r = organize({ cards, plan, sceneIds: ["s1", "s2", "s3"], labels, origin: { x: 0, y: 0 }, newId });
    expect(r.frames.map((f) => f.title)).toEqual(["Personnages", "a_setup", "Chapitre 1 · Une très longue arrivée au phare", "a_climax", "Chapitre 1 (suite)", "Idées"]);
    const chapter = r.frames[2];
    expect(chapter.width).toBeGreaterThanOrEqual(Math.ceil(chapter.title.length * 8.5) + 120);
  });

  it("en paysage : cases côte à côte, à la ligne quand la rangée est pleine, scènes d'une case sur une ligne", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, type: "scene" as const, width: 240, height: 120 }));
    const ids = many.map((c) => c.id);
    const beats = { a_setup: ids.slice(0, 3), a_incident: ids.slice(3, 6), a_confrontation: ids.slice(6, 8), a_crisis: ids.slice(8, 10), a_climax: ids.slice(10) };
    const r = organize({ cards: many, plan: { template: "troisActes", beats }, sceneIds: ids, labels, origin: { x: 0, y: 0 }, newId });
    const frame = (title: string) => r.frames.find((f) => f.title === title)!;
    // Lecture de gauche à droite, puis de haut en bas : chaque case après la précédente.
    const keys = Object.keys(beats);
    for (let k = 1; k < keys.length; k++) {
      const [prev, next] = [frame(keys[k - 1]), frame(keys[k])];
      expect(next.y > prev.y || (next.y === prev.y && next.x > prev.x)).toBe(true);
    }
    expect(frame("a_crisis").y).toBeGreaterThan(frame("a_setup").y);
    // Les scènes d'une case sont sur une même ligne.
    expect(new Set(ids.slice(0, 3).map((id) => r.positions.get(id)!.y)).size).toBe(1);
    const xs = [...r.positions.values()].map((p) => p.x);
    const ys = [...r.positions.values()].map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys));
    // Un cadre de type : une rangée jusqu'à 4 cartes, puis plus large que haut.
    expect([1, 4, 5, 9, 20].map(typeColumns)).toEqual([1, 4, 4, 5, 7]);
  });

  it("répartition compacte : un bloc au format d'un écran, plus large quand il y a plus de cartes", () => {
    const project = (scenes: number, sheets: number) => {
      const types = ["personnage", "intrigue", "lieu", "theme", "question", "idee"] as const;
      const list = [
        ...Array.from({ length: scenes }, (_, i) => ({ id: `s${i}`, type: "scene" as const, width: 240, height: 120 })),
        ...types.flatMap((type) => Array.from({ length: sheets }, (_, i) => ({ id: `${type}${i}`, type, width: 240, height: 160 }))),
      ];
      const r = organize({ cards: list, plan: EMPTY_PLAN, sceneIds: list.filter((c) => c.type === "scene").map((c) => c.id), labels, origin: { x: 0, y: 0 }, newId });
      const boxes = list.map((c) => ({ ...r.positions.get(c.id)!, width: c.width, height: c.height }));
      // Aucun chevauchement entre cartes.
      for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      const width = Math.max(...boxes.map((b) => b.x + b.width));
      const height = Math.max(...boxes.map((b) => b.y + b.height));
      const perRow = new Set(list.filter((c) => c.type === "scene").map((c) => r.positions.get(c.id)!.x)).size;
      return { ratio: width / height, perRow };
    };
    const small = project(12, 3);
    const big = project(100, 15);
    // Ni longue bande, ni colonne : entre le carré et le très large.
    for (const p of [small, big]) {
      expect(p.ratio).toBeGreaterThan(1);
      expect(p.ratio).toBeLessThan(2.2);
    }
    expect(big.perRow).toBeGreaterThan(small.perRow);
    // Un petit récit reste sur une ligne.
    expect(project(4, 0).perRow).toBe(4);
  });

  it("les pages du livre (épilogue…) ont leur cadre, à la fin, et ne restent pas en plan", () => {
    const withPage = [...cards, { id: "e1", type: "scene" as const, width: 240, height: 120 }];
    const r = organize({ cards: withPage, plan: EMPTY_PLAN, sceneIds: ["s1", "s2", "s3"], labels, origin: { x: 0, y: 0 }, newId });
    expect(r.frames.map((f) => f.title)).toEqual(["Personnages", "Scènes", "Idées", "Pages du livre"]);
    expect(r.positions.has("e1")).toBe(true);
    expect(r.sequence.flat()).not.toContain("e1");
  });

  it("plan libre sans chapitre : un cadre « Scènes »", () => {
    const r = organize({ cards, plan: EMPTY_PLAN, sceneIds: ["s1", "s2", "s3"], labels, origin: { x: 100, y: 50 }, newId });
    expect(r.frames.map((f) => f.title)).toEqual(["Personnages", "Scènes", "Idées"]);
    expect(r.frames[0]).toMatchObject({ x: 100, y: 50 });
  });

  it("dans le projet : une seule étape d'historique, fils « puis » sans doublon", async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    const state = () => useCosmos.getState();
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
    const a = state().addTitledCard("scene", "A");
    const b = state().addTitledCard("scene", "B");
    state().addTitledCard("personnage", "Inès");
    state().linkCards(a, b, "avant");
    const past = state().past.length;
    state().organizeCanvas();
    expect(state().past.length).toBe(past + 1);
    expect(state().edges).toHaveLength(1);
    expect(state().frames.map((f) => f.data.title)).toEqual(["Personnages", "Scènes"]);
    state().undo();
    expect(state().frames).toHaveLength(0);
  });
});

describe("statistiques et objectifs", () => {
  it("mots, pages, lecture, moyenne", () => {
    const words = (n: number) => `<p>${Array.from({ length: n }, () => "mot").join(" ")}</p>`;
    const s = manuscriptStats({ a: words(300), b: words(200) }, ["a", "b", "c"]);
    expect(s).toMatchObject({ words: 500, pages: 2, minutes: 2, scenes: 3, written: 2, average: 250 });
    expect(firstPageOf(0)).toBe(1);
    expect(firstPageOf(500)).toBe(3);
  });

  it("avancement du jour : le premier changement fixe le départ", () => {
    let p = recordProgress({}, "2026-10-08", 1000, 1010);
    p = recordProgress(p, "2026-10-08", 1010, 1200);
    expect(p).toEqual({ "2026-10-08": { start: 1000, end: 1200 } });
    expect(recordProgress(p, "2026-10-08", 1200, 1200)).toBe(p);
    expect(wordsOn(p, "2026-10-08")).toBe(200);
    expect(wordsOn(recordProgress(p, "2026-10-08", 1200, 900), "2026-10-08")).toBe(0);
    p = recordProgress(p, "2026-10-07", 900, 1000);
    expect(streak(p, new Date(2026, 9, 8))).toBe(2);
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(readGoals({ daily: 500, total: -3 })).toEqual({ daily: 500 });
    expect(readProgress({ "2026-10-08": { start: 1, end: 2 }, demain: { start: 1, end: 2 } })).toEqual({ "2026-10-08": { start: 1, end: 2 } });
  });
});

describe("exports", () => {
  it("manuscrit : les scènes d'un chapitre forment un seul chapitre, séparées par * * *", async () => {
    const { manuscriptDoc, bibleDoc, SCENE_BREAK } = await import("../export/doc");
    const cards = [card("s1", "scene", "Arrivée"), card("s2", "scene", "Lampe"), card("s3", "scene", "Seule")];
    const of = (id: string) => (id === "s3" ? null : { id: "c1", title: "Chapitre 1 · Le phare" });
    const doc = manuscriptDoc({ title: "K", author: "", lang: "fr" }, ["s1", "s2", "s3"], cards, { s1: "<p>Un.</p>", s2: "<p>Deux.</p>", s3: "<p>Trois.</p>" }, "Sans titre", of);
    expect(doc.chapters.map((c) => c.title)).toEqual(["Chapitre 1 · Le phare", "Seule"]);
    expect(doc.chapters[0].blocks.map((b) => ("runs" in b ? b.runs : []).map((r) => r.text).join(""))).toEqual(["Un.", SCENE_BREAK, "Deux."]);
    const bible = bibleDoc({ title: "K", author: "", lang: "fr" }, [{ ...card("p1", "personnage", "Inès"), fiche: { age: "34" } }], [], {
      sections: { personnage: "Personnages", lieu: "Lieux", scene: "Scènes", intrigue: "Intrigues", theme: "Thèmes", question: "Questions", image: "Images", lien: "Liens", document: "Documents", idee: "Idées" },
      untitled: "Sans titre",
      linkedTo: "Relié à",
      fields: { age: "Âge" },
    });
    expect(bible.chapters[0].blocks[1]).toEqual({ kind: "paragraph", runs: [{ text: "Âge : ", bold: true }, { text: "34" }] });
  });
});
