import { describe, expect, it } from "vitest";
import { parse as parseFountain } from "../screenplay/parse";
import { serialize as serializeFountain } from "../screenplay/serialize";
import { LAYOUTS } from "../screenplay/layout";
import { insertStructure, insertionPoint, nextNumber, partChapters, partOfScene, renameStructure, structureDepth, structureOf } from "../screenplay/structure";
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
