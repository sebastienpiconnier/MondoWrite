import { describe, expect, it } from "vitest";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import {
  addEpisode,
  addSeason,
  adoptEpisodeCards,
  allEpisodes,
  episodeAt,
  episodeOfCard,
  episodeOffset,
  episodeScript,
  inEpisode,
  isSeries,
  moveSeriesPart,
  plainSection,
  removeSeriesPart,
  renameSeriesPart,
  resolveEpisode,
  seriesMark,
  seriesOf,
  setEpisodeSynopsis,
  withEpisodeScript,
} from "../screenplay/series";
import { parse as parseFountain } from "../screenplay/parse";
import { serialize as serializeFountain } from "../screenplay/serialize";

const sc = (text: string, cardId?: string): ScreenplayElement => ({ type: "sceneHeading", text, ...(cardId ? { cardId } : {}) });
const act = (text: string): ScreenplayElement => ({ type: "action", text });
const sp = (elements: ScreenplayElement[]): Screenplay => ({ titlePage: {}, elements });

const plain = sp([sc("INT. PHARE - NUIT", "s1"), act("Inès monte.")]);
const opts = { seasonId: "sa1", seasonTitle: "Saison 1" };
const one = addEpisode(plain, "e1", "Le signal", opts);
const two = addEpisode(one, "e2", "La relève", opts);

describe("série écrite dans un seul Fountain", () => {
  it("le premier épisode prend le texte déjà écrit, sous une saison créée", () => {
    expect(isSeries(plain)).toBe(false);
    expect(isSeries(one)).toBe(true);
    expect(one.elements.slice(0, 2).map((e) => [e.type, e.depth, e.text])).toEqual([
      ["section", 1, "Saison 1 [[cosmos:season:sa1]]"],
      ["section", 2, "Le signal [[cosmos:episode:e1]]"],
    ]);
    const [season] = seriesOf(two.elements);
    expect(season.title).toBe("Saison 1");
    expect(season.episodes.map((e) => [e.id, e.number, e.start, e.end])).toEqual([
      ["e1", 1, 2, 4],
      ["e2", 2, 5, 5],
    ]);
  });

  it("les notes ne s'affichent pas et se relisent après un aller-retour Fountain", () => {
    expect(plainSection("Le signal [[cosmos:episode:e1]] [[cosmos:beat:a_setup]]")).toBe("Le signal");
    expect(seriesMark(act("x"))).toBeNull();
    const back = parseFountain(serializeFountain(two));
    expect(allEpisodes(back.elements).map((e) => e.title)).toEqual(["Le signal", "La relève"]);
  });

  it("le texte d'un épisode se lit et se réécrit seul, toujours le même objet tant que rien ne change", () => {
    const slice = episodeScript(two, "e1");
    expect(slice.elements.map((e) => e.text)).toEqual(["INT. PHARE - NUIT", "Inès monte."]);
    expect(episodeScript(two, "e1")).toBe(slice);
    expect(episodeScript(two, null)).toBe(two);
    expect(withEpisodeScript(two, "e1", slice)).toBe(two);
    const next = inEpisode(two, "e2", (s) => ({ ...s, elements: [...s.elements, sc("EXT. QUAI - JOUR", "s2")] }));
    expect(next.elements[next.elements.length - 1].text).toBe("EXT. QUAI - JOUR");
    expect(episodeOfCard(next, "s2")).toBe("e2");
    expect(episodeOfCard(next, "s1")).toBe("e1");
    expect(episodeOfCard(next, "zz")).toBeNull();
    expect(episodeAt(next, 0)).toBeNull();
    expect(episodeOffset(next, "e2")).toBe(5);
    expect(episodeOffset(next, null)).toBe(0);
    expect(withEpisodeScript(two, null, plain)).toBe(plain);
  });

  it("un épisode disparu retombe sur le scénario entier", () => {
    expect(resolveEpisode(two, "e2")).toBe("e2");
    expect(resolveEpisode(two, "zz")).toBeNull();
    expect(resolveEpisode(null, "e1")).toBeNull();
  });

  it("renomme, donne un synopsis, puis le retire", () => {
    const renamed = renameSeriesPart(two, "e2", "La garde");
    expect(allEpisodes(renamed.elements)[1].title).toBe("La garde");
    expect(renameSeriesPart(renamed, "e2", "La garde")).toBe(renamed);
    expect(renameSeriesPart(renamed, "zz", "x")).toBe(renamed);
    const withSyn = setEpisodeSynopsis(renamed, "e1", "  Inès entend\nun signal. ");
    expect(allEpisodes(withSyn.elements)[0].synopsis).toBe("Inès entend un signal.");
    expect(episodeScript(withSyn, "e1").elements[0].text).toBe("INT. PHARE - NUIT");
    expect(setEpisodeSynopsis(withSyn, "e1", "Inès entend un signal.")).toBe(withSyn);
    expect(allEpisodes(setEpisodeSynopsis(withSyn, "e1", "").elements)[0].synopsis).toBe("");
  });

  it("déplace un épisode dans sa saison et d'une saison à l'autre", () => {
    const three = addEpisode(addSeason(two, "sa2", "Saison 2"), "e3", "Le retour", opts);
    expect(seriesOf(three.elements).map((s) => s.episodes.map((e) => e.id))).toEqual([["e1", "e2"], ["e3"]]);
    const up = moveSeriesPart(three, "e2", -1);
    expect(allEpisodes(up.elements).map((e) => e.id)).toEqual(["e2", "e1", "e3"]);
    expect(episodeScript(up, "e1").elements.map((e) => e.text)).toEqual(["INT. PHARE - NUIT", "Inès monte."]);
    const down = moveSeriesPart(three, "e2", 1);
    expect(seriesOf(down.elements).map((s) => s.episodes.map((e) => e.id))).toEqual([["e1"], ["e2", "e3"]]);
    const back = moveSeriesPart(down, "e2", -1);
    expect(seriesOf(back.elements).map((s) => s.episodes.map((e) => e.id))).toEqual([["e1", "e2"], ["e3"]]);
    expect(moveSeriesPart(three, "e1", -1)).toBe(three);
    expect(moveSeriesPart(three, "e3", 1)).toBe(three);
    expect(moveSeriesPart(three, "zz", 1)).toBe(three);
    // Une saison passe avant l'autre avec ses épisodes.
    const swapped = moveSeriesPart(three, "sa2", -1);
    expect(seriesOf(swapped.elements).map((s) => s.title)).toEqual(["Saison 2", "Saison 1"]);
    expect(allEpisodes(swapped.elements).map((e) => e.id)).toEqual(["e3", "e1", "e2"]);
    expect(moveSeriesPart(three, "sa1", -1)).toBe(three);
    expect(moveSeriesPart(swapped, "sa2", 1).elements).toEqual(three.elements);
  });

  it("un nouvel épisode va à la fin de la saison demandée", () => {
    const three = addEpisode(addSeason(two, "sa2", "Saison 2"), "e3", "", opts);
    const inFirst = addEpisode(three, "e4", "", { ...opts, season: "sa1" });
    expect(seriesOf(inFirst.elements).map((s) => s.episodes.map((e) => e.id))).toEqual([["e1", "e2", "e4"], ["e3"]]);
  });

  it("retirer une saison ou un épisode garde tout le texte", () => {
    const gone = removeSeriesPart(two, "e1");
    expect(gone.elements.some((e) => e.text === "Inès monte.")).toBe(true);
    expect(allEpisodes(gone.elements).map((e) => e.id)).toEqual(["e2"]);
    const noSeason = removeSeriesPart(two, "sa1");
    expect(seriesOf(noSeason.elements)[0].id).toBeNull();
    expect(allEpisodes(noSeason.elements).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(removeSeriesPart(two, "zz")).toBe(two);
  });

  it("des épisodes écrits avant toute saison sont dans une saison sans section", () => {
    const loose = sp([{ type: "section", depth: 2, text: "Pilote [[cosmos:episode:p1]]" }, sc("INT. X - JOUR")]);
    const [season] = seriesOf(loose.elements);
    expect([season.id, season.at, season.episodes[0].id]).toEqual([null, -1, "p1"]);
    expect(moveSeriesPart(loose, "p1", -1)).toBe(loose);
  });

  it("les anciennes cartes Épisode deviennent des sections, par saison, une seule fois", () => {
    const cards = [
      { id: "e1", title: "Le signal", season: 1, synopsis: "Un signal." },
      { id: "e2", title: "La relève", season: 1, synopsis: "" },
      { id: "e3", title: "Le retour", season: 2, synopsis: "" },
    ];
    let n = 0;
    const adopted = adoptEpisodeCards(plain, cards, (k) => `Saison ${k}`, () => `id${++n}`);
    expect(seriesOf(adopted.elements).map((s) => [s.title, s.episodes.map((e) => e.id)])).toEqual([
      ["Saison 1", ["e1", "e2"]],
      ["Saison 2", ["e3"]],
    ]);
    expect(episodeScript(adopted, "e1").elements.map((e) => e.text)).toEqual(["INT. PHARE - NUIT", "Inès monte."]);
    expect(allEpisodes(adopted.elements)[0].synopsis).toBe("Un signal.");
    expect(adoptEpisodeCards(adopted, cards, (k) => `Saison ${k}`, () => "x")).toBe(adopted);
    const more = adoptEpisodeCards(adopted, [{ id: "e9", title: "Bonus", season: 3, synopsis: "" }], (k) => `S${k}`, () => "y");
    expect(allEpisodes(more.elements).map((e) => e.id)).toEqual(["e1", "e2", "e3", "e9"]);
  });
});
