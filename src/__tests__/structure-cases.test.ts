import { describe, expect, it } from "vitest";
import type { ScreenplayElement } from "../screenplay/model";
import { adoptStructureCases, caseKind, customizeRange, scopeAt, usedCaseKeys, withCaseNote } from "../screenplay/structureCases";
import { applyCustom, customOf, screenplayPlan } from "../screenplay/template";
import { nextNumber, structureOf, structureSection } from "../screenplay/structure";
import { leafBeats } from "../plan";

const sec = (text: string, depth = 1): ScreenplayElement => ({ type: "section", depth, text });
const head = (text: string, cardId: string): ScreenplayElement => ({ type: "sceneHeading", text, cardId });
const text = {
  label: (k: string) => `L-${k}`,
  hint: (k: string) => `H-${k}`,
  tplName: (t: string) => `Ma structure (d’après ${t})`,
  builtInOf: () => "troisActes",
};

describe("actes et séquences = cases de la structure (#148)", () => {
  it("la note de case se pose après le titre, les autres notes restent", () => {
    expect(withCaseNote("Séquence 1 [[cosmos:seq:abc]]", "u3")).toBe("Séquence 1 [[cosmos:beat:u3]] [[cosmos:seq:abc]]");
    expect(withCaseNote("Acte [[cosmos:beat:u1]] [[cosmos:act:x]]", "u9")).toBe("Acte [[cosmos:beat:u9]] [[cosmos:act:x]]");
  });

  it("reprise : un acte et ses séquences deviennent des cases imbriquées, l'acte au niveau 1", () => {
    const els = [sec("Acte 1 [[cosmos:act:a1]]", 1), sec("Séquence 1 [[cosmos:seq:s1]]", 2), head("INT. A - JOUR", "c1"), sec("Séquence 2 [[cosmos:seq:s2]]", 2), head("INT. B - JOUR", "c2")];
    const done = adoptStructureCases(els, undefined, text);
    expect(done.elements).not.toBe(els);
    const custom = customOf(done.elements)!;
    expect(custom.beats.map((b) => [b.label, b.level ?? 1])).toEqual([["Acte 1", 1], ["Séquence 1", 2], ["Séquence 2", 2]]);
    const plan = screenplayPlan(done.elements);
    expect(plan.template).toBe("perso");
    expect(leafBeats(plan.template, plan.custom).length).toBe(2);
    expect(caseKind(done.elements, custom.beats[1].key)).toBe("seq");
    // Toujours un acte et deux séquences pour la liste des scènes.
    expect(structureOf(done.elements).map((p) => p.kind)).toEqual(["act", "seq", "seq"]);
    // Rien à refaire la fois suivante.
    expect(adoptStructureCases(done.elements, undefined, text).elements).toBe(done.elements);
  });

  it("une structure livrée du même texte devient celle de l'auteur, ses scènes restent", () => {
    const els = [sec("Exposition [[cosmos:beat:a_setup]]"), head("INT. A - JOUR", "c1"), sec("Séquence 1 [[cosmos:seq:s1]]", 2), head("INT. B - JOUR", "c2"), sec("Confrontation [[cosmos:beat:a_confrontation]]")];
    const done = adoptStructureCases(els, undefined, text);
    const plan = screenplayPlan(done.elements);
    expect(plan.template).toBe("perso");
    expect(plan.custom!.beats.map((b) => b.label)).toEqual(["L-a_setup", "Séquence 1", "L-a_confrontation"]);
    expect(Object.values(done.entries).some((e) => e.tpl === "Ma structure (d’après troisActes)" && e.hint === "H-a_setup")).toBe(true);
    expect(Object.values(plan.beats).flat()).toEqual(["c1", "c2"]);
  });

  it("une case n'est qu'une fois par clé, épisode par épisode", () => {
    const els = [sec("S1 [[cosmos:season:x]]", 1), sec("E1 [[cosmos:episode:e1]]", 2), sec("Acte [[cosmos:act:a]]", 3), sec("E2 [[cosmos:episode:e2]]", 2), sec("Acte [[cosmos:act:b]]", 3)];
    const done = adoptStructureCases(els, { u1: { hint: "pris" } }, text);
    const keys = usedCaseKeys(done.elements);
    expect(new Set(keys).size).toBe(2);
    expect(keys).not.toContain("u1");
    expect(scopeAt(done.elements, 4)).toEqual([4, 5]);
  });

  it("customizeRange ne touche qu'aux cases livrées de l'intervalle", () => {
    const els = [sec("A [[cosmos:beat:a_setup]]"), sec("Mine [[cosmos:beat:u1]]")];
    const done = customizeRange(els, 0, 2, ["u1"], { label: () => "Exposition", hint: () => "", tplName: "" });
    expect(done.elements[0]).toEqual(sec("Exposition [[cosmos:beat:u2]]"));
    expect(done.elements[1]).toBe(els[1]);
  });

  it("une séquence posée dans une case devient sa sous-case ; les numéros courent dans l'épisode", () => {
    const els = [sec("Case [[cosmos:beat:u1]]"), head("INT. A - JOUR", "c1"), sec("Séquence 1 [[cosmos:beat:u2]] [[cosmos:seq:s1]]", 2), head("INT. B - JOUR", "c2"), sec("Case 2 [[cosmos:beat:u3]]"), head("INT. C - JOUR", "c3")];
    expect(structureSection(els, 5, "seq", "s2", "Séquence 2", "u4")).toEqual(sec("Séquence 2 [[cosmos:beat:u4]] [[cosmos:seq:s2]]", 2));
    expect(nextNumber(els, 5, "seq")).toBe(2);
  });

  it("réordonner la structure de l'auteur garde les notes d'acte et de séquence", () => {
    const els = [sec("Acte 1 [[cosmos:beat:u1]] [[cosmos:act:a]]"), sec("Séquence 1 [[cosmos:beat:u2]] [[cosmos:seq:s]]", 2), head("INT. A - JOUR", "c1")];
    const sp = { titlePage: {}, elements: els };
    const custom = customOf(els)!;
    const next = applyCustom(sp, { ...custom, beats: custom.beats.map((b) => (b.key === "u1" ? { ...b, label: "Ouverture" } : b)) });
    expect(next.elements[0]).toEqual(sec("Ouverture [[cosmos:beat:u1]] [[cosmos:act:a]]"));
    expect(structureOf(next.elements)[0].kind).toBe("act");
  });
});
