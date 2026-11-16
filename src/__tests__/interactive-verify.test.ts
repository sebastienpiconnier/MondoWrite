// @vitest-environment happy-dom
// Vérificateur d'un roman interactif (lot 5) : inaccessibles, sans fin, blocages, faits jamais ou trop tard donnés.

import { describe, expect, it } from "vitest";
import { choicesHtml } from "../interactive/choices";
import { verifyStory, type VerifyPoint } from "../interactive/verify";

const scenes = [
  { id: "a", title: "La grille" },
  { id: "b", title: "La cour" },
  { id: "c", title: "Le puits" },
  { id: "d", title: "Le grenier" },
];
const rules = (points: VerifyPoint[]) => points.map((p) => `${p.rule}:${p.scene}${p.name ? `:${p.name}` : ""}`);

describe("chemin du lecteur", () => {
  it("histoire saine : rien à signaler", () => {
    const m = {
      a: choicesHtml("* [Entrer] -> la_cour\n  ~ cle = true\n* [Fuir] -> END"),
      b: choicesHtml("* { cle } [Ouvrir le puits] -> le_puits\n* [Monter] -> le_grenier"),
      c: choicesHtml("* [Fin] -> END"),
      d: choicesHtml("* [Fin] -> END"),
    };
    expect(verifyStory(scenes, m)).toEqual([]);
  });

  it("scène inaccessible, destination introuvable, fin implicite", () => {
    const m = { a: choicesHtml("* [Entrer] -> la_cour\n* [Ailleurs] -> nulle_part"), b: "<p>Fin.</p>", c: choicesHtml("* [x] -> END"), d: "" };
    expect(rules(verifyStory(scenes, m))).toEqual([
      "unreachableScene:c",
      "unreachableScene:d",
      "brokenChoice:a",
      "implicitEnd:b",
    ]);
  });

  it("aucune fin atteignable : une boucle", () => {
    const m = { a: choicesHtml("* [Aller] -> la_cour"), b: choicesHtml("* [Revenir] -> la_grille"), c: "", d: "" };
    expect(rules(verifyStory(scenes, m))[0]).toBe("noEnding:a");
  });

  it("un renvoi écrit à la main compte comme une sortie", () => {
    const m = { a: choicesHtml("-> la_cour"), b: choicesHtml("* [x] -> END"), c: "", d: "" };
    expect(rules(verifyStory(scenes.slice(0, 2), m))).toEqual([]);
  });
});

describe("faits", () => {
  it("scène qui peut bloquer, fait jamais donné, fait donné trop tard", () => {
    const m = {
      a: choicesHtml("* { lampe } [Descendre] -> le_puits\n* { cle } [Entrer] -> la_cour"),
      b: choicesHtml("* [Prendre la clé] -> END\n  ~ cle = true"),
      c: choicesHtml("* [x] -> END"),
      d: "",
    };
    const out = verifyStory(scenes.slice(0, 3), m, { lampe: "a une lampe" });
    expect(rules(out)).toEqual(["lockedScene:a", "factNeverGiven:a:lampe", "factTooLate:a:cle"]);
    expect(out.find((p) => p.rule === "factNeverGiven")?.label).toBe("a une lampe");
  });

  it("« pas : » un fait, et une condition qui nomme une scène, ne demandent rien", () => {
    const m = { a: choicesHtml("* { not cle } [Entrer] -> la_cour\n* { la_cour } [Revenir] -> END\n* [Fin] -> END"), b: choicesHtml("* [Retour] -> la_grille") };
    expect(rules(verifyStory(scenes.slice(0, 2), m))).toEqual([]);
  });

  it("donné dans la scène même, par un choix qui y revient", () => {
    const m = { a: choicesHtml("* [Fouiller] -> la_grille\n  ~ cle = true\n* { cle } [Ouvrir] -> END") };
    expect(rules(verifyStory(scenes.slice(0, 1), m))).toEqual([]);
  });
});
