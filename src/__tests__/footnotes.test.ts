// @vitest-environment happy-dom
// Notes de bas de page (1.13.0, docs/plan-notes.md) : fichier du manuscrit (`[^n]` et définitions), nettoyage,
// numérotation du livre, exports (Markdown, Word avec de vraies notes, EPUB, notes en fin de chapitre des PDF).

import { describe, expect, it } from "vitest";
import { cleanNote, footnoteHtml, readFootnotes, takeFootnotes, putFootnotes } from "../footnotes";
import { htmlToMarkdown, markdownToHtml } from "../storage/markdown";
import { endnotes, footnotesOf, htmlToBlocks, manuscriptDoc, numberFootnotes, runsText } from "../export/doc";
import { chapterXhtml, footnotesXml, toDocx, toMarkdown } from "../export/text";
import { layoutProse } from "../export/prose";
import { strFromU8, unzipSync } from "fflate";
import type { CardData } from "../types";

const scene = 'Le réveil sonne<sup data-footnote="Six heures, &quot;pile&quot; &amp; tôt."></sup> et Ethan<sup data-footnote="Ethan Morvan."></sup> rêve.';

describe("sur disque : [^n] et définitions", () => {
  it("aller-retour exact, guillemets et esperluettes compris", () => {
    const md = htmlToMarkdown(`<p>${scene}</p><p>Suite.</p>`);
    expect(md).toBe('Le réveil sonne[^1] et Ethan[^2] rêve.\n\nSuite.\n\n[^1]: Six heures, "pile" & tôt.\n[^2]: Ethan Morvan.');
    const html = markdownToHtml(md);
    expect(html).toContain('<sup data-footnote="Six heures, &quot;pile&quot; &amp; tôt."></sup>');
    expect(html).not.toContain("[^");
    expect(htmlToMarkdown(html)).toBe(md);
  });

  it("un appel sans définition reste du texte ; une note piégée est nettoyée", () => {
    expect(readFootnotes("Rien[^x] ici.")).toBe("Rien[^x] ici.");
    expect(markdownToHtml('A<sup data-footnote="note" onclick="x" class="y">contenu</sup>')).toContain('<sup data-footnote="note"></sup>');
    expect(markdownToHtml("A<sup>2</sup>")).not.toContain("<sup");
    expect(cleanNote("  a\n  b ")).toBe("a b");
    expect(cleanNote("x".repeat(5000)).length).toBe(2000);
  });

  it("sans note, rien ne change", () => {
    expect(takeFootnotes("<p>a</p>")).toEqual({ html: "<p>a</p>", notes: [] });
    expect(putFootnotes("a", [])).toBe("a");
    expect(footnoteHtml("x < y")).toBe('<sup data-footnote="x &lt; y"></sup>');
  });
});

const cards: CardData[] = [
  { id: "s1", type: "scene", title: "Un", html: "" },
  { id: "s2", type: "scene", title: "Deux", html: "" },
];
const doc = manuscriptDoc({ title: "Livre", author: "", lang: "fr", notesTitle: "Notes" }, ["s1", "s2"], cards, { s1: `<p>${scene}</p>`, s2: '<p>Plus loin<sup data-footnote="Troisième."></sup>.</p>' }, "Sans titre");

describe("export", () => {
  it("numérotées dans l'ordre du livre, sans revenir à 1", () => {
    expect(doc.chapters.map((c) => footnotesOf(c.blocks).map((x) => x.n))).toEqual([["1", "2"], ["3"]]);
    expect(numberFootnotes([{ blocks: htmlToBlocks("<p>a</p>") }])[0].blocks[0]).toEqual({ kind: "paragraph", runs: [{ text: "a" }] });
  });

  it("Markdown : appels et définitions en fin de chapitre", () => {
    const md = toMarkdown(doc);
    expect(md).toContain("Le réveil sonne[^1] et Ethan[^2] rêve.");
    expect(md).toContain('[^1]: Six heures, "pile" & tôt.\n[^2]: Ethan Morvan.');
    expect(md).toContain("[^3]: Troisième.");
  });

  it("Word : de vraies notes de bas de page", () => {
    const files = unzipSync(toDocx(doc));
    const document = strFromU8(files["word/document.xml"]);
    expect(document).toContain('<w:footnoteReference w:id="2"/>');
    expect(document).toContain('<w:footnoteReference w:id="4"/>');
    const notes = strFromU8(files["word/footnotes.xml"]);
    expect(notes).toContain('w:type="separator" w:id="0"');
    expect(notes).toContain("Six heures, &quot;pile&quot; &amp; tôt.");
    expect(strFromU8(files["[Content_Types].xml"])).toContain("/word/footnotes.xml");
    expect(strFromU8(files["word/_rels/document.xml.rels"])).toContain('Target="footnotes.xml"');
    expect(footnotesXml({ ...doc, chapters: [{ title: "x", blocks: htmlToBlocks("<p>a</p>") }] })).toBeNull();
  });

  it("EPUB : appel lié à sa note, notes en fin de chapitre", () => {
    const xhtml = chapterXhtml(doc.chapters[0].blocks);
    expect(xhtml).toContain('<sup><a epub:type="noteref" id="ref-1" href="#fn-1">1</a></sup>');
    expect(xhtml).toContain('<aside epub:type="footnote" id="fn-2"><p><a href="#ref-2">2.</a> Ethan Morvan.</p></aside>');
  });

  it("PDF : « [n] » dans le texte, les notes sous « Notes » à la fin du chapitre", () => {
    const blocks = endnotes(doc.chapters[0].blocks, "Notes");
    expect(runsText(blocks[0].kind === "image" ? [] : blocks[0].runs)).toBe("Le réveil sonne[1] et Ethan[2] rêve.");
    expect(blocks.slice(1).map((b) => (b.kind === "image" ? "" : runsText(b.runs)))).toEqual(["Notes", '1. Six heures, "pile" & tôt.', "2. Ethan Morvan."]);
    const pages = layoutProse(doc, { cols: 60, rows: 25 });
    const text = pages.flatMap((p) => p.lines.flatMap((l) => l.segments.map((s) => s.text))).join(" ");
    expect(text).toContain("[1]");
    expect(text).toContain("Ethan Morvan.");
  });
});
