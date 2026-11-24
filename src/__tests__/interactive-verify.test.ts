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

describe("accessibilité de la page web (#126)", () => {
  it("rappelle une image sans description et une scène à plus de quatre choix", () => {
    const five = ["Un", "Deux", "Trois", "Quatre", "Cinq"].map((x) => `* [${x}] -> END`).join("\n");
    const m = {
      a: `<p>Début.</p><img data-media="grille.jpg" alt=""><img data-media="cour.jpg" alt="La cour vide">${choicesHtml("* [Entrer] -> la_cour")}`,
      b: `<img data-media="cour.jpg" alt="La cour vide">${choicesHtml(five)}`,
      c: "",
      d: "",
    };
    const found = rules(verifyStory(scenes.slice(0, 2), m));
    expect(found).toContain("imageNoAlt:a");
    expect(found).not.toContain("imageNoAlt:b");
    expect(found).toContain("manyChoices:b:5");
    // Quatre choix, et un renvoi caché en plus : rien à dire.
    const four = { ...m, b: choicesHtml(["Un", "Deux", "Trois", "Quatre"].map((x) => `* [${x}] -> END`).join("\n") + "\n* [Caché] -> END #hidden") };
    expect(rules(verifyStory(scenes.slice(0, 2), four)).filter((r) => r.startsWith("manyChoices"))).toEqual([]);
  });
});

describe("images sans description, lues sans DOM", () => {
  it("reconnaît une description absente ou vide", async () => {
    const { hasImageWithoutAlt } = await import("../interactive/verify");
    expect(hasImageWithoutAlt('<img data-media="a.jpg" alt="">')).toBe(true);
    expect(hasImageWithoutAlt('<img data-media="a.jpg">')).toBe(true);
    expect(hasImageWithoutAlt('<img data-media="a.jpg" alt="  ">')).toBe(true);
    expect(hasImageWithoutAlt('<img data-media="a.jpg" alt="Un puits">')).toBe(false);
    expect(hasImageWithoutAlt('<p>Pas d’image</p>')).toBe(false);
    expect(hasImageWithoutAlt(undefined)).toBe(false);
  });
});
