// @vitest-environment happy-dom
// Roman interactif, lot 9 : import Twee 3 et Ink.

import { describe, expect, it } from "vitest";
import { Compiler } from "inkjs/full";
import { choicesHtml, choicesIn, sceneSlugs } from "../interactive/choices";
import { parseInk, parseTwee, readTweeLink, storyToProject, titleOfKnot } from "../interactive/storyImport";
import { projectToInk } from "../interactive/ink";
import { projectFromFile, importExtensions } from "../import";

let n = 0;
const newId = () => `id${String(++n).padStart(6, "0")}`;

const TWEE = `:: StoryTitle
La grille

:: StoryData
{"ifid":"X","format":"SugarCube","start":"Grille"}

:: Village [nuit] {"position":"100,100"}
Le village dort.
[[Repartir->Grille]]

:: Grille
La grille est entrouverte.
Tu peux [[pousser la grille|La cour]] ou rentrer.
<<set $cle to true>>
[[Rentrer au village->Village]] | [[Grille<-Rester]]

:: La cour
La cour est vide.

:: Style [stylesheet]
body { color: red; }
`;

describe("import Twee 3", () => {
  it("lit les liens de Twine sous toutes leurs formes", () => {
    expect(readTweeLink("a->b")).toEqual({ label: "a", target: "b" });
    expect(readTweeLink("b<-a")).toEqual({ label: "a", target: "b" });
    expect(readTweeLink("a|b")).toEqual({ label: "a", target: "b" });
    expect(readTweeLink("b")).toEqual({ label: "b", target: "b" });
    expect(readTweeLink("a|b][$x to 1")).toEqual({ label: "a", target: "b" });
  });

  it("fait une scène par passage, le départ en tête, les liens en choix", () => {
    const source = parseTwee(TWEE)!;
    expect(source.title).toBe("La grille");
    expect(source.start).toBe("Grille");
    expect(source.skipped).toBe(1);
    expect(source.scenes.map((s) => s.name)).toEqual(["Village", "Grille", "La cour"]);
    const grille = source.scenes[1];
    expect(grille.paragraphs).toEqual(["La grille est entrouverte.", "Tu peux pousser la grille ou rentrer."]);
    expect(grille.choices.map((c) => c.kind === "choice" && [c.label, c.target])).toEqual([
      ["pousser la grille", "La cour"],
      ["Rentrer au village", "Village"],
      ["Rester", "Grille"],
    ]);

    const project = storyToProject(source, { fileName: "grille.twee", newId });
    expect(project.meta.title).toBe("La grille");
    expect((project.meta as unknown as Record<string, unknown>).interactive).toBe(true);
    const [start] = project.cards;
    expect(start.title).toBe("Grille");
    const lines = choicesIn(project.manuscript![start.id]);
    expect(lines.map((l) => l.kind === "choice" && l.target)).toEqual(["la_cour", "village", "grille"]);
    expect(project.manuscript![start.id]).toContain("<p>La grille est entrouverte.</p>");
  });
});

const INK = `VAR cle = false // La clé
VAR pieces = 0
-> la_grille

=== la_grille ===
La grille est entrouverte. // un commentaire
# image: grille.jpg
* [Pousser la grille]
  ~ cle = true
  -> la_cour
+ {pieces > 0} [Payer] -> la_cour.porte
* Rentrer[.] au village.
  Tu fais demi-tour.
  -> END

=== la_cour ===
La cour est vide.
- -> porte
= porte
* { cle } [Ouvrir] -> DONE
* [Retour] -> la_grille

=== function double(x) ===
~ return x * 2
`;

describe("import Ink", () => {
  it("fait une scène par knot et par stitch, garde le reste en Ink brut", () => {
    const source = parseInk(INK, "Ouverture")!;
    expect(source.start).toBe("la_grille");
    expect(source.factLabels).toEqual({ cle: "La clé" });
    expect(source.skipped).toBe(1);
    expect(source.scenes.map((s) => [s.name, s.title])).toEqual([
      ["la_grille", "La grille"],
      ["la_cour", "La cour"],
      ["la_cour.porte", "La cour, porte"],
    ]);
    const [grille, cour, porte] = source.scenes;
    expect(grille.paragraphs).toEqual(["La grille est entrouverte."]);
    expect(grille.choices[0]).toEqual({ kind: "choice", label: "Pousser la grille", target: "la_cour", effects: ["cle = true"] });
    expect(grille.choices[1]).toEqual({ kind: "choice", label: "Payer", target: "la_cour.porte", cond: "pieces > 0" });
    // Un choix qui écrit du texte après lui reste en Ink.
    expect(grille.choices.slice(2).every((c) => c.kind === "raw")).toBe(true);
    expect(cour.choices).toEqual([{ kind: "raw", text: "- -> porte" }]);
    expect(porte.choices[0]).toEqual({ kind: "choice", label: "Ouvrir", target: "DONE", cond: "cle" });
  });

  it("réécrit les renvois vers les noms des scènes du projet", () => {
    const project = storyToProject(parseInk(INK, "Ouverture")!, { fileName: "grille.ink", newId });
    const [grille, cour, porte] = project.cards;
    const slugs = sceneSlugs(project.cards.map((c) => ({ id: c.id, title: c.title })));
    expect(slugs.get(porte.id)).toBe("la_cour_porte");
    const g = choicesIn(project.manuscript![grille.id]);
    expect(g[1]).toMatchObject({ kind: "choice", target: "la_cour_porte" });
    expect(choicesIn(project.manuscript![cour.id])).toEqual([{ kind: "raw", text: "- -> la_cour_porte" }]);
    expect(choicesIn(project.manuscript![porte.id])[0]).toMatchObject({ target: "END" });
    expect((project.meta as unknown as Record<string, unknown>).storyFacts).toEqual({ cle: "La clé" });
  });

  it("relit une histoire exportée par MondoWrite et la rejoue pareil", () => {
    const scenes = [
      { id: "s1", title: "La grille" },
      { id: "s2", title: "La cour" },
    ];
    const manuscript = {
      s1: `<p>La grille est entrouverte.</p>${choicesHtml("* [Pousser la grille] -> la_cour\n  ~ cle = true\n* [Partir] -> END")}`,
      s2: `<p>La cour est vide.</p>${choicesHtml("* { cle } [Ouvrir] -> END\n* [Retour] -> la_grille")}`,
    };
    const ink = projectToInk(scenes, sceneSlugs(scenes), manuscript, { cle: "La clé" }).ink;
    const project = storyToProject(parseInk(ink, "Ouverture")!, { fileName: "x.ink", newId });
    const back = project.cards.map((c) => ({ id: c.id, title: c.title }));
    expect(back.map((s) => s.title)).toEqual(["La grille", "La cour"]);
    const again = projectToInk(back, sceneSlugs(back), project.manuscript!, { cle: "La clé" }).ink;
    const story = new Compiler(again).Compile();
    expect(story.ContinueMaximally().trim()).toBe("La grille est entrouverte.");
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Pousser la grille", "Partir"]);
    story.ChooseChoiceIndex(0);
    story.ContinueMaximally();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Ouvrir", "Retour"]);
  });

  it("met le texte d'avant le premier knot dans une scène d'ouverture", () => {
    const source = parseInk("Il pleut.\n* [Entrer] -> salle\n=== salle ===\nUne salle.", "Ouverture")!;
    expect(source.start).toBe("__opening");
    expect(source.scenes[0]).toMatchObject({ title: "Ouverture", paragraphs: ["Il pleut."] });
  });

  it("donne un titre lisible au nom d'un knot", () => {
    expect(titleOfKnot("la_cour_d_honneur")).toBe("La cour d honneur");
  });
});

describe("choix du fichier", () => {
  it("ne propose Twee et Ink qu'avec le roman interactif", async () => {
    expect(importExtensions(false)).not.toContain("ink");
    expect(importExtensions(true)).toEqual(expect.arrayContaining(["twee", "tw", "ink"]));
    const file = { name: "x.twee", data: new TextEncoder().encode(TWEE) };
    const base = { fileName: "x.twee", locale: "fr", linkLabel: "", newId };
    expect(await projectFromFile(file, base)).toBeNull();
    expect((await projectFromFile(file, { ...base, interactive: { opening: "Ouverture" } }))?.cards).toHaveLength(3);
  });
});
