// @vitest-environment happy-dom
// Choix d'un roman interactif (lot 2) : bloc ```choix, noms des scènes, graphe, renommage, annulation, places.

import { describe, expect, it } from "vitest";
import {
  choiceGraph,
  choiceLine,
  choiceMapValue,
  choicesAfterUndo,
  choicesHtml,
  choicesIn,
  choicesTextIn,
  editChoice,
  layoutChoiceMap,
  parseChoices,
  readChoiceMap,
  renameTargets,
  resolveTarget,
  sceneSlugs,
  serializeChoices,
  slugOf,
  withChoices,
} from "../interactive/choices";
import { htmlToMarkdown, markdownToHtml } from "../storage/markdown";

describe("lignes d'un bloc", () => {
  it("choix, condition, fin, et lignes gardées telles quelles", () => {
    const text = "* [Pousser la grille] -> la_cour\n\n* { cle_trouvee } [Ouvrir la porte] -> les_cuisines\n* [Rentrer] -> END\n-> la_cour";
    const lines = parseChoices(text);
    expect(lines).toEqual([
      { kind: "choice", label: "Pousser la grille", target: "la_cour" },
      { kind: "choice", label: "Ouvrir la porte", target: "les_cuisines", cond: "cle_trouvee" },
      { kind: "choice", label: "Rentrer", target: "END" },
      { kind: "raw", text: "-> la_cour" },
    ]);
    expect(serializeChoices(lines)).toBe(text.replace("\n\n", "\n"));
  });

  it("un libellé ne garde ni retour ni crochet", () => {
    expect(choiceLine({ label: "Aller [vite]\nau bois", target: "le_bois" })).toBe("* [Aller vite au bois] -> le_bois");
  });
});

describe("noms des scènes", () => {
  it("tirés du titre, uniques, END réservé", () => {
    expect(slugOf("La cour du château")).toBe("la_cour_du_chateau");
    expect(slugOf("L’Église")).toBe("l_eglise");
    expect(slugOf("1942")).toBe("scene_1942");
    expect(slugOf("  ")).toBe("scene");
    const slugs = sceneSlugs([
      { id: "k3x9a7", title: "La cour" },
      { id: "p4t8w2", title: "La cour" },
      { id: "c", title: "End" },
    ]);
    expect([...slugs.values()]).toEqual(["la_cour_k3x9", "la_cour_p4t8", "end"]);
    expect(resolveTarget("la_cour_p4t8", slugs)).toBe("p4t8w2");
    // L'ordre ne change rien : ajouter une scène ailleurs ne renomme personne.
    expect(sceneSlugs([{ id: "z", title: "Le bois" }, { id: "p4t8w2", title: "La cour" }, { id: "k3x9a7", title: "La cour" }]).get("p4t8w2")).toBe("la_cour_p4t8");
    expect(resolveTarget("END", slugs)).toBe("END");
    expect(resolveTarget("nulle_part", slugs)).toBeNull();
  });
});

describe("le bloc dans le texte d'une scène", () => {
  it("ajouté à la fin, remplacé, retiré", () => {
    const one = [{ kind: "choice" as const, label: "A", target: "a" }];
    const html = withChoices("<p>Texte.</p>", one);
    expect(html).toBe(`<p>Texte.</p>${choicesHtml("* [A] -> a")}`);
    expect(choicesIn(html)).toEqual(one);
    const two = withChoices(html, [...one, { kind: "choice", label: "B <et> C", target: "b" }]);
    expect(choicesTextIn(two)).toBe("* [A] -> a\n* [B <et> C] -> b");
    expect(two).toContain("&lt;et&gt;");
    expect(withChoices(two, [])).toBe("<p>Texte.</p>");
    expect(withChoices("<p></p>", one)).toBe(`<p></p>${choicesHtml("* [A] -> a")}`);
    expect(withChoices(withChoices("", one), [])).toBe("");
    expect(withChoices(html, one)).toBe(html);
  });

  it("aller-retour Markdown", () => {
    const html = `<p>La grille est entrouverte.</p>${choicesHtml("* [Pousser la grille] -> la_cour\n* [Rentrer] -> END")}`;
    const md = htmlToMarkdown(html);
    expect(md).toBe("La grille est entrouverte.\n\n```choix\n* [Pousser la grille] -> la_cour\n* [Rentrer] -> END\n```");
    expect(markdownToHtml(md).replace(/>\n</g, "><").trim()).toBe(html);
  });

  it("un autre bloc de code reste du code", () => {
    expect(markdownToHtml("```js\nx\n```")).not.toContain("data-choices");
  });
});

describe("graphe, modification, renommage, annulation", () => {
  const scenes = [
    { id: "s1", title: "La grille" },
    { id: "s2", title: "La cour" },
    { id: "s3", title: "Le village" },
  ];
  const manuscript = {
    s1: withChoices("<p>x</p>", parseChoices("* [Entrer] -> la_cour\n* [Partir] -> le_village\n* [Voler] -> nulle_part")),
    s2: withChoices("", parseChoices("* [Fin] -> END")),
  };

  it("une flèche par choix, destination résolue", () => {
    const g = choiceGraph(manuscript, scenes);
    expect(g.map((e) => [e.from, e.index, e.to])).toEqual([
      ["s1", 0, "s2"],
      ["s1", 1, "s3"],
      ["s1", 2, null],
      ["s2", 0, "END"],
    ]);
  });

  it("modifier ou retirer le choix de rang n", () => {
    const lines = parseChoices("-> a\n* [A] -> a\n  ~ x = 1\n* [B] -> b");
    expect(serializeChoices(editChoice(lines, 1, { label: "Bé", target: "c" }))).toBe("-> a\n* [A] -> a\n  ~ x = 1\n* [Bé] -> c");
    // Retirer un choix retire ses effets avec lui ; une ligne gardée reste.
    expect(serializeChoices(editChoice(lines, 0, null))).toBe("-> a\n* [B] -> b");
  });

  it("un titre changé : les destinations suivent", () => {
    const before = sceneSlugs(scenes);
    const after = sceneSlugs([scenes[0], { id: "s2", title: "La cour d'honneur" }, scenes[2]]);
    const next = renameTargets(manuscript, before, after);
    expect(choicesTextIn(next.s1)).toBe("* [Entrer] -> la_cour_d_honneur\n* [Partir] -> le_village\n* [Voler] -> nulle_part");
    expect(next.s2).toBe(manuscript.s2);
    expect(renameTargets(manuscript, before, before)).toBe(manuscript);
  });

  it("annuler rend les blocs, jamais le texte", () => {
    const edited = { ...manuscript, s1: withChoices("<p>x et plus</p>", []) , s3: choicesHtml("* [A] -> END") };
    const back = choicesAfterUndo(edited, manuscript);
    expect(back.s1).toBe(withChoices("<p>x et plus</p>", choicesIn(manuscript.s1)));
    expect(back.s3).toBeUndefined();
    expect(choicesAfterUndo(manuscript, manuscript)).toBe(manuscript);
  });
});

describe("places sur la carte", () => {
  it("relues avec prudence, écrites arrondies pour les scènes encore là", () => {
    const pos = readChoiceMap({ choiceMap: { pos: { a: [1.4, 2], b: ["x", 1], "../c": [1, 1], d: [Infinity, 0] } } });
    expect(pos).toEqual({ a: { x: 1.4, y: 2 } });
    expect(choiceMapValue({ a: { x: 1.4, y: 2.6 }, z: { x: 0, y: 0 } }, new Set(["a"]))).toEqual({ pos: { a: [1, 3] } });
  });

  it("à droite de la scène d'où part le choix ; les scènes isolées dessous ; les places connues ne bougent pas", () => {
    const edges = [
      { from: "a", index: 0, label: "", target: "", to: "b" },
      { from: "a", index: 1, label: "", target: "", to: "c" },
    ];
    const pos = layoutChoiceMap(["a", "b", "c", "d"], edges, {});
    expect(pos.a).toEqual({ x: 0, y: 0 });
    expect(pos.b).toEqual({ x: 380, y: 0 });
    expect(pos.c).toEqual({ x: 380, y: 200 });
    expect(pos.d.y).toBeGreaterThan(pos.c.y);
    expect(layoutChoiceMap(["a"], [], { a: { x: 9, y: 9 } })).toEqual({ a: { x: 9, y: 9 } });
    // Une scène nouvelle se pose à côté de celle d'où part son choix, même si les autres ont des places à elles.
    const grown = layoutChoiceMap(["a", "b", "c", "e"], [...edges, { from: "c", index: 0, label: "", target: "", to: "e" }], { a: { x: 500, y: 40 }, b: { x: 900, y: 40 }, c: { x: 900, y: 400 } });
    expect(grown.e).toEqual({ x: 1280, y: 400 });
  });
});
