// @vitest-environment happy-dom
// Roman interactif → Ink (lot 3) : texte composé, compilé par inkjs comme dans l'app, erreurs rapportées à leur scène.

import { describe, expect, it } from "vitest";
import { Compiler } from "inkjs/full";
import { escapeInk, imagesOfTags, inkProblems, projectToInk, sceneOfPath } from "../interactive/ink";
import { choicesHtml, sceneSlugs } from "../interactive/choices";

const scenes = [
  { id: "s1", title: "La grille" },
  { id: "s2", title: "La cour" },
  { id: "s3", title: "Le village" },
];
const manuscript = {
  s1: `<p>La grille est entrouverte {ou presque} -> #1.</p><img data-media="grille.jpg" alt=""><p>* Une lanterne.</p>${choicesHtml("* [Pousser la grille] -> la_cour\n* [Rentrer] -> le_village")}`,
  s2: "<p>La cour est <em>vide</em>.</p>",
  s3: `<p>Le village dort.</p>${choicesHtml("* [Repartir] -> la_grille\n* [Dormir] -> END")}`,
};

const play = (ink: string) => {
  const c = new Compiler(ink);
  const story = c.Compile();
  const read = () => {
    const out: { text: string; tags: string[] }[] = [];
    while (story.canContinue) out.push({ text: story.Continue()!.trim(), tags: story.currentTags ?? [] });
    return out;
  };
  return { story, read, warnings: c.warnings };
};

describe("texte Ink du projet", () => {
  it("se compile et se lit comme le livre", () => {
    const src = projectToInk(scenes, sceneSlugs(scenes), manuscript);
    const { story, read } = play(src.ink);
    const first = read();
    expect(first.map((l) => l.text)).toEqual(["La grille est entrouverte {ou presque} -> #1.", "* Une lanterne."]);
    expect(imagesOfTags(first[1].tags)).toEqual(["grille.jpg"]);
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Pousser la grille", "Rentrer"]);
    story.ChooseChoiceIndex(0);
    expect(read().map((l) => l.text)).toEqual(["La cour est vide."]);
    // Sans choix, la scène finit l'histoire.
    expect(story.currentChoices).toHaveLength(0);
    expect(story.canContinue).toBe(false);
  });

  it("tester à partir d'une scène", () => {
    const src = projectToInk(scenes, sceneSlugs(scenes), manuscript);
    const { story, read } = play(src.ink);
    story.ChoosePathString("le_village");
    expect(read().map((l) => l.text)).toEqual(["Le village dort."]);
    expect(sceneOfPath(story.state.currentPathString ?? "le_village", src.knots)).toBe("s3");
  });

  it("une destination inconnue : erreur rapportée à sa scène", () => {
    const bad = { ...manuscript, s2: `<p>x</p>${choicesHtml("* [Voler] -> nulle_part")}` };
    const src = projectToInk(scenes, sceneSlugs(scenes), bad);
    const c = new Compiler(src.ink);
    expect(() => c.Compile()).toThrow();
    const problems = inkProblems(c.errors, src);
    expect(problems).toHaveLength(1);
    expect(problems[0].scene).toBe("s2");
    expect(problems[0].message).toContain("nulle_part");
  });

  it("aucune scène : une histoire vide qui se compile", () => {
    expect(() => new Compiler(projectToInk([], new Map(), {}).ink).Compile()).not.toThrow();
  });

  it("le texte de l'auteur reste du texte", () => {
    for (const text of ["{a} [b] | # c -> d // e /* f <> g \\ h", "* puce", "- tiret", "~ tilde", "= égal", "(parenthèse)"]) {
      const { read } = play(`-> a\n=== a ===\n${escapeInk(text)}\n-> END\n`);
      expect(read()[0].text).toBe(text);
    }
  });
});
