// @vitest-environment happy-dom
// Roman interactif, lot 9 : import Twee 3 et Ink.

import { describe, expect, it } from "vitest";
import { Compiler } from "inkjs/full";
import { choicesHtml, choicesIn, sceneSlugs } from "../interactive/choices";
import { parseInk, parseTwee, readTweeLink, storyReport, storyToProject, titleOfKnot } from "../interactive/storyImport";
import { readPassage, twineCond, twineEffects } from "../interactive/twine";
import { storyFacts } from "../interactive/facts";
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
    expect(readTweeLink("a|b][$x to 1")).toEqual({ label: "a", target: "b", setter: "$x to 1" });
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
      false,
    ]);
    // Au départ, un fait donné ne peut être l'effet d'aucun choix : la macro reste en commentaire.
    expect(grille.choices[3]).toEqual({ kind: "raw", text: "// <<set $cle to true>>" });
    expect(source.kept).toBe(1);

    const project = storyToProject(source, { fileName: "grille.twee", newId });
    expect(project.meta.title).toBe("La grille");
    expect((project.meta as unknown as Record<string, unknown>).interactive).toBe(true);
    const [start] = project.cards;
    expect(start.title).toBe("Grille");
    const lines = choicesIn(project.manuscript![start.id]);
    expect(lines.map((l) => l.kind === "choice" && l.target)).toEqual(["la_cour", "village", "grille", false]);
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
      ["la_grille__1", "Rentrer."],
      ["la_cour", "La cour"],
      ["la_cour.porte", "La cour, porte"],
    ]);
    const [grille, rentrer, cour, porte] = source.scenes;
    expect(grille.paragraphs).toEqual(["La grille est entrouverte."]);
    expect(grille.choices[0]).toEqual({ kind: "choice", label: "Pousser la grille", target: "la_cour", effects: ["cle = true"] });
    expect(grille.choices[1]).toEqual({ kind: "choice", label: "Payer", target: "la_cour.porte", cond: "pieces > 0" });
    // Un choix qui écrit du texte après lui mène à une scène de passage, qui porte ce texte.
    expect(grille.choices[2]).toEqual({ kind: "choice", label: "Rentrer.", target: "la_grille__1" });
    expect(rentrer).toMatchObject({ paragraphs: ["Rentrer au village.", "Tu fais demi-tour."], choices: [{ kind: "choice", label: "", target: "END" }] });
    expect(cour.choices).toEqual([{ kind: "raw", text: "- -> porte" }]);
    expect(porte.choices[0]).toEqual({ kind: "choice", label: "Ouvrir", target: "DONE", cond: "cle" });
  });

  it("réécrit les renvois vers les noms des scènes du projet", () => {
    const project = storyToProject(parseInk(INK, "Ouverture")!, { fileName: "grille.ink", newId });
    const [grille, , cour, porte] = project.cards;
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

  it("fait du texte écrit sous un choix une scène de passage, avec ses effets sur le choix", () => {
    const source = parseInk(
      "Une porte.\n* [Chercher une clé]\n    Vous fouillez.\n    ~ temp cle = true\n    -> porte\n* [Partir] Vous partez.\n    -> END\n=== porte ===\nElle s'ouvre.\n-> END",
      "Ouverture",
    )!;
    expect(source.scenes.map((s) => s.title)).toEqual(["Ouverture", "Chercher une clé", "Partir", "Porte"]);
    expect(source.scenes[0].choices).toEqual([
      { kind: "choice", label: "Chercher une clé", target: "__opening__1", effects: ["cle = true"] },
      { kind: "choice", label: "Partir", target: "__opening__2" },
    ]);
    expect(source.scenes[1]).toMatchObject({ paragraphs: ["Vous fouillez."], choices: [{ kind: "choice", label: "", target: "porte" }] });
    expect(source.scenes[2]).toMatchObject({ paragraphs: ["Vous partez."], choices: [{ kind: "choice", label: "", target: "END" }] });
    const project = storyToProject(source, { fileName: "porte.ink", newId });
    const scenes = project.cards.map((c) => ({ id: c.id, title: c.title }));
    const story = new Compiler(projectToInk(scenes, sceneSlugs(scenes), project.manuscript!, {}).ink).Compile();
    story.ContinueMaximally();
    story.ChooseChoiceIndex(0);
    expect(story.ContinueMaximally()).toContain("Vous fouillez.");
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

// #96 : la logique de Twine convertie en faits, conditions et choix.

const SUGAR = `:: StoryData
{"ifid":"Y","format":"SugarCube","start":"Porte"}

:: StoryInit
<<set $or to 0>>

:: Porte
Une porte de fer. Tu as <<print $or>> pièces.
<<if $cle>>[[Ouvrir->Salle]]<<elseif $or gte 3>>[[Payer le gardien|Salle]]<</if>>
[[Fouiller|Atelier][$lanterne to true]]
<<link "Fuir" "Dehors">><<set $peur += 1>><</link>>

:: Atelier
<<set $cle to true>><<set $or += 2>>
Un établi. Une clé brille dessous.
<<if not $peur>>Tout est calme.<</if>>
<<goto "Porte">>

:: Salle
La salle est vide.

:: Dehors
Il pleut.
<<button [[Revenir|Porte]]>><</button>>
`;

const HARLOWE = `:: StoryData
{"ifid":"Z","format":"Harlowe","start":"Couloir"}

:: Couloir
Un couloir sombre.
(if: $cle)[[[Ouvrir->Salle]]](else:)[La porte est fermée.]
(link-goto: "Chercher", "Cave")
(unless: $peur)[(link: "Toquer")[(set: $toc to true)(goto: "Salle")]]
(text-colour: red)[Une lueur rouge.] (either: "a", "b")

:: Cave
(set: $cle to true)(set: $pieces to it + 1)
Une clé rouillée.
(click-goto: "remonter", "Couloir")Tu peux remonter.

:: Salle
(if: $toc is true)[Quelqu'un ouvre.]
Fin.
`;

const play = (project: ReturnType<typeof storyToProject>) => {
  const scenes = project.cards.map((c) => ({ id: c.id, title: c.title }));
  const compiler = new Compiler(projectToInk(scenes, sceneSlugs(scenes), project.manuscript!, {}).ink);
  const story = compiler.Compile();
  return { story, errors: compiler.errors };
};

describe("logique de Twine (#96)", () => {
  it("écrit les conditions de SugarCube et de Harlowe en conditions Ink", () => {
    expect(twineCond("$cle")).toBe("cle");
    expect(twineCond("not $cle")).toBe("not cle");
    expect(twineCond("!$cle")).toBe("not cle");
    expect(twineCond("$cle is true")).toBe("cle");
    expect(twineCond("$cle is not true")).toBe("not cle");
    expect(twineCond("$cle eq false")).toBe("not cle");
    expect(twineCond("$pieces gte 3")).toBe("pieces >= 3");
    expect(twineCond("$pieces is 2")).toBe("pieces == 2");
    expect(twineCond("$a and ($b or $c > 1)")).toBe("a and (b or c > 1)");
    // `or` est un mot d'Ink : la variable devient `or_var`.
    expect(twineCond("$or > 0")).toBe("or_var > 0");
    expect(twineCond('$nom is "Bob"')).toBeNull();
    expect(twineCond("_temp")).toBeNull();
    expect(twineCond("visited()")).toBeNull();
  });

  it("lit les affectations simples", () => {
    expect(twineEffects("$cle to true")).toEqual(["cle = true"]);
    expect(twineEffects("$or += 2; $peur++")).toEqual(["or_var += 2", "peur += 1"]);
    expect(twineEffects("$x to $x - 1, $y = 4")).toEqual(["x -= 1", "y = 4"]);
    expect(twineEffects("$x to it + 1")).toEqual(["x += 1"]);
    expect(twineEffects("1 into $x", "put")).toEqual(["x = 1"]);
    expect(twineEffects('$nom to "Bob"')).toBeNull();
    expect(twineEffects("$x to random(1, 6)")).toBeNull();
  });

  it("SugarCube : faits, conditions, setters et liens macros", () => {
    const source = parseTwee(SUGAR)!;
    expect(source.start).toBe("Porte");
    const [porte, atelier, salle, dehors] = source.scenes;
    expect(porte.paragraphs).toEqual(["Une porte de fer. Tu as pièces."]);
    expect(porte.choices).toEqual([
      { kind: "choice", label: "Ouvrir", target: "Salle", cond: "cle" },
      { kind: "choice", label: "Payer le gardien", target: "Salle", cond: "not cle and or_var >= 3" },
      { kind: "choice", label: "Fouiller", target: "Atelier", effects: ["lanterne = true", "cle = true", "or_var += 2"] },
      { kind: "choice", label: "Fuir", target: "Dehors", effects: ["peur += 1"] },
      { kind: "raw", text: "// <<print $or>>" },
    ]);
    // Le texte d'un `<<if>>` se lit sans condition : ses balises restent en commentaire.
    expect(atelier.paragraphs).toEqual(["Un établi. Une clé brille dessous.", "Tout est calme."]);
    expect(atelier.choices).toEqual([
      { kind: "choice", label: "", target: "Porte" },
      { kind: "raw", text: "// <<if not $peur>>" },
      { kind: "raw", text: "// <</if>>" },
    ]);
    expect(salle.choices).toEqual([]);
    expect(dehors.choices).toEqual([{ kind: "choice", label: "Revenir", target: "Porte" }]);
    expect(storyReport(source)).toEqual({ scenes: 4, converted: 8, kept: 2, skipped: 1 });
  });

  it("Harlowe : crochets, else, unless, link-goto, click-goto", () => {
    const source = parseTwee(HARLOWE)!;
    const [couloir, cave, salle] = source.scenes;
    expect(couloir.paragraphs).toEqual(["Un couloir sombre.", "La porte est fermée.", "Une lueur rouge."]);
    expect(couloir.choices).toEqual([
      { kind: "choice", label: "Ouvrir", target: "Salle", cond: "cle" },
      { kind: "choice", label: "Chercher", target: "Cave", effects: ["cle = true", "pieces += 1"] },
      { kind: "choice", label: "Toquer", target: "Salle", cond: "not peur", effects: ["toc = true"] },
      { kind: "raw", text: "// (if: $cle)" },
      { kind: "raw", text: "// (else:)" },
      { kind: "raw", text: "// (text-colour: red)" },
      { kind: "raw", text: '// (either: "a", "b")' },
    ]);
    expect(cave.paragraphs).toEqual(["Une clé rouillée.", "Tu peux remonter."]);
    expect(cave.choices).toEqual([{ kind: "choice", label: "remonter", target: "Couloir" }]);
    expect(salle.paragraphs).toEqual(["Quelqu'un ouvre.", "Fin."]);
    expect(salle.choices).toEqual([{ kind: "raw", text: "// (if: $toc is true)" }]);
  });

  it("garde une condition illisible en commentaire, sans perdre le lien", () => {
    const read = readPassage('<<if $nom is "Bob">>[[Saluer|Bob]]<</if>>', false);
    expect(read.choices).toEqual([{ kind: "choice", label: "Saluer", target: "Bob" }]);
    expect(read.raw).toEqual(['// <<if $nom is "Bob">>', "// <</if>>"]);
    expect(read.kept).toBe(1);
  });

  it("ne lit pas les parenthèses d'un texte SugarCube comme des macros de Harlowe", () => {
    expect(readPassage("Il hésite (note: rien) puis part.", false).paragraphs).toEqual(["Il hésite (note: rien) puis part."]);
  });

  it("renomme un fait qui porte le nom d'une scène", () => {
    const source = parseTwee(":: A\n[[Aller|village][$village to true]]\n:: village\n<<if $village>>[[Revenir|A]]<</if>>")!;
    const project = storyToProject(source, { fileName: "v.twee", newId });
    const [a, v] = project.cards;
    expect(choicesIn(project.manuscript![a.id])[0]).toMatchObject({ target: "village", effects: ["village_fait = true"] });
    expect(choicesIn(project.manuscript![v.id])[0]).toMatchObject({ cond: "village_fait" });
  });

  for (const [name, text] of [
    ["SugarCube", SUGAR],
    ["Harlowe", HARLOWE],
  ] as const)
    it(`${name} : se compile et se joue, faits compris`, () => {
      const project = storyToProject(parseTwee(text)!, { fileName: "x.twee", newId });
      const { story, errors } = play(project);
      expect(errors).toEqual([]);
      const ids = project.cards.map((c) => c.id);
      const slugs = new Set(sceneSlugs(project.cards.map((c) => ({ id: c.id, title: c.title }))).values());
      const facts = storyFacts(project.manuscript!, ids, slugs, {}).map((f) => f.name);
      expect(facts).toContain("cle");
      story.ContinueMaximally();
      // Sans la clé, « Ouvrir » n'est pas proposé.
      expect(story.currentChoices.map((c) => c.text)).not.toContain("Ouvrir");
    });

  it("SugarCube : la clé trouvée ouvre la porte", () => {
    const { story } = play(storyToProject(parseTwee(SUGAR)!, { fileName: "x.twee", newId }));
    story.ContinueMaximally();
    story.ChooseChoiceIndex(story.currentChoices.findIndex((c) => c.text === "Fouiller"));
    story.ContinueMaximally();
    story.ChooseChoiceIndex(0); // Continuer, vers la porte
    story.ContinueMaximally();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Ouvrir", "Fouiller", "Fuir"]);
  });
});
