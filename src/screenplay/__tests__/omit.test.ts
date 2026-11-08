// Scènes omises (#46) : « OMIS » garde la place et le numéro, le texte part à la corbeille et revient.

import { describe, expect, it } from "vitest";
import { parse } from "../parse";
import { serialize } from "../serialize";
import { isOmitted, omitScene, omittedIndex, unomitScene } from "../omit";
import { listScenes } from "../scenes";
import { blocks } from "../sequence";
import { scenesWithoutCard } from "../link";
import { trashCard, restoreCard } from "../../trash";
import { typeset } from "../export/typeset";
import { LAYOUTS } from "../layout";

const source = `INT. PHARE - NUIT [[cosmos:a1]] #11#

Inès monte.

EXT. CÔTE - JOUR [[cosmos:b2]] #12#

= Yann attend.

YANN
Tu es en retard.

INT. CUISINE - NUIT [[cosmos:c3]] #13#

Le café brûle.
`;

describe("omitScene", () => {
  it("remplace la scène par « OMIS », numéro gardé, texte et synopsis retirés", () => {
    const sp = parse(source);
    const start = sp.elements.findIndex((el) => el.cardId === "b2");
    const out = omitScene(sp, start, "b2", "OMIS");
    expect(out.elements[start]).toEqual({ type: "sceneHeading", text: "OMIS", forced: true, omitted: "b2", sceneNumber: "12" });
    expect(isOmitted(out.elements[start])).toBe(true);
    expect(out.elements[start + 1]).toMatchObject({ type: "sceneHeading", cardId: "c3" });
    expect(omittedIndex(out, "b2")).toBe(start);
  });

  it("ne fait rien sur un en-tête déjà omis ou un autre élément", () => {
    const sp = parse(source);
    expect(omitScene(sp, 1, "x", "OMIS")).toBe(sp);
    const once = omitScene(sp, 0, "a1", "OMIS");
    expect(omitScene(once, 0, "a1", "OMIS")).toBe(once);
  });

  it("s'écrit en Fountain lisible par les autres logiciels et se relit", () => {
    const sp = omitScene(parse(source), 2, "b2", "OMIS");
    const text = serialize(sp);
    expect(text).toContain(".OMIS [[cosmos:omitted:b2]] #12#");
    expect(parse(text).elements[2]).toEqual(sp.elements[2]);
  });
});

describe("lectures du scénario", () => {
  const sp = omitScene(parse(source), 2, "b2", "OMIS");

  it("listScenes ne la rend qu'avec withOmitted, en gardant les rangs", () => {
    expect(listScenes(sp.elements).map((s) => [s.number, s.cardId])).toEqual([
      [1, "a1"],
      [3, "c3"],
    ]);
    const all = listScenes(sp.elements, true);
    expect(all.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(all[1]).toMatchObject({ omitted: true, text: "OMIS", end: 3 });
    // La scène d'avant s'arrête à « OMIS ».
    expect(all[0].end).toBe(2);
  });

  it("le séquencier la marque, et elle n'est pas une scène sans carte", () => {
    expect(blocks(sp.elements)[1]).toMatchObject({ kind: "scene", omitted: true, number: 2 });
    expect(scenesWithoutCard(sp, ["a1", "c3"])).toEqual([]);
  });
});

describe("corbeille", () => {
  it("unomitScene remet le texte à la place de « OMIS »", () => {
    const sp = parse(source);
    const start = 2;
    const trashed = serialize({ titlePage: {}, elements: sp.elements.slice(start, 6) }).trim();
    const omitted = omitScene(sp, start, "b2", "OMIS");
    const back = unomitScene(omitted, "b2", trashed);
    expect(back.elements).toEqual(sp.elements);
    expect(unomitScene(omitted, "zz", trashed)).toBe(omitted);
  });

  it("restoreCard ramène la scène à sa place plutôt qu'à la fin", () => {
    const sp = parse(source);
    const card = { id: "b2", type: "scene" as const, title: "EXT. CÔTE - JOUR", html: "" };
    const { entry, screenplay } = trashCard(card, { x: 0, y: 0 }, [], sp, "2026-11-08");
    // Ce que fait le store : la carte part avec sa scène, « OMIS » prend sa place.
    expect(entry.trashed.scene).toContain("Tu es en retard.");
    const omitted = omitScene(sp, 2, "b2", "OMIS");
    expect(screenplay!.elements.length).toBe(omitted.elements.length - 1);
    const out = restoreCard(entry, new Set(["a1", "c3"]), omitted);
    expect(out.screenplay!.elements).toEqual(sp.elements);
  });
});

describe("PDF", () => {
  it("imprime « OMIS » avec son numéro des deux côtés, jamais souligné", () => {
    const sp = omitScene(parse(source), 2, "b2", "OMIS");
    const lines = typeset(sp.elements, LAYOUTS.letter, "fr", { more: "(À SUIVRE)", contd: "(SUITE)" }, { underlineHeadings: true }).flatMap((p) => p.lines);
    const omis = lines.find((l) => l.text === "OMIS")!;
    expect(omis.underline).toBeUndefined();
    expect(lines.filter((l) => l.row === omis.row && l.text === "12")).toHaveLength(2);
    expect(lines.some((l) => l.text.includes("Yann"))).toBe(false);
  });
});
