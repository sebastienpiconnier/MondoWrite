// @vitest-environment happy-dom
// Roman interactif, lot 15 (#95) : parcours de lecture annoté.

import { describe, expect, it } from "vitest";
import { openingWords, pathLine, pathMarkdown, pathNotes } from "../interactive/readingPath";
import { choicesHtml } from "../interactive/choices";
import { markQuoteInHtml } from "../mcpWrite";

const steps = [{ scene: "a" }, { scene: "b", chose: "Descendre", note: "trop facile\nvraiment" }, { scene: "b", chose: "Attendre" }, { scene: "c", chose: "Partir" }];
const numbers = { a: 1, b: 34, c: 112 };

describe("parcours de lecture", () => {
  it("écrit le chemin en numéros du livre-jeu, sans répéter une section où l'on reste", () => {
    expect(pathLine(steps, numbers)).toBe("1 → 34 → 112");
  });

  it("exporte un Markdown lisible avec choix et notes", () => {
    const md = pathMarkdown(steps, numbers, new Map([["a", "La grille"], ["b", "Le puits"]]), { title: "Parcours : Le Puits", choice: "Choix : {choice}", note: "Note : {note}", untitled: "Sans titre" });
    expect(md).toContain("# Parcours : Le Puits\n\n1 → 34 → 112\n");
    expect(md).toContain("2. **34. Le puits**\n   - Choix : Descendre\n   - Note : trop facile vraiment");
    expect(md).toContain("4. **112. Sans titre**");
  });

  it("garde une note par étape notée, et ancre le commentaire sur les premiers mots de la scène", () => {
    expect(pathNotes(steps)).toEqual([{ scene: "b", note: "trop facile\nvraiment" }]);
    const html = `<p>Il fait <em>nuit</em> dans la cour.</p>${choicesHtml("* [Partir] -> END")}`;
    const quote = openingWords(html, 8)!;
    expect(quote).toBe("Il fait");
    expect(markQuoteInHtml(html, quote, "c1")).toMatch(/<span data-comment="c1">Il(\u00a0|&nbsp;)fait<\/span>/);
    expect(openingWords(choicesHtml("* [Partir] -> END"))).toBeNull();
  });
});
