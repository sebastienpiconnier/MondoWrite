import { describe, expect, it } from "vitest";
import { parse as parseFountain } from "../screenplay/parse";
import { serialize as serializeFountain } from "../screenplay/serialize";
import { LAYOUTS } from "../screenplay/layout";
import { adoptUnmarkedSections, convertSection, describeCount, holdersOf, insertStructure, insertionPoint, nextNumber, partChapters, partOfScene, renameStructure, replacedParts, structureDepth, structureOf, unmarkedSections } from "../screenplay/structure";
import { paginate } from "../screenplay/paginate";
import type { ScreenplayElement } from "../screenplay/model";

const heading = (text: string, cardId?: string): ScreenplayElement => ({ type: "sceneHeading", text, ...(cardId ? { cardId } : {}) });
const action = (text: string): ScreenplayElement => ({ type: "action", text });
const labels = { act: "Acte", seq: "Séquence" };

describe("actes et séquences (#140)", () => {
  it("une séquence tapée au-dessus de trois scènes les regroupe", () => {
    let els: ScreenplayElement[] = [heading("INT. A - JOUR", "a"), action("x"), heading("INT. B - JOUR", "b"), heading("INT. C - NUIT", "c"), heading("EXT. D - NUIT", "d")];
    els = insertStructure(els, 0, "seq", "s1", "Séquence 1");
    els = insertStructure(els, insertionPoint(els, 5), "seq", "s2", "La fuite");
    const parts = structureOf(els);
    expect(parts.map((p) => [p.kind, p.title, p.scenes.map((s) => s.cardId)])).toEqual([
      ["seq", "Séquence 1", ["a", "b", "c"]],
      ["seq", "La fuite", ["d"]],
    ]);
    expect(partOfScene(parts, 4)?.key).toBe("s1");
    expect(partChapters(els, labels).map((c) => c.scenes)).toEqual([["a", "b", "c"], ["d"]]);
  });

  it("un acte contient ses séquences ; profondeurs # et ##", () => {
    let els: ScreenplayElement[] = [heading("INT. A", "a"), heading("INT. B", "b")];
    els = insertStructure(els, 0, "act", "a1", "Acte 1");
    expect(structureDepth(els, 1, "seq")).toBe(2);
    els = insertStructure(els, 1, "seq", "s1", "Séquence 1");
    const parts = structureOf(els);
    expect(parts.map((p) => [p.kind, p.depth])).toEqual([
      ["act", 1],
      ["seq", 2],
    ]);
    expect(parts[1].act).toBe("a1");
    expect(partChapters(els, labels)).toEqual([{ id: "part:s1", title: "Séquence 1", scenes: ["a", "b"], act: { id: "a1", title: "Acte 1" } }]);
    expect(parts[0].scenes.length).toBe(2);
    expect(nextNumber(els, els.length, "seq")).toBe(2);
  });

  it("un fichier Fountain venu d'ailleurs : # actes, ## séquences", () => {
    const sp = parseFountain("# Premier acte\n\n## Le réveil\n\nINT. CHAMBRE - JOUR\n\nElle dort.\n\n## La route\n\nEXT. ROUTE - JOUR\n\nIl roule.\n");
    const parts = structureOf(sp.elements);
    expect(parts.map((p) => [p.kind, p.title, p.scenes.length])).toEqual([
      ["act", "Premier acte", 2],
      ["seq", "Le réveil", 1],
      ["seq", "La route", 1],
    ]);
    // Un seul niveau de sections : ce sont des séquences.
    const flat = parseFountain("# Ouverture\n\nINT. A - JOUR\n\nx\n");
    expect(structureOf(flat.elements)[0].kind).toBe("seq");
  });

  it("dans une série, sous l'épisode", () => {
    const els: ScreenplayElement[] = [
      { type: "section", depth: 1, text: "Saison 1 [[cosmos:season:s]]" },
      { type: "section", depth: 2, text: "Pilote [[cosmos:episode:e]]" },
      heading("INT. A", "a"),
    ];
    expect(structureDepth(els, 2, "act")).toBe(3);
    expect(structureDepth(els, 2, "seq")).toBe(4);
    const next = insertStructure(els, 2, "seq", "q", "Séquence 1");
    expect(structureOf(next).map((p) => p.scenes.length)).toEqual([1]);
  });

  it("renommer garde la note, ne compte pas dans les pages, se réécrit tel quel", () => {
    const base: ScreenplayElement[] = [heading("INT. A - JOUR", "a"), action("Il pleut.")];
    const els = insertStructure(base, 0, "seq", "s1", "Séquence 1");
    const renamed = renameStructure(els, 0, "Le départ");
    expect(renamed[0].text).toBe("Le départ [[cosmos:seq:s1]]");
    expect(renameStructure(renamed, 0, "Le départ")).toBe(renamed);
    expect(paginate(renamed, LAYOUTS.a4).pages).toBe(paginate(base, LAYOUTS.a4).pages);
    const again = parseFountain(serializeFountain({ titlePage: {}, elements: renamed }));
    expect(structureOf(again.elements)[0]).toMatchObject({ kind: "seq", id: "s1", title: "Le départ" });
  });
});

describe("sous-séquences (lot 17 ter)", () => {
  it("acte › séquence › sous-séquence : profondeurs, parents, scène rangée dans la plus fine", () => {
    let els: ScreenplayElement[] = [heading("INT. A", "a"), heading("INT. B", "b")];
    els = insertStructure(els, 0, "act", "a1", "Acte 1");
    els = insertStructure(els, 1, "seq", "s1", "Séquence 1");
    expect(structureDepth(els, 2, "sub")).toBe(3);
    els = insertStructure(els, 2, "sub", "u1", "Sous-séquence 1");
    const parts = structureOf(els);
    expect(parts.map((p) => [p.kind, p.depth])).toEqual([
      ["act", 1],
      ["seq", 2],
      ["sub", 3],
    ]);
    expect(parts[2].seq).toBe("s1");
    // Le titre ne garde aucune note (bug de « Place de la scène »).
    expect(parts[2].title).toBe("Sous-séquence 1");
    expect(parts[2].act).toBe("a1");
    expect(partOfScene(parts, 3)?.key).toBe("u1");
  });

  it("un Fountain à trois niveaux de sections : le troisième est une sous-séquence", () => {
    const sp = parseFountain("# Acte\n\n## Séquence\n\n### Détail\n\nINT. A - JOUR\n\nx\n");
    expect(structureOf(sp.elements).map((p) => p.kind)).toEqual(["act", "seq", "sub"]);
  });
});

describe("lot 18 : structure de l'auteur et sections importées", () => {
  const sec = (depth: number, text: string): ScreenplayElement => ({ type: "section", depth, text });

  it("#154 : compte ce qu'une structure retirerait, sans les sections sans note", () => {
    const els: ScreenplayElement[] = [
      sec(1, "Acte 1 [[cosmos:beat:u1]] [[cosmos:act:a1]]"),
      sec(2, "Séquence 1 [[cosmos:beat:u2]] [[cosmos:seq:s1]]"),
      heading("INT. A", "a"),
      sec(3, "Sous-séquence 1 [[cosmos:beat:u3]] [[cosmos:sub:b1]]"),
      heading("INT. B", "b"),
      sec(2, "Séquence 2 [[cosmos:beat:u4]] [[cosmos:seq:s2]]"),
      heading("INT. C", "c"),
    ];
    const c = replacedParts(els);
    expect(c).toEqual({ act: 1, seq: 2, sub: 1 });
    const words = { partsAct: "1 acte", partsActs: "{n} actes", partsSeq: "1 séquence", partsSeqs: "{n} séquences", partsSub: "1 sous-séquence", partsSubs: "{n} sous-séquences" };
    expect(describeCount(c, words, "fr")).toBe("1 acte, 2 séquences et 1 sous-séquence");
    expect(describeCount({ act: 0, seq: 0, sub: 0 }, words, "fr")).toBeNull();
    // Un fichier venu d'ailleurs : ses sections restent quand on choisit une structure, rien à annoncer.
    expect(replacedParts(parseFountain("# Un\n\n## Deux\n\nINT. A - JOUR\n\nx\n").elements)).toEqual({ act: 0, seq: 0, sub: 0 });
  });

  it("#155 : une section importée devient acte, séquence ou sous-séquence, titre et profondeur gardés", () => {
    const sp = parseFountain("# Premier acte\n\n## Le réveil\n\nINT. CHAMBRE - JOUR\n\nElle dort.\n\n### Le café\n\nINT. CUISINE - JOUR\n\nx\n");
    expect(unmarkedSections(sp.elements).map((s) => s.kind)).toEqual(["act", "seq", "sub"]);
    const at = sp.elements.findIndex((el) => el.type === "section" && el.text === "Le réveil");
    const next = convertSection(sp.elements, at, "seq", "s9", "u1");
    expect(next[at]).toEqual({ type: "section", depth: 2, text: "Le réveil [[cosmos:beat:u1]] [[cosmos:seq:s9]]" });
    expect(structureOf(next).find((p) => p.at === at)).toMatchObject({ kind: "seq", id: "s9", title: "Le réveil" });
    // Changer de sorte garde l'identifiant et la case.
    const again = convertSection(next, at, "act", "zz");
    expect((again[at] as { text: string }).text).toBe("Le réveil [[cosmos:beat:u1]] [[cosmos:act:s9]]");
    expect(convertSection(again, at, "act", "zz")).toBe(again);
    // Ni une saison, ni une étape d'une structure livrée.
    const frames: ScreenplayElement[] = [sec(1, "Saison 1 [[cosmos:season:x]]"), sec(2, "Catalyseur [[cosmos:beat:c_catalyst]]")];
    expect(convertSection(frames, 0, "act", "q")).toBe(frames);
    expect(convertSection(frames, 1, "act", "q")).toBe(frames);
  });

  it("#155 : toutes les sections lues d'un coup, selon leur profondeur de départ", () => {
    const sp = parseFountain("# Un\n\n## A\n\n### a1\n\nINT. X - JOUR\n\nx\n\n## B\n\nINT. Y - JOUR\n\ny\n");
    let n = 0;
    let k = 0;
    const next = adoptUnmarkedSections(sp.elements, () => `id${++n}`, () => `u${++k}`);
    expect(structureOf(next).map((p) => [p.kind, p.title, p.id])).toEqual([
      ["act", "Un", "id1"],
      ["seq", "A", "id2"],
      ["sub", "a1", "id3"],
      ["seq", "B", "id4"],
    ]);
    expect(unmarkedSections(next)).toEqual([]);
    expect(adoptUnmarkedSections(next, () => "x", () => undefined)).toBe(next);
    // Le Fountain écrit reste lisible ailleurs : de simples sections.
    expect(serializeFountain({ ...sp, elements: next })).toContain("## A [[cosmos:beat:u2]] [[cosmos:seq:id2]]");
  });

  it("#153 : ce qui contient une scène (acte, séquence, saison, épisode)", () => {
    const els: ScreenplayElement[] = [
      sec(1, "Saison 1 [[cosmos:season:s]]"),
      sec(2, "Pilote [[cosmos:episode:e]]"),
      sec(3, "Acte 1 [[cosmos:act:a1]]"),
      sec(4, "Séquence 1 [[cosmos:seq:q1]]"),
      heading("INT. A", "a"),
      sec(4, "Séquence 2 [[cosmos:seq:q2]]"),
      heading("INT. B", "b"),
    ];
    expect(holdersOf(els, "a")).toEqual({ parts: ["a1", "q1"], series: ["s", "e"] });
    expect(holdersOf(els, "b")).toEqual({ parts: ["a1", "q2"], series: ["s", "e"] });
    expect(holdersOf(els, "zz")).toEqual({ parts: [], series: [] });
  });
});
