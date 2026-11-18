// @vitest-environment happy-dom
// Roman interactif, lot 14 (#94) : bonne fin et mauvaise fin.

import { describe, expect, it } from "vitest";
import { choicesHtml, choicesIn, editChoice, parseChoices, sceneEnding, sceneSlugs, serializeChoices, withEnding } from "../interactive/choices";
import { endingCounts, verifyStory } from "../interactive/verify";
import { sceneMarks, marksKey, readMarksKey } from "../interactive/storyMap";
import { choiceGraph } from "../interactive/choices";
import { gamebookDoc } from "../interactive/gamebook";
import { projectToInk } from "../interactive/ink";
import { fr } from "../i18n/fr";
import type { Run } from "../export/doc";

const scenes = [
  { id: "s1", title: "La grille" },
  { id: "s2", title: "Le puits" },
  { id: "s3", title: "La tour" },
];

describe("types de fin", () => {
  it("lit et écrit #good et #bad sur un choix « Fin » et sur un renvoi seul", () => {
    const lines = parseChoices("* [Sauter] -> END #bad\n* [Monter] -> la_tour #hidden\n-> END #good");
    expect(lines[0]).toMatchObject({ kind: "choice", target: "END", ending: "bad" });
    expect(lines[1]).toMatchObject({ hidden: true });
    expect(lines[1]).not.toHaveProperty("ending");
    expect(serializeChoices(lines)).toBe("* [Sauter] -> END #bad\n* [Monter] -> la_tour #hidden\n-> END #good");
    expect(sceneEnding(lines)).toBe("bad");
    // Une étiquette de fin sur un choix vers une scène n'a pas de sens : elle n'est pas lue.
    expect(parseChoices("* [Monter] -> la_tour #good")[0]).not.toHaveProperty("ending");
  });

  it("garde le type d'une fin quand le bandeau ne le connaît pas, le retire quand le choix change de destination", () => {
    const lines = parseChoices("* [Sauter] -> END #bad");
    expect(editChoice(lines, 0, { label: "Plonger", target: "END" })[0]).toMatchObject({ label: "Plonger", ending: "bad" });
    expect(editChoice(lines, 0, { label: "Plonger", target: "END", ending: undefined })[0]).not.toHaveProperty("ending");
    expect(editChoice(lines, 0, { label: "Plonger", target: "la_tour" })[0]).not.toHaveProperty("ending");
  });

  it("donne un type à une scène qui finit l'histoire, jamais à une autre", () => {
    expect(withEnding([], "bad")).toEqual([{ kind: "raw", text: "-> END #bad" }]);
    const marked = withEnding([{ kind: "raw", text: "-> END #bad" }], null);
    expect(marked).toEqual([{ kind: "raw", text: "-> END" }]);
    const both = parseChoices("* [Rester] -> la_tour\n* [Partir] -> END");
    expect(sceneEnding(withEnding(both, "good"))).toBe("good");
    const passing = parseChoices("* [Rester] -> la_tour");
    expect(withEnding(passing, "good")).toBe(passing);
  });

  it("colore les cartes, compte les fins et signale l'absence de bonne fin", () => {
    const manuscript = {
      s1: `<p>.</p>${choicesHtml("* [Puits] -> le_puits\n* [Tour] -> la_tour")}`,
      s2: `<p>.</p>${choicesHtml("-> END #bad")}`,
      s3: "<p>.</p>",
    };
    const graph = choiceGraph(manuscript, scenes);
    const marks = sceneMarks(scenes, graph, manuscript, []);
    expect(marks.get("s2")).toMatchObject({ ending: true, endKind: "bad", deadEnd: false });
    expect(readMarksKey(marksKey(marks.get("s2")))?.endKind).toBe("bad");
    expect(marks.get("s3")?.endKind).toBeNull();
    expect(endingCounts(scenes, manuscript)).toEqual({ good: 0, bad: 1, neutral: 1 });
    const points = verifyStory(scenes, manuscript);
    expect(points.some((p) => p.rule === "noGoodEnding")).toBe(true);
    // Le renvoi `-> END #bad` est une sortie : la scène n'est pas une « fin sans choix ».
    expect(points.some((p) => p.rule === "implicitEnd" && p.scene === "s2")).toBe(false);
    const fixed = { ...manuscript, s3: `<p>.</p>${choicesHtml("-> END #good")}` };
    expect(verifyStory(scenes, fixed).some((p) => p.rule === "noGoodEnding")).toBe(false);
    // Aucune fin marquée : pas de question.
    expect(verifyStory(scenes, { ...manuscript, s2: "<p>.</p>" }).some((p) => p.rule === "noGoodEnding")).toBe(false);
  });

  it("écrit la phrase de fin du livre-jeu selon son type, et un Ink que le compilateur accepte", async () => {
    const manuscript = {
      s1: `<p>.</p>${choicesHtml("* [Puits] -> le_puits\n* [Sauter] -> END #bad\n* [Tour] -> la_tour")}`,
      s2: `<p>Tu tombes.</p>${choicesHtml("-> END #bad")}`,
      s3: `<p>Tu es libre.</p>${choicesHtml("-> END #good")}`,
    };
    const slugs = sceneSlugs(scenes);
    const { doc, sections } = gamebookDoc({ title: "T", author: "A", lang: "fr", scenes, slugs, manuscript, factLabels: {}, texts: fr.interactive.gamebook });
    const text = (id: string) =>
      doc.chapters[sections.findIndex((s) => s.id === id) + 1].blocks.flatMap((b) => (b.kind === "paragraph" ? [b.runs.map((r: Run) => r.text).join("")] : []));
    expect(text("s1")).toContain("Sauter : votre aventure s’arrête ici.");
    expect(text("s2")).toEqual(["Tu tombes.", "Votre aventure s’arrête ici."]);
    expect(text("s3")).toEqual(["Tu es libre."]);
    const { ink } = projectToInk(scenes, slugs, manuscript);
    expect(ink).not.toMatch(/#(good|bad)/);
    const { Compiler } = await import("inkjs/full");
    const c = new Compiler(ink);
    c.Compile();
    expect(c.errors).toEqual([]);
    expect(choicesIn(manuscript.s1)[1]).toMatchObject({ ending: "bad" });
  });
});
