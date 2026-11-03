import { describe, expect, it } from "vitest";
import { organize } from "../organize";
import { EMPTY_PLAN } from "../plan";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import { allEpisodes, episodeScenes, placeSceneInEpisode } from "../screenplay/series";
import { openProject, toProject } from "../projectState";
import type { Project } from "../types";

const section = (depth: number, text: string): ScreenplayElement => ({ type: "section", depth, text });
const sc = (text: string, cardId: string): ScreenplayElement => ({ type: "sceneHeading", text, cardId });
const act = (text: string): ScreenplayElement => ({ type: "action", text });

const sp: Screenplay = {
  titlePage: {},
  elements: [
    sc("INT. QUAI - JOUR", "s0"),
    section(1, "Saison 1 [[cosmos:season:sa1]]"),
    section(2, "Le signal [[cosmos:episode:e1]]"),
    { type: "synopsis", text: "Un signal." },
    sc("INT. PHARE - NUIT", "s1"),
    act("La lanterne tourne."),
    sc("EXT. ROCHERS - NUIT", "s2"),
    act("La mer monte."),
    section(2, "Tempête [[cosmos:episode:e2]]"),
    sc("EXT. PORT - JOUR", "s3"),
    act("Les bateaux rentrent."),
  ],
};

describe("série sur le canevas (plan des épisodes, lot 2)", () => {
  it("lit les scènes de chaque épisode et celles d'avant le premier", () => {
    const { byEpisode, outside } = episodeScenes(sp.elements);
    expect(outside).toEqual(["s0"]);
    expect(byEpisode.get("e1")).toEqual(["s1", "s2"]);
    expect(byEpisode.get("e2")).toEqual(["s3"]);
  });

  it("une scène passe dans un autre épisode avec son texte, à la place demandée", () => {
    const moved = placeSceneInEpisode(sp, "s2", "e2", 0);
    expect(episodeScenes(moved.elements).byEpisode.get("e2")).toEqual(["s2", "s3"]);
    expect(moved.elements.findIndex((e) => e.text === "La mer monte.")).toBe(moved.elements.findIndex((e) => e.cardId === "s2") + 1);
    const atEnd = placeSceneInEpisode(sp, "s1", "e2");
    expect(episodeScenes(atEnd.elements).byEpisode.get("e2")).toEqual(["s3", "s1"]);
    expect(placeSceneInEpisode(sp, "s1", "e1", 0)).toBe(sp);
    expect(placeSceneInEpisode(sp, "zz", "e1")).toBe(sp);
    expect(placeSceneInEpisode(sp, "s1", "zz")).toBe(sp);
    // Les épisodes et leurs synopsis ne bougent pas.
    expect(allEpisodes(moved.elements).map((e) => [e.id, e.synopsis])).toEqual([["e1", "Un signal."], ["e2", ""]]);
  });

  it("« Organiser » dessine saison › épisode › scènes, et « À placer » pour les scènes pas encore écrites", () => {
    const card = (id: string) => ({ id, type: "scene" as const, width: 240, height: 120 });
    const cards = ["s0", "s1", "s2", "s3", "s4"].map(card);
    let n = 0;
    const { byEpisode, outside } = episodeScenes(sp.elements);
    const result = organize({
      cards,
      plan: EMPTY_PLAN,
      sceneIds: ["s0", "s1", "s2", "s3", "s4"],
      labels: {
        groups: {} as never,
        beat: (k) => k,
        chapter: (k) => String(k),
        continued: (l) => l,
        unplaced: "À placer",
        story: "Scènes",
        pages: "Pages",
        episode: (k, title) => `Ép. ${k} · ${title}`,
        seasonUntitled: "Saison sans titre",
        outside: "Hors épisode",
      },
      series: {
        seasons: [{ id: "sa1", title: "Saison 1", episodes: allEpisodes(sp.elements).map((e) => ({ id: e.id, title: e.title, number: e.number, scenes: byEpisode.get(e.id) ?? [] })) }],
        outside,
      },
      origin: { x: 0, y: 0 },
      newId: () => `f${++n}`,
    });
    const titles = result.frames.map((f) => f.title);
    expect(titles).toEqual(["Hors épisode", "Saison 1", "Ép. 1 · Le signal", "Ép. 2 · Tempête", "À placer"]);
    const season = result.frames.find((f) => f.season === "sa1")!;
    const ep1 = result.frames.find((f) => f.episode === "e1")!;
    const inside = (a: typeof ep1, b: typeof ep1) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
    expect(inside(ep1, season)).toBe(true);
    const s1 = result.positions.get("s1")!;
    expect(s1.x >= ep1.x && s1.y >= ep1.y && s1.x + 240 <= ep1.x + ep1.width).toBe(true);
    expect(result.sequence).toEqual([["s0", "s1"], ["s1", "s2"], ["s2", "s3"]]);
  });

  it("le cadre garde sa saison ou son épisode dans cosmos.json", () => {
    const project = {
      meta: { version: 1, title: "T", kind: "scenario", layout: [], links: [], frames: [{ id: "f1", title: "Ép. 1", x: 0, y: 0, width: 300, height: 200, episode: "e1" }, { id: "f2", title: "S", x: 0, y: 0, width: 300, height: 200, season: "../x" }] },
      cards: [],
      screenplay: sp,
    } as unknown as Project;
    const { state } = openProject(project);
    expect(state.frames.map((f) => [f.data.episode, f.data.season])).toEqual([["e1", undefined], [undefined, undefined]]);
    const back = toProject({ ...state, title: "T" } as never);
    expect(back.meta.frames?.[0]).toMatchObject({ episode: "e1" });
  });
});
