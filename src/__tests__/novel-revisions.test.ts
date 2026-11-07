// @vitest-environment happy-dom
// Révisions du roman (#22) : marque dans le texte, Markdown, nettoyage, et marquage à la frappe sur un vrai éditeur.

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { bookRevCounts, clearBookRevMarks, clearRevMarks, isRevNumber, revCounts, revStyle } from "../novelRevisions";
import { htmlToMarkdown, markdownToHtml, sanitizeHtml } from "../storage/markdown";
import { richTextExtensions } from "../components/editorKit";
import { NovelRevisions } from "../components/revMark";

describe("numéros et comptes", () => {
  it("accepte 1 à 99 seulement", () => {
    expect(["1", "9", "10", "99"].every(isRevNumber)).toBe(true);
    expect(["0", "100", "01", "a", "", "1 2", '1"', null, 3].some(isRevNumber)).toBe(false);
  });

  it("compte les passages par passe, dans une scène et dans le livre", () => {
    const html = '<p>a <span data-rev="2">b</span> <span data-rev="2">c</span> <span data-rev="3">d</span></p>';
    expect(revCounts(html)).toEqual(new Map([[2, 2], [3, 1]]));
    expect(bookRevCounts({ x: html, y: '<p><span data-rev="3">e</span></p>' }).get(3)).toBe(2);
    expect(revCounts(undefined).size).toBe(0);
  });

  it("retire les marques sans toucher au texte, même autour d'une autre marque", () => {
    const html = '<p>a <span data-rev="2">b <span data-comment="abcdef123456">c</span> d</span> e</p>';
    expect(clearRevMarks(html)).toBe('<p>a b <span data-comment="abcdef123456">c</span> d e</p>');
    const same = "<p>rien</p>";
    expect(clearRevMarks(same)).toBe(same);
  });

  it("ne rend que les scènes changées", () => {
    expect(clearBookRevMarks({ a: '<p><span data-rev="1">x</span></p>', b: "<p>y</p>" })).toEqual({ a: "<p>x</p>" });
  });

  it("écrit une règle de couleur par passe valide", () => {
    expect(revStyle([1, 2, 2, 0, 500], (n) => `c${n}`)).toBe('.ms-page [data-rev="1"]{--rev:c1}.ms-page [data-rev="2"]{--rev:c2}');
  });
});

describe("Markdown et nettoyage", () => {
  it("garde la marque d'une relecture à l'autre", () => {
    const html = '<p>Elle <span data-rev="2">partit</span> tôt.</p>';
    const md = htmlToMarkdown(html);
    expect(md).toBe('Elle <span data-rev="2">partit</span> tôt.');
    expect(markdownToHtml(md)).toContain('<span data-rev="2">partit</span>');
  });

  it("n'accepte qu'un numéro sûr et aucun autre attribut", () => {
    expect(sanitizeHtml('<p><span data-rev="2" onclick="x()" style="color:red">a</span></p>')).toBe('<p><span data-rev="2">a</span></p>');
    expect(sanitizeHtml('<p><span data-rev="2&quot; onload=&quot;x">a</span></p>')).toBe("<p>a</p>");
    expect(sanitizeHtml('<p><span data-rev="500">a</span></p>')).toBe("<p>a</p>");
  });
});

let editor: Editor;
let pass: number | null = null;
afterEach(() => {
  editor?.destroy();
  pass = null;
});

function open(content: string): Editor {
  const extensions = richTextExtensions({ prose: true }).map((e) => (e.name === "novelRevisions" ? NovelRevisions.configure({ current: () => pass }) : e));
  editor = new Editor({ element: document.createElement("div"), extensions, content });
  return editor;
}
const html = () => editor.getHTML();

describe("marquage à la frappe", () => {
  it("ne marque rien sans passe ouverte", () => {
    open("<p>Elle partit.</p>");
    editor.view.dispatch(editor.state.tr.insertText(" Vite.", editor.state.doc.content.size - 1));
    expect(html()).not.toContain("data-rev");
  });

  it("marque le texte tapé pendant une passe, pas le texte d'avant", () => {
    open("<p>Elle partit.</p>");
    pass = 2;
    editor.view.dispatch(editor.state.tr.insertText(" Vite.", editor.state.doc.content.size - 1));
    expect(html()).toBe('<p>Elle partit.<span data-rev="2" class="rev-mark"> Vite.</span></p>');
  });

  it("la passe suivante remplace la marque de la précédente sur le même texte", () => {
    open('<p>Elle <span data-rev="1">partit</span>.</p>');
    pass = 2;
    // Texte inséré à l'intérieur du passage déjà marqué par la passe 1.
    editor.view.dispatch(editor.state.tr.insertText("XX", 9));
    expect(html()).toContain('<span data-rev="2" class="rev-mark">XX</span>');
    // Le reste du passage garde la passe 1 de chaque côté.
    expect(html()).toContain('<span data-rev="1" class="rev-mark">par</span>');
    expect(html()).toContain('<span data-rev="1" class="rev-mark">tit</span>');
  });

  it("ne marque pas un contenu rechargé", () => {
    open("<p>Un.</p>");
    pass = 3;
    editor.commands.setContent("<p>Tout autre texte.</p>");
    expect(html()).not.toContain("data-rev");
  });

  it("garde le texte sain quand la passe se ferme", () => {
    open("<p>Un.</p>");
    pass = 1;
    editor.view.dispatch(editor.state.tr.insertText(" Deux.", editor.state.doc.content.size - 1));
    pass = null;
    editor.view.dispatch(editor.state.tr.insertText(" Trois.", editor.state.doc.content.size - 1));
    expect(html()).toBe('<p>Un.<span data-rev="1" class="rev-mark"> Deux.</span> Trois.</p>');
  });
});
