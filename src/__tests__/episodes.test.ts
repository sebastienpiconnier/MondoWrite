// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { adoptPitchEpisodes, appearances, episodeCast, episodeGrid, episodeOrder, episodeThreads } from "../episodes";
import { openProject } from "../projectState";
import { buildBiblePack } from "../export/biblePack";
import { defaultsFor } from "../bibleExport";
import { fr } from "../i18n/fr";
import { typesFor, type CardData } from "../types";
import type { Project } from "../types";

const ep = (id: string, title: string, fiche: Record<string, string> = {}): CardData => ({ id, type: "episode", title, html: "", fiche });
const cards: CardData[] = [
  { id: "ines", type: "personnage", title: "Inès", html: "", fiche: { accroche: "Elle veille." } },
  { id: "yann", type: "personnage", title: "Yann", html: "", fiche: { accroche: "Il doute." } },
  { id: "sig", type: "intrigue", title: "Le signal", html: "" },
  { id: "mer", type: "intrigue", title: "La mer", html: "" },
  ep("e3", "La relève", { numero: "3" }),
  ep("e1", "Le signal", { numero: "1", synopsis: "Inès entend un signal.", pivot: "ines" }),
  ep("ex", "Sans numéro"),
  ep("e2", "Tempête", { numero: "Ép. 2", pivot: "yann" }),
];
const edges = [
  { source: "e1", target: "sig" },
  { source: "mer", target: "e2" },
  { source: "e3", target: "sig" },
  { source: "e2", target: "ines" },
];

describe("épisodes d'une série", () => {
  it("se rangent par numéro, ceux sans numéro à la fin", () => {
    expect(episodeOrder(cards).map((c) => c.id)).toEqual(["e1", "e2", "e3", "ex"]);
  });

  it("lisent leurs intrigues et leurs personnages dans les fils", () => {
    const e2 = cards.find((c) => c.id === "e2")!;
    expect(episodeThreads(e2, cards, edges).map((c) => c.id)).toEqual(["mer"]);
    expect(episodeCast(e2, cards, edges).map((c) => c.id)).toEqual(["yann", "ines"]);
    expect(appearances(cards, edges).get("ines")).toEqual(["1", "Ép. 2"]);
  });

  it("font la grille intrigues × épisodes", () => {
    const grid = episodeGrid(cards, edges);
    expect(grid.cols).toEqual(["1", "Ép. 2", "3", "4"]);
    expect(grid.rows).toEqual([
      { label: "Le signal", cells: [true, false, true, false] },
      { label: "La mer", cells: [false, true, false, false] },
    ]);
  });

  it("reprennent les anciennes lignes de la couverture, une seule fois", () => {
    let n = 0;
    const got = adoptPitchEpisodes({ logline: "x", episodes: "Le signal : Inès entend.\nLa relève" }, [], () => `n${n++}`)!;
    expect(got.pitch).toEqual({ logline: "x" });
    expect(got.cards).toEqual([
      { id: "n0", type: "episode", title: "Le signal", html: "", fiche: { numero: "1", synopsis: "Inès entend." } },
      { id: "n1", type: "episode", title: "La relève", html: "", fiche: { numero: "2" } },
    ]);
    expect(adoptPitchEpisodes({ episodes: "A" }, [ep("e", "B")], () => "z")).toBeNull();
    expect(adoptPitchEpisodes({ logline: "x" }, [], () => "z")).toBeNull();
  });

  it("à l'ouverture, les épisodes de la couverture deviennent des cartes posées sans chevauchement", () => {
    const project: Project = {
      meta: { version: 1, title: "Veilleurs", kind: "scenario", layout: [{ id: "c1", x: 80, y: 80 }], links: [], pitch: { episodes: "Un : début\nDeux : suite" } },
      cards: [{ id: "c1", type: "personnage", title: "Inès", html: "" }],
    } as unknown as Project;
    const { state, dirty } = openProject(project);
    expect(dirty).toBe(true);
    expect(state.pitch.episodes).toBeUndefined();
    const eps = state.nodes.filter((n) => n.data.type === "episode");
    expect(eps.map((n) => n.data.title)).toEqual(["Un", "Deux"]);
    const spots = state.nodes.map((n) => `${n.position.x},${n.position.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it("n'apparaissent que dans une série (ou un roman qui en a déjà)", () => {
    expect(typesFor("scenario")).toContain("episode");
    expect(typesFor("roman")).not.toContain("episode");
    expect(typesFor("roman", true)).toContain("episode");
  });
});

describe("épisodes dans la bible de série", () => {
  const source = { title: "Veilleurs", kind: "scenario" as const, nodes: cards.map((data) => ({ id: data.id, type: "card", position: { x: 0, y: 0 }, data })), edges: edges.map((e, i) => ({ id: `l${i}`, ...e })), plan: { template: "libre", beats: {} }, manuscript: {}, pitch: {}, screenplay: null, goals: {} } as never;
  const ctx = { t: fr, lang: "fr", author: "", date: new Date(2026, 9, 26) };
  const structure = (pack: ReturnType<typeof buildBiblePack>) => pack.sections.filter((s) => s.part === "structure").flatMap((s) => s.blocks);

  it("un tiers reçoit une liste courte, synopsis et pivot", () => {
    const blocks = structure(buildBiblePack(source, defaultsFor("tiers", "scenario"), ctx));
    const list = blocks.find((b) => b.kind === "list");
    expect(list?.kind === "list" && list.items[0]).toEqual({ mark: "1", text: "Le signal", note: "Inès entend un signal. · Personnage pivot : Inès" });
    expect(blocks.some((b) => b.kind === "grid")).toBe(false);
  });

  it("la grille de la saison remplace celle du pilote, le mémo dit où chacun paraît", () => {
    const pack = buildBiblePack(source, defaultsFor("moi", "scenario"), ctx);
    const grid = structure(pack).find((b) => b.kind === "grid");
    expect(grid?.kind === "grid" && grid.marks).toEqual(["1", "Ép. 2", "3", "4"]);
    expect(grid?.kind === "grid" && grid.cols[0]).toBe("Le signal");
    const people = pack.sections.find((s) => s.part === "personnages")!.blocks;
    const memo = people.find((b) => b.kind === "list");
    expect(memo?.kind === "list" && memo.items.find((i) => i.text === "Inès")?.note).toBe("Elle veille. · Épisodes 1, Ép. 2");
    expect(JSON.stringify(structure(pack))).toContain(fr.types.episode.section);
  });
});
