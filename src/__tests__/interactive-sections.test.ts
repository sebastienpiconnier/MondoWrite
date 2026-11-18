// @vitest-environment happy-dom
// Roman interactif, lot 12 (#92) : numéros des sections figés, cadenas, renumérotation, renvois cachés.

import { describe, expect, it } from "vitest";
import { readSections, renumberSections, resolveSections, sectionGaps, setSectionNumber, toggleSectionLock, withSections } from "../interactive/sections";
import { choiceGraph, choiceLine, choicesHtml, editChoice, parseChoices } from "../interactive/choices";
import { verifyStory } from "../interactive/verify";
import { gamebookDoc, type GamebookTexts } from "../interactive/gamebook";
import { projectToInk } from "../interactive/ink";

const shuffle = (ids: string[]) => () => ids.map((id, i) => ({ id, n: i + 1 }));

describe("numéros figés", () => {
  it("sans numéro gardé, prend le premier mélange", () => {
    expect(resolveSections(["a", "b", "c"], {}, shuffle(["a", "c", "b"]))).toEqual({ a: 1, c: 2, b: 3 });
  });

  it("une scène ajoutée prend un numéro libre, les autres ne bougent pas", () => {
    const out = resolveSections(["a", "b", "c", "d"], { a: 1, b: 3, c: 2 }, shuffle([]));
    expect(out).toEqual({ a: 1, b: 3, c: 2, d: 4 });
  });

  it("une scène retirée laisse un trou, repris par la suivante", () => {
    const gone = resolveSections(["a", "c", "d"], { a: 1, b: 2, c: 3, d: 4 }, shuffle([]));
    expect(gone).toEqual({ a: 1, c: 3, d: 4 });
    expect(sectionGaps(gone)).toEqual([2]);
    expect(resolveSections(["a", "c", "d", "e"], gone, shuffle([]))).toEqual({ a: 1, c: 3, d: 4, e: 2 });
  });

  it("le départ prend toujours le 1 ; l'ancien départ prend son numéro", () => {
    expect(resolveSections(["c", "a", "b"], { a: 1, b: 2, c: 3 }, shuffle([]))).toEqual({ c: 1, a: 3, b: 2 });
  });

  it("change un numéro, échange avec la section qui l'avait, et le garde", () => {
    const state = { numbers: { a: 1, b: 2, c: 3 }, locked: [] };
    const next = setSectionNumber(state, "a", "b", 3)!;
    expect(next.numbers).toEqual({ a: 1, b: 3, c: 2 });
    expect(next.locked).toEqual(["b"]);
    // Le 1, le départ, ou un numéro gardé ailleurs : refusé.
    expect(setSectionNumber(state, "a", "b", 1)).toBeNull();
    expect(setSectionNumber(state, "a", "a", 2)).toBeNull();
    expect(setSectionNumber(next, "a", "c", 3)).toBeNull();
  });

  it("renuméroter garde le départ et les numéros gardés, comble les trous", () => {
    const state = { numbers: { a: 1, b: 5, c: 3, d: 7 }, locked: ["b"] };
    const next = renumberSections(["a", "b", "c", "d"], state, ["a", "d", "c", "b"]);
    expect(next.numbers.a).toBe(1);
    expect(next.numbers.b).toBe(5);
    expect(new Set([next.numbers.c, next.numbers.d])).toEqual(new Set([2, 3]));
    expect(toggleSectionLock(next, "b").locked).toEqual([]);
  });

  it("s'écrit dans cosmos.json et se relit, sans doublon", () => {
    const meta = withSections({ interactive: true }, { numbers: { a: 1, b: 2 }, locked: ["b"] });
    expect(meta).toEqual({ interactive: true, sections: { a: 1, b: 2 }, sectionLocks: ["b"] });
    expect(withSections(meta, readSections(meta))).toBe(meta);
    expect(readSections({ sections: { a: 1, b: 1, c: -2, d: "x" }, sectionLocks: ["z"] })).toEqual({ numbers: { a: 1 }, locked: [] });
  });
});

describe("renvois cachés", () => {
  const scenes = [
    { id: "a", title: "La cour" },
    { id: "b", title: "Le puits" },
    { id: "c", title: "La cave" },
  ];
  const manuscript = {
    a: `<p>Ajoute 2 au numéro de cette section.</p>${choicesHtml("* [Descendre] -> le_puits\n* [Le code] -> la_cave #hidden")}`,
    b: "<p>Fin.</p>",
    c: "<p>La cave.</p>",
  };

  it("se lit, s'écrit et se garde quand on modifie le choix", () => {
    const [, hidden] = parseChoices("* [Descendre] -> le_puits\n* [Le code] -> la_cave #hidden");
    expect(hidden).toMatchObject({ kind: "choice", target: "la_cave", hidden: true });
    expect(choiceLine({ label: "Le code", target: "la_cave", hidden: true })).toBe("* [Le code] -> la_cave #hidden");
    const edited = editChoice(parseChoices("* [Le code] -> la_cave #hidden"), 0, { label: "Le code", target: "la_cave", hidden: true });
    expect(edited[0]).toMatchObject({ hidden: true });
    expect(choiceGraph(manuscript, scenes)[1].hidden).toBe(true);
  });

  it("n'est ni imprimé ni joué, mais compte pour « Vérifier »", () => {
    const texts = new Proxy({}, { get: (_t, k) => (k === "choice" ? "{label} : rendez-vous au {n}." : String(k)) }) as unknown as GamebookTexts;
    const { doc } = gamebookDoc({ title: "T", author: "", lang: "fr", scenes, slugs: new Map([["a", "la_cour"], ["b", "le_puits"], ["c", "la_cave"]]), manuscript, factLabels: {}, texts, numbers: { a: 1, b: 2, c: 3 } });
    const first = JSON.stringify(doc.chapters[1]);
    expect(first).toContain("Descendre");
    expect(first).not.toContain("Le code");
    expect(projectToInk(scenes, new Map([["a", "la_cour"], ["b", "le_puits"], ["c", "la_cave"]]), manuscript).ink).not.toContain("Le code");
    // La cave n'est atteinte que par le renvoi caché : elle n'est pas « inaccessible ».
    const points = verifyStory(scenes, manuscript, {}, { numbers: { a: 1, b: 2, c: 3 }, locked: [] });
    expect(points.some((p) => p.rule === "unreachableScene")).toBe(false);
    expect(points.filter((p) => p.rule === "hiddenUnlocked")).toHaveLength(1);
    expect(points.filter((p) => p.rule === "hiddenNotPlayable")).toHaveLength(1);
    expect(verifyStory(scenes, manuscript, {}, { numbers: { a: 1, b: 2, c: 3 }, locked: ["c"] }).some((p) => p.rule === "hiddenUnlocked")).toBe(false);
  });

  it("un trou dans les numéros se signale", () => {
    expect(verifyStory(scenes, manuscript, {}, { numbers: { a: 1, b: 2, c: 4 }, locked: ["c"] }).filter((p) => p.rule === "sectionGap").map((p) => p.name)).toEqual(["3"]);
  });
});
