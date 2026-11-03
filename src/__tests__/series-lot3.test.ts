import { describe, expect, it } from "vitest";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import { allEpisodes, episodeScript, seriesPart, withEpisodeTemplate } from "../screenplay/series";
import { applyTemplate, currentTemplate } from "../screenplay/template";
import { seriesLinks } from "../episodes";
import { checkStory } from "../review/checks";
import { screenplayPlaces } from "../goto";
import { organize } from "../organize";
import { EMPTY_PLAN } from "../plan";
import type { CardData } from "../types";

const section = (depth: number, text: string): ScreenplayElement => ({ type: "section", depth, text });
const sc = (text: string, cardId: string): ScreenplayElement => ({ type: "sceneHeading", text, cardId });

const sp: Screenplay = {
  titlePage: { Title: "Le Phare" },
  elements: [
    section(1, "Saison 1 [[cosmos:season:sa1]]"),
    section(2, "Le signal [[cosmos:episode:e1]]"),
    sc("INT. PHARE - NUIT", "s1"),
    { type: "character", text: "INÈS" },
    { type: "dialogue", text: "Tu entends ?" },
    section(2, "Tempête [[cosmos:episode:e2]]"),
    sc("EXT. PORT - JOUR", "s2"),
  ],
};

describe("série, lot 3", () => {
  it("le gabarit d'un épisode se pose dans son texte seul, en cases de niveau 3", () => {
    const next = withEpisodeTemplate(sp, "e2", (script) => applyTemplate(script, "episode", (k) => k));
    expect(currentTemplate(episodeScript(next, "e2").elements)).toBe("episode");
    expect(currentTemplate(episodeScript(next, "e1").elements)).toBeNull();
    const beats = episodeScript(next, "e2").elements.filter((e) => e.type === "section");
    expect(beats.length).toBeGreaterThan(1);
    expect(beats.every((b) => b.depth === 3)).toBe(true);
    // Les épisodes restent ce qu'ils étaient.
    expect(allEpisodes(next.elements).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(withEpisodeTemplate(sp, "zz", (s) => s)).toBe(sp);
    // Retirer le gabarit rend le texte de l'épisode.
    const back = withEpisodeTemplate(next, "e2", (script) => applyTemplate(script, null, (k) => k));
    expect(back.elements).toEqual(sp.elements);
  });

  it("une saison ou un épisode s'exporte avec sa page de titre", () => {
    const ep = seriesPart(sp, "e2", "Ép. 2 · Tempête");
    expect(ep.titlePage.Title).toBe("Le Phare\nÉp. 2 · Tempête");
    expect(ep.elements.map((e) => e.text)).toEqual(["EXT. PORT - JOUR"]);
    const season = seriesPart(sp, "sa1", "Saison 1");
    expect(season.elements[0].text).toBe("Le signal [[cosmos:episode:e1]]");
    expect(seriesPart(sp, null, "")).toBe(sp);
    expect(seriesPart(sp, "zz", "x")).toBe(sp);
    expect(seriesPart({ titlePage: {}, elements: sp.elements }, "e1", "Ép. 1").titlePage).toEqual({ Title: "Ép. 1" });
  });

  it("chaque épisode reçoit les intrigues et les personnages de ses scènes", () => {
    const cards: CardData[] = [
      { id: "p1", type: "personnage", title: "Inès Morvan", html: "" },
      { id: "i1", type: "intrigue", title: "La relève", html: "" },
    ];
    const links = seriesLinks(
      [
        { id: "e1", scenes: [{ cardId: "s1", speakers: ["INÈS"] }] },
        { id: "e2", scenes: [{ cardId: "s2", speakers: [] }] },
      ],
      cards,
      [{ source: "i1", target: "s2" }],
    );
    expect(links).toEqual([
      { source: "e1", target: "p1" },
      { source: "e2", target: "i1" },
    ]);
  });

  it("« Vérifier » : longueur de chaque épisode, principal absent de plusieurs épisodes", () => {
    const cards: CardData[] = [{ id: "p1", type: "personnage", title: "Inès", html: "", fiche: { principal: "oui", objectif: "Garder le phare" } }];
    const ep = (id: string, pages: number, here: boolean) => ({ id, label: `Ép. ${id}`, pages, cast: new Set(here ? ["p1"] : []) });
    const found = checkStory(cards, [], "scenario", { format: "Série, épisodes de 52 min" }, {
      episodes: 4,
      series: [ep("1", 50, true), ep("2", 20, false), ep("3", 50, false), ep("4", 50, false)],
    });
    expect(found.filter((f) => f.rule === "episodeLength").map((f) => f.text)).toEqual(["Ép. 2"]);
    const absent = found.find((f) => f.rule === "principalAbsent")!;
    expect(absent.names).toEqual(["Inès", "Ép. 2", "Ép. 4"]);
    expect(absent.counts).toEqual([3]);
    expect(found.some((f) => f.rule === "pilotLength")).toBe(false);
  });

  it("« Aller à » propose les épisodes", () => {
    const places = screenplayPlaces(sp.elements, sp.elements.map(() => 1), 1, {
      page: "Page {n}",
      untitledScene: "Sans titre",
      chapter: (n) => String(n),
      episode: (n, title) => `Ép. ${n} · ${title}`,
    });
    expect(places.targets.filter((t) => t.kind === "episode").map((t) => [t.label, t.target])).toEqual([
      ["Ép. 1 · Le signal", "@1"],
      ["Ép. 2 · Tempête", "@5"],
    ]);
  });

  it("« Organiser » met les cases du gabarit dans le cadre de leur épisode", () => {
    let n = 0;
    const result = organize({
      cards: ["s1", "s2"].map((id) => ({ id, type: "scene" as const, width: 240, height: 120 })),
      plan: EMPTY_PLAN,
      sceneIds: ["s1", "s2"],
      labels: { groups: {} as never, beat: (k) => k, chapter: String, continued: (l) => l, unplaced: "À placer", story: "Scènes", pages: "Pages", episode: (k, t) => `Ép. ${k} · ${t}` },
      series: {
        seasons: [
          {
            id: "sa1",
            title: "Saison 1",
            episodes: [
              { id: "e1", title: "Le signal", number: 1, scenes: ["s1"], beats: [{ key: "x_open", label: "Ouverture", scenes: ["s1"] }, { key: "x_end", label: "Fin", scenes: [] }] },
              { id: "e2", title: "Tempête", number: 2, scenes: ["s2"] },
            ],
          },
        ],
        outside: [],
      },
      origin: { x: 0, y: 0 },
      newId: () => `f${++n}`,
    });
    const beat = result.frames.find((f) => f.title === "Ouverture")!;
    expect(beat).toMatchObject({ beat: "x_open", episode: "e1" });
    const ep1 = result.frames.find((f) => f.title === "Ép. 1 · Le signal")!;
    expect(beat.x >= ep1.x && beat.x + beat.width <= ep1.x + ep1.width).toBe(true);
    const s1 = result.positions.get("s1")!;
    expect(s1.x >= beat.x && s1.y >= beat.y).toBe(true);
  });
});
