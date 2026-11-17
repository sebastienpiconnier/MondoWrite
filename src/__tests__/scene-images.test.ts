// @vitest-environment happy-dom
// Images dans le texte d'une scène (#84, lot 1) : format sur disque, nettoyage, exports.

import { describe, expect, it } from "vitest";
import { cleanAlt, imageMarkdown, manuscriptImages, mediaFromSrc, sceneImagesIn } from "../sceneImages";
import { htmlToMarkdown, markdownToHtml, sanitizeHtml } from "../storage/markdown";
import { htmlToBlocks } from "../export/doc";
import { chapterXhtml } from "../export/text";
import { isBlank } from "../manuscript";

describe("adresse d'une image", () => {
  it("seulement un fichier de medias/", () => {
    expect(mediaFromSrc("../medias/k3x9a7.jpg")).toBe("k3x9a7.jpg");
    expect(mediaFromSrc("medias/k3x9a7.png")).toBe("k3x9a7.png");
    expect(mediaFromSrc("../../../medias/a.webp")).toBe("a.webp");
    expect(mediaFromSrc("k3x9a7.jpg")).toBe("k3x9a7.jpg");
    expect(mediaFromSrc("https://exemple.org/a.jpg")).toBeNull();
    expect(mediaFromSrc("../autre/a.jpg")).toBeNull();
    expect(mediaFromSrc("../medias/../cosmos.json")).toBeNull();
    expect(mediaFromSrc("data:image/png;base64,AAAA")).toBeNull();
    expect(mediaFromSrc("../medias/script.js")).toBeNull();
  });

  it("description sur une ligne, sans crochets", () => {
    expect(cleanAlt("Le phare\n[au] crépuscule ")).toBe("Le phare au crépuscule");
    expect(cleanAlt(42)).toBe("");
  });
});

describe("aller-retour Markdown", () => {
  it("une image dans le texte, avec sa place", () => {
    const html = '<p>Avant.</p><img data-media="k3x9a7.jpg" alt="Le phare" data-place="page"><p>Après.</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('![Le phare](../medias/k3x9a7.jpg "page")');
    expect(md.split("\n").find((l) => l.startsWith("!["))).toBe(imageMarkdown("k3x9a7.jpg", "Le phare", "page"));
    const back = markdownToHtml(md);
    expect(back).toContain('<img data-media="k3x9a7.jpg" alt="Le phare" data-place="page">');
    expect(back).not.toContain("<p><img");
  });

  it("dans le texte : pas de titre Markdown", () => {
    expect(htmlToMarkdown('<img data-media="a.jpg" alt="">')).toBe("![](../medias/a.jpg)");
    expect(markdownToHtml("![](../medias/a.jpg)").trim()).toBe('<img data-media="a.jpg" alt="">');
  });

  it("une image venue d'ailleurs ne passe pas", () => {
    expect(markdownToHtml("![x](https://exemple.org/a.jpg)")).not.toContain("<img");
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe("");
    expect(sanitizeHtml('<img data-media="a.jpg" alt="ok" onerror="alert(1)" src="javascript:x">')).toBe('<img data-media="a.jpg" alt="ok">');
  });
});

describe("une scène faite d'une image", () => {
  it("n'est pas vide et cite son image", () => {
    const html = '<img data-media="a.jpg" alt="">';
    expect(isBlank(html)).toBe(false);
    expect(isBlank("<p></p>")).toBe(true);
    expect(sceneImagesIn(`<p>x</p>${html}${html}<img data-media="b.png" alt="">`)).toEqual(["a.jpg", "b.png"]);
    expect(manuscriptImages({ s1: html, s2: '<img data-media="c.jpg" alt="">' })).toEqual(["a.jpg", "c.jpg"]);
  });
});

describe("exports", () => {
  it("un bloc image avec sa description", () => {
    const blocks = htmlToBlocks('<p>Texte.</p><img data-media="a.jpg" alt="Le phare">');
    expect(blocks[1]).toEqual({ kind: "image", name: "a.jpg", alt: "Le phare" });
  });

  it("garde la place de l'image (pleine page, tête de chapitre) pour le livre broché", () => {
    const blocks = htmlToBlocks('<img data-media="a.jpg" data-place="page"><img data-media="b.jpg" data-place="chapter"><img data-media="c.jpg" data-place="ailleurs">');
    expect(blocks.map((b) => (b.kind === "image" ? b.place : null))).toEqual(["page", "chapter", undefined]);
  });

  it("EPUB et page web : la description devient le texte alternatif", () => {
    const xhtml = chapterXhtml([{ kind: "image", name: "a.jpg", alt: "Le \"phare\"" }], () => "images/img1.jpg");
    expect(xhtml).toContain('<img src="images/img1.jpg" alt="Le &quot;phare&quot;"/>');
  });
});
