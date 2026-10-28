// « Mes gabarits » : les cases de l'auteur, leurs clés stables, dans un roman et dans un scénario.

import { describe, expect, it } from "vitest";
import { arrange, beatText, nextCustomKey, readCustom, readPlan, templateBeats, withKeys } from "../plan";
import { applyCustom, currentTemplate, customOf, screenplayPlan } from "../screenplay/template";
import { readTemplates } from "../settings";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";

describe("cases de l'auteur", () => {
  it("une case garde sa clé, une case nouvelle en reçoit une jamais prise, une case sans nom est laissée", () => {
    const beats = withKeys(
      [
        { key: "u2", label: " Ouverture ", hint: "Le monde" },
        { label: "Nouvelle" },
        { label: "  " },
        { key: "u2", label: "Doublon" },
      ],
      ["u5"],
    );
    expect(beats).toEqual([
      { key: "u2", label: "Ouverture", hint: "Le monde" },
      { key: "u6", label: "Nouvelle" },
      { key: "u7", label: "Doublon" },
    ]);
    expect(nextCustomKey(["a_setup", "u3", "u12"])).toBe("u13");
  });

  it("relues : clés valides et uniques, noms non vides ; plan « perso » sans cases : libre", () => {
    expect(readCustom({ name: "Moi", beats: [{ key: "u1", label: "A" }, { key: "x", label: "B" }, { key: "u1", label: "C" }, { key: "u2", label: "" }] })).toEqual({ name: "Moi", beats: [{ key: "u1", label: "A" }] });
    expect(readCustom({ beats: [] })).toBeUndefined();
    const plan = readPlan({ template: "perso", beats: { u1: ["s1"] }, custom: { name: "Moi", beats: [{ key: "u1", label: "A" }, { key: "u2", label: "B" }] } });
    expect(plan.template).toBe("perso");
    expect(templateBeats(plan.template, plan.custom)).toEqual(["u1", "u2"]);
    expect(arrange(plan, ["s1", "s2"])).toEqual({ beats: [{ key: "u1", ids: ["s1"] }, { key: "u2", ids: [] }], unplaced: ["s2"] });
    expect(readPlan({ template: "perso", beats: {} }).template).toBe("libre");
    expect(beatText("u2", {}, plan.custom).label).toBe("B");
    expect(beatText("a_setup", { a_setup: { label: "Acte I", hint: "h" } }).label).toBe("Acte I");
  });

  it("gabarits gardés sur l'appareil : relus sans ce qui n'a pas la bonne forme", () => {
    expect(readTemplates([{ id: "a", name: "Mon polar", beats: [{ label: "Crime" }, { label: "" }] }, { id: "a", beats: [{ label: "x" }] }, "z"])).toEqual([{ id: "a", name: "Mon polar", beats: [{ label: "Crime" }] }]);
  });
});

describe("gabarit de l'auteur dans un scénario", () => {
  const scene = (id: string): ScreenplayElement => ({ type: "sceneHeading", text: `INT. ${id} - JOUR`, cardId: id });
  const sp = (elements: ScreenplayElement[]): Screenplay => ({ titlePage: {}, elements });

  it("posé : la première case avant la première scène, les autres à la fin ; relu en plan", () => {
    const first = applyCustom(sp([scene("a"), scene("b")]), { name: "", beats: [{ key: "u1", label: "Début" }, { key: "u2", label: "Fin" }] });
    expect(first.elements.map((e) => e.text)).toEqual(["Début [[cosmos:beat:u1]]", "INT. a - JOUR", "INT. b - JOUR", "Fin [[cosmos:beat:u2]]"]);
    expect(currentTemplate(first.elements)).toBe("perso");
    expect(customOf(first.elements)).toEqual({ name: "", beats: [{ key: "u1", label: "Début" }, { key: "u2", label: "Fin" }] });
    expect(screenplayPlan(first.elements).beats).toEqual({ u1: ["a", "b"] });
  });

  it("né du gabarit en place : chaque section devient la nouvelle sur place, ses scènes restent dessous", () => {
    const base = sp([{ type: "section", depth: 1, text: "Acte I [[cosmos:beat:a_setup]]" }, scene("a"), { type: "section", depth: 1, text: "Déclencheur [[cosmos:beat:a_incident]]" }, scene("b"), { type: "section", depth: 1, text: "Climax [[cosmos:beat:a_climax]]" }]);
    const next = applyCustom(base, { name: "", beats: [{ key: "u1", label: "Début" }, { key: "u2", label: "Bascule" }, { key: "u3", label: "Morale" }] }, new Map([["a_setup", "u1"], ["a_incident", "u2"]]));
    expect(next.elements.map((e) => e.text)).toEqual(["Début [[cosmos:beat:u1]]", "INT. a - JOUR", "Bascule [[cosmos:beat:u2]]", "INT. b - JOUR", "Morale [[cosmos:beat:u3]]"]);
    expect(screenplayPlan(next.elements).beats).toEqual({ u1: ["a"], u2: ["b"] });
  });

  it("modifié : une case renommée garde sa place, une case retirée perd sa section, une nouvelle arrive à la fin", () => {
    const base = sp([{ type: "section", depth: 1, text: "Début [[cosmos:beat:u1]]" }, scene("a"), { type: "section", depth: 1, text: "Milieu [[cosmos:beat:u2]]" }, scene("b")]);
    const next = applyCustom(base, { name: "", beats: [{ key: "u1", label: "Ouverture" }, { key: "u3", label: "Final" }] });
    expect(next.elements.map((e) => e.text)).toEqual(["Ouverture [[cosmos:beat:u1]]", "INT. a - JOUR", "INT. b - JOUR", "Final [[cosmos:beat:u3]]"]);
    expect(applyCustom(base, { name: "", beats: [{ key: "u1", label: "Début" }, { key: "u2", label: "Milieu" }] })).toBe(base);
  });
});
