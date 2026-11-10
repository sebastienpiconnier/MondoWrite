// Export en page web (discussion #61) : une page autonome, échappée, avec sommaire, notes et images embarquées.
import { describe, expect, it } from "vitest";
import { toHtml } from "../export/text";
import type { ExportDoc } from "../export/doc";

const doc: ExportDoc = {
  title: "Le phare <1>",
  author: "Inès & Yann",
  contact: ["ines@example.org"],
  lang: "fr",
  chapters: [
    { title: "Un", blocks: [{ kind: "paragraph", runs: [{ text: "Il " }, { text: "pleut", italic: true }, { text: "1", footnote: "Une note." }] }] },
    { title: "Deux", blocks: [{ kind: "image", name: "a.jpg" }, { kind: "paragraph", runs: [{ text: "Fin." }], list: "bullet" }] },
  ],
  images: { "a.jpg": { data: new Uint8Array([255, 216, 255]), width: 10, height: 10 } },
};

describe("export en page web", () => {
  const html = toHtml(doc, { contents: "Sommaire" });
  it("est une page complète, dans la langue du texte, avec le titre échappé", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("<title>Le phare &lt;1&gt;</title>");
    expect(html).toContain("<p>Inès &amp; Yann</p>");
    expect(html).toContain("<p>ines@example.org</p>");
  });
  it("a un sommaire qui mène aux chapitres", () => {
    expect(html).toContain('<a href="#ch-2">Deux</a>');
    expect(html).toContain('<section class="chapter" id="ch-2">');
  });
  it("garde la mise en forme, les notes et embarque les images, sans attribut d'EPUB", () => {
    expect(html).toContain("<em>pleut</em>");
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain("Une note.");
    expect(html).toContain('src="data:image/jpeg;base64,/9j/"');
    expect(html).toContain("<ul>\n<li>Fin.</li>\n</ul>");
    expect(html).not.toContain("epub:type");
  });
  it("n'a pas de sommaire pour un seul chapitre", () => {
    expect(toHtml({ ...doc, chapters: doc.chapters.slice(0, 1) }, { contents: "Sommaire" })).not.toContain("<nav");
  });
});
