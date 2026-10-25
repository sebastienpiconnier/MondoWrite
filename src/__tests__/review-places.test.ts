import { describe, expect, it } from "vitest";
import type { ScreenplayElement } from "../screenplay/model";
import type { CardData } from "../types";
import { paginate } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { momentOf, novelPlaces, sceneMoments, placesCsv, sameLocation, screenplayPlaces, settingOf, settingSummary, sortPlaces } from "../review/places";

const el = (type: ScreenplayElement["type"], text: string): ScreenplayElement => ({ type, text }) as ScreenplayElement;
const card = (id: string, type: CardData["type"], title: string): CardData => ({ id, type, title, html: "" }) as CardData;

const script: ScreenplayElement[] = [
  el("sceneHeading", "INT. PHARE, LANTERNE - NUIT"),
  el("action", "Le vent hurle."),
  el("character", "INÈS"),
  el("dialogue", "Encore une nuit."),
  el("sceneHeading", "EXT. PLAGE - JOUR"),
  el("character", "YANN"),
  el("dialogue", "Tu viens ?"),
  el("sceneHeading", "INT./EXT. PHARE - APRÈS-MIDI"),
  el("character", "YANN"),
  el("dialogue", "Je monte."),
  el("sceneHeading", "INT. MAIRIE - PLUS TARD"),
  el("action", "Silence."),
];

describe("lecture des en-têtes", () => {
  it("intérieur, extérieur, les deux", () => {
    expect(settingOf("INT.")).toBe("int");
    expect(settingOf("ext")).toBe("ext");
    expect(settingOf("INT./EXT.")).toBe("both");
    expect(settingOf("I/E")).toBe("both");
    expect(settingOf("")).toBe("");
  });
  it("jour, nuit, autre", () => {
    expect(momentOf("NUIT")).toBe("night");
    expect(momentOf("SOIRÉE")).toBe("night");
    expect(momentOf("APRÈS-MIDI")).toBe("day");
    expect(momentOf("DAY")).toBe("day");
    expect(momentOf("PLUS TARD")).toBe("other");
    expect(momentOf("")).toBe("other");
  });
  it("« PLUS TARD » ou un moment absent reprennent celui de la scène d'avant", () => {
    const h = (t: string) => el("sceneHeading", t);
    const m = sceneMoments([h("INT. MAISON - NUIT"), h("INT. MAISON - PLUS TARD"), h("EXT. RUE"), h("EXT. RUE - FLASHBACK"), h("INT. BAR - UN PEU PLUS TARD")]);
    expect(m.map((x) => x.moment)).toEqual(["night", "night", "night", "other", "other"]);
    expect(m.map((x) => x.inherited)).toEqual([false, true, true, false, false]);
    expect(sceneMoments([h("INT. MAISON - CONTINU")])[0]).toEqual({ moment: "other", inherited: false });
  });
  it("même décor, sous-lieu compris", () => {
    expect(sameLocation("PHARE, LANTERNE", "Phare")).toBe(true);
    expect(sameLocation("MAISON DE LA MÈRE", "Maison de la Mère")).toBe(true);
    expect(sameLocation("PHARE", "Plage")).toBe(false);
  });
});

describe("statistiques des décors d'un scénario", () => {
  const cards = [card("p1", "lieu", "Phare"), card("p2", "lieu", "Plage"), card("p3", "lieu", "Forêt")];
  const rows = screenplayPlaces(script, cards, paginate(script, LAYOUTS.a4), "fr");
  const phare = rows.find((r) => r.id === "p1")!;
  it("compte scènes, intérieur, extérieur, jour, nuit", () => {
    expect(phare.scenes).toBe(2);
    expect(phare.int).toBe(2);
    expect(phare.ext).toBe(1);
    expect(phare.night).toBe(1);
    expect(phare.day).toBe(1);
    expect(phare.first).toBe(1);
    expect(phare.last).toBe(3);
    expect(phare.characters).toEqual(["INÈS", "YANN"]);
  });
  it("donne des pages et une part du récit", () => {
    expect(phare.pages).toBeGreaterThan(0);
    const total = rows.reduce((n, r) => n + r.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });
  it("garde un lieu sans scène et un décor sans carte", () => {
    expect(rows.find((r) => r.id === "p3")!.scenes).toBe(0);
    const mairie = rows.find((r) => r.id === null)!;
    expect(mairie.name).toBe("MAIRIE");
    expect(mairie.scenes).toBe(1);
  });
  it("résume le scénario entier", () => {
    expect(settingSummary(script)).toEqual({ int: 3, ext: 2, day: 3, night: 1, unknownSetting: 0, otherMoment: 0, inheritedDay: 1, inheritedNight: 0, scenes: 4 });
  });
  it("trie et exporte", () => {
    expect(sortPlaces(rows, "scenes", true)[0].id).toBe("p1");
    const csv = placesCsv([phare], ["Lieu", "Scènes", "Pages", "Part", "Première", "Dernière", "Int", "Ext", "Jour", "Nuit", "Personnages"], true, "fr");
    const line = csv.split("\r\n")[1].split(";");
    expect(line[0]).toBe("Phare");
    expect(line[6]).toBe("2");
    expect(line[10]).toBe("INÈS, YANN");
  });
});

describe("statistiques des lieux d'un roman", () => {
  const cards = [card("l1", "lieu", "Forêt"), card("l2", "lieu", "Moulin"), card("c1", "personnage", "Loup"), card("s1", "scene", "A"), card("s2", "scene", "B"), card("s3", "scene", "C")];
  const manuscript = { s1: "<p>Le Loup attend dans la forêt.</p>", s2: "<p>Elle marche longtemps.</p>", s3: "<p>Au moulin.</p>" };
  const rows = novelPlaces(manuscript, ["s1", "s2", "s3"], cards, [{ source: "s2", target: "l1" }]);
  it("par le texte ou par un fil", () => {
    const foret = rows.find((r) => r.id === "l1")!;
    expect(foret.scenes).toBe(2);
    expect(foret.first).toBe(1);
    expect(foret.last).toBe(2);
    expect(foret.characters).toEqual(["Loup"]);
    expect(foret.share).toBeCloseTo(2 / 3);
    expect(foret.words).toBe(9);
  });
});
