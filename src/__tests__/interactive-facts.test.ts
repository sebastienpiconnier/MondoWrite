// @vitest-environment happy-dom
// Faits et compteurs d'un roman interactif (lot 4) : effets des choix, faits du livre, déclarations Ink, et lecture
// réelle par inkjs (un choix demandé n'est proposé qu'une fois le fait acquis).

import { describe, expect, it } from "vitest";
import { Compiler } from "inkjs/full";
import { choicesHtml, editChoice, parseChoices, sceneSlugs, serializeChoices, type Choice } from "../interactive/choices";
import {
  condFromValue,
  condValue,
  givenFact,
  inkDeclarations,
  newFactName,
  otherEffects,
  readFactLabels,
  shownValue,
  simpleCond,
  storyFacts,
  withGiven,
} from "../interactive/facts";
import { projectToInk } from "../interactive/ink";

describe("effets d'un choix", () => {
  it("se lisent sous le choix et se réécrivent", () => {
    const text = "* { not cle } [Fouiller] -> la_cour\n  ~ cle = true\n  ~ pieces += 2\n* [Partir] -> END\n~ perdu = true";
    const lines = parseChoices(text);
    expect(lines).toEqual([
      { kind: "choice", label: "Fouiller", target: "la_cour", cond: "not cle", effects: ["cle = true", "pieces += 2"] },
      { kind: "choice", label: "Partir", target: "END", effects: ["perdu = true"] },
    ]);
    expect(serializeChoices(lines)).toBe("* { not cle } [Fouiller] -> la_cour\n  ~ cle = true\n  ~ pieces += 2\n* [Partir] -> END\n  ~ perdu = true");
    expect(parseChoices(serializeChoices(lines))).toEqual(lines);
  });

  it("un `~` sans choix au-dessus reste une ligne gardée", () => {
    expect(parseChoices("~ cle = true\n* [Partir] -> END")[0]).toEqual({ kind: "raw", text: "~ cle = true" });
  });

  it("restent quand on change le texte ou la destination", () => {
    const lines = parseChoices("* [Fouiller] -> la_cour\n  ~ cle = true");
    const next = editChoice(lines, 0, { ...(lines[0] as Choice), label: "Chercher" });
    expect(serializeChoices(next)).toBe("* [Chercher] -> la_cour\n  ~ cle = true");
  });
});

describe("réglages simples", () => {
  it("« Seulement si »", () => {
    expect(simpleCond("cle")).toEqual({ name: "cle", not: false });
    expect(simpleCond(" not  cle ")).toEqual({ name: "cle", not: true });
    expect(simpleCond("pieces >= 3")).toBeNull();
    expect(simpleCond("true")).toBeNull();
    expect(condValue(undefined)).toBe("");
    expect(condValue("not cle")).toBe("not:cle");
    expect(condValue("cle and lampe")).toBe("custom");
    expect(condFromValue("has:cle", undefined)).toBe("cle");
    expect(condFromValue("not:cle", undefined)).toBe("not cle");
    expect(condFromValue("custom", "a or b")).toBe("a or b");
    expect(condFromValue("", "cle")).toBeUndefined();
  });

  it("« Donne » ne touche pas aux effets écrits à la main", () => {
    const effects = ["pieces += 1", "cle = true"];
    expect(givenFact(effects)).toBe("cle");
    expect(otherEffects(effects)).toEqual(["pieces += 1"]);
    expect(withGiven(effects, "lampe")).toEqual(["lampe = true", "pieces += 1"]);
    expect(withGiven(effects, null)).toEqual(["pieces += 1"]);
  });

  it("un second fait donné par le même choix n'est ni caché ni effacé", () => {
    const effects = ["corde = true", "cle = true"];
    expect(givenFact(effects)).toBe("corde");
    expect(otherEffects(effects)).toEqual(["cle = true"]);
    expect(withGiven(effects, "lampe")).toEqual(["lampe = true", "cle = true"]);
    expect(withGiven(effects, null)).toEqual(["cle = true"]);
  });
});

describe("faits du livre", () => {
  const manuscript = {
    a: choicesHtml("* [Fouiller] -> b\n  ~ cle = true\n  ~ pieces += 1\n* { la_cour } [Revenir] -> b"),
    b: choicesHtml("* { cle } [Ouvrir] -> END\n* { pieces >= 3 } [Payer] -> END\n* { lampe } [Éclairer] -> END"),
  };
  const facts = storyFacts(manuscript, ["a", "b"], new Set(["la_cour", "b"]), { cle: "a trouvé la clé", oublie: "Jamais servi" }, "fr");

  it("se lisent dans les choix, sans les noms de scène", () => {
    expect(facts.map((f) => f.name)).toEqual(["cle", "oublie", "lampe", "pieces"]);
    const by = Object.fromEntries(facts.map((f) => [f.name, f]));
    expect(by.cle).toMatchObject({ label: "a trouvé la clé", kind: "bool", given: 1, needed: 1 });
    expect(by.pieces).toMatchObject({ kind: "int", given: 1, needed: 1 });
    expect(by.lampe).toMatchObject({ label: "lampe", given: 0, needed: 1 });
    expect(by.oublie).toMatchObject({ given: 0, needed: 0 });
  });

  it("se déclarent en tête du texte Ink", () => {
    expect(inkDeclarations(facts)).toEqual(["VAR cle = false // a trouvé la clé", "VAR oublie = false // Jamais servi", "VAR lampe = false", "VAR pieces = 0"]);
  });

  it("un nouveau fait ne prend jamais le nom d'une scène, d'un autre fait ou d'un mot d'Ink", () => {
    expect(newFactName("A trouvé la clé", new Set())).toBe("a_trouve_la_cle");
    expect(newFactName("La cour", new Set(["la_cour"]))).toBe("la_cour_2");
    expect(newFactName("not", new Set())).toBe("not_fait");
    expect(newFactName("!!!", new Set())).toBe("fait");
  });

  it("libellés relus prudemment", () => {
    expect(readFactLabels({ storyFacts: { cle: "  la  clé ", "mal nommé": "x", true: "y", n: 3 } })).toEqual({ cle: "la clé" });
    expect(readFactLabels({ storyFacts: ["x"] })).toEqual({});
    expect(readFactLabels(null)).toEqual({});
  });

  it("valeur montrée pendant la lecture", () => {
    expect(shownValue(true)).toBe("");
    expect(shownValue(false)).toBeNull();
    expect(shownValue(0)).toBeNull();
    expect(shownValue(2)).toBe("2");
  });
});

describe("lecture avec des faits", () => {
  const scenes = [
    { id: "s1", title: "La grille" },
    { id: "s2", title: "La cour" },
  ];
  const manuscript = {
    s1: `<p>Devant la grille.</p>${choicesHtml("* { cle } [Ouvrir avec la clé] -> END\n* { not cle } [Fouiller la cour] -> la_cour\n  ~ cle = true\n  ~ pieces += 1")}`,
    s2: `<p>Une clé brille dans l’herbe.</p>${choicesHtml("* [Revenir à la grille] -> la_grille")}`,
  };

  it("un choix demandé n'apparaît qu'une fois le fait acquis", () => {
    const src = projectToInk(scenes, sceneSlugs(scenes), manuscript, { cle: "a trouvé la clé" });
    expect(src.ink).toContain("VAR cle = false // a trouvé la clé");
    expect(src.ink).toContain("VAR pieces = 0");
    const compiler = new Compiler(src.ink);
    const story = compiler.Compile();
    expect(compiler.errors).toEqual([]);
    const read = () => {
      while (story.canContinue) story.Continue();
      return story.currentChoices.map((c) => c.text);
    };
    expect(read()).toEqual(["Fouiller la cour"]);
    story.ChooseChoiceIndex(0);
    expect(read()).toEqual(["Revenir à la grille"]);
    expect(story.variablesState.$("cle")).toBe(true);
    expect(story.variablesState.$("pieces")).toBe(1);
    story.ChooseChoiceIndex(0);
    expect(read()).toEqual(["Ouvrir avec la clé"]);
  });

  it("chaque ligne d'un choix à effets garde sa scène", () => {
    const src = projectToInk(scenes, sceneSlugs(scenes), manuscript);
    const at = src.ink.split("\n").findIndex((l) => l.trim() === "~ cle = true");
    expect(src.lines[at].scene).toBe("s1");
  });
});

describe("choix sans texte", () => {
  it("reçoit un texte, sinon Ink le cacherait", () => {
    const scenes = [{ id: "s1", title: "Départ" }];
    const src = projectToInk(scenes, sceneSlugs(scenes), { s1: `<p>Ici.</p>${choicesHtml("* [] -> END\n* [] -> END")}` }, {}, "Continuer");
    const story = new Compiler(src.ink).Compile();
    while (story.canContinue) story.Continue();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Continuer", "Continuer"]);
  });
});
