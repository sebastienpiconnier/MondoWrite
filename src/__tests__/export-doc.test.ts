// @vitest-environment happy-dom
// Exports du manuscrit et de la bible : modèle de document, Markdown, Word, EPUB, mise en page du PDF.

import { describe, expect, it } from "vitest";
import { bibleDoc, htmlToBlocks, manuscriptDoc, type ExportDoc } from "../export/doc";
import { chapterXhtml, documentXml, toDocx, toEpub, toMarkdown } from "../export/text";
import { crc32, zip } from "../export/zip";
import { layoutProse, proseGeometry } from "../export/prose";
import { mentionHtml } from "../mentions";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string, html = ""): CardData => ({ id, type, title, html });
const info = { title: "Kerlaouen", author: "Inès Morvan", lang: "fr" };

/** XML bien formé ? (La feuille de style liée est retirée : l'environnement de test irait la chercher.) */
const wellFormed = (text: string) => new DOMParser().parseFromString(text.replace(/<link [^>]*\/>/g, ""), "application/xml").querySelector("parsererror") === null;

/** Lecture d'une archive ZIP sans compression, par son répertoire central (pour vérifier ce qu'on écrit). */
function unzip(data: Uint8Array): { path: string; text: string; offset: number }[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const end = data.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const offset = view.getUint32(at + 42, true);
    const path = decoder.decode(data.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 8, true)).toBe(0); // sans compression
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const content = data.subarray(start, start + size);
    expect(crc32(content)).toBe(crc);
    out.push({ path, text: decoder.decode(content), offset });
    at += 46 + nameLength;
  }
  return out;
}

describe("HTML d'une carte ou d'une scène → blocs", () => {
  it("paragraphes, gras, italique, retour à la ligne", () => {
    expect(htmlToBlocks("<p>Inès <strong>arrive</strong> <em>enfin</em>.<br>Il pleut.</p><p></p><p>Fin.</p>")).toEqual([
      { kind: "paragraph", runs: [{ text: "Inès " }, { text: "arrive", bold: true }, { text: " " }, { text: "enfin", italic: true }, { text: ".\nIl pleut." }] },
      { kind: "paragraph", runs: [{ text: "Fin." }] },
    ]);
  });

  it("titres, listes numérotées ou à puces, citations", () => {
    expect(htmlToBlocks("<h2>Passé</h2><ul><li><p>Un</p></li><li>Deux</li></ul><ol><li>Premier</li></ol><blockquote><p>Dit-elle.</p></blockquote>")).toEqual([
      { kind: "heading", runs: [{ text: "Passé" }] },
      { kind: "paragraph", runs: [{ text: "Un" }], list: "bullet", index: 1 },
      { kind: "paragraph", runs: [{ text: "Deux" }], list: "bullet", index: 2 },
      { kind: "paragraph", runs: [{ text: "Premier" }], list: "number", index: 1 },
      { kind: "paragraph", runs: [{ text: "Dit-elle." }], quote: true },
    ]);
  });

  it("une mention devient le nom de la carte ; rien d'écrit : aucun bloc", () => {
    expect(htmlToBlocks(`<p>Elle remplace ${mentionHtml("p2", "Yann Le Goff")}.</p>`)).toEqual([{ kind: "paragraph", runs: [{ text: "Elle remplace " }, { text: "Yann Le Goff", ref: "p2" }, { text: "." }] }]);
    expect(htmlToBlocks("")).toEqual([]);
    expect(htmlToBlocks("<p></p>")).toEqual([]);
    expect(htmlToBlocks("Texte nu")).toEqual([{ kind: "paragraph", runs: [{ text: "Texte nu" }] }]);
  });
});

describe("documents", () => {
  const cards = [
    card("s1", "scene", "Arrivée"),
    card("s2", "scene", ""),
    card("s3", "scene", "Vide"),
    card("p1", "personnage", "Yann Le Goff", "<p>Ancien gardien.</p>"),
    card("p2", "personnage", "Inès Morvan", "<h2>Passé</h2><p>Gardienne.</p>"),
    card("l1", "lieu", "Phare"),
  ];

  it("manuscrit : les scènes écrites, dans l'ordre reçu, avec leur titre", () => {
    const doc = manuscriptDoc(info, ["s2", "s3", "s1"], cards, { s1: "<p>Elle arrive.</p>", s2: "<p>La lampe.</p>", s3: "<p></p>" }, "Scène sans titre");
    expect(doc.chapters.map((c) => c.title)).toEqual(["Scène sans titre", "Arrivée"]);
    expect(doc).toMatchObject({ title: "Kerlaouen", author: "Inès Morvan", indent: true });
  });

  it("bible : une partie par type, fiches triées, liens en clair, titres de fiche en gras", () => {
    const doc = bibleDoc(info, cards, [{ source: "p2", target: "l1", label: "y travaille" }, { source: "p1", target: "p2", label: "" }], {
      sections: { personnage: "Personnages", lieu: "Lieux", scene: "Scènes", intrigue: "Intrigues", theme: "Thèmes", question: "Questions", image: "Images", lien: "Liens", document: "Documents", idee: "Idées", episode: "Épisodes", groupe: "Groupes", objet: "Objets", evenement: "Événements", regle: "Règles", secret: "Secrets" },
      untitled: "Sans titre",
      linkedTo: "Relié à",
    });
    expect(doc.chapters.map((c) => c.title)).toEqual(["Personnages", "Lieux", "Scènes"]);
    expect(doc.chapters[0].blocks).toEqual([
      { kind: "heading", runs: [{ text: "Inès Morvan" }], anchor: "p2" },
      { kind: "paragraph", runs: [{ text: "Passé", bold: true }] },
      { kind: "paragraph", runs: [{ text: "Gardienne." }] },
      { kind: "paragraph", runs: [{ text: "Relié à : ", italic: true }, { text: "Phare", ref: "l1" }, { text: " (y travaille)" }, { text: ", " }, { text: "Yann Le Goff", ref: "p1" }] },
      { kind: "heading", runs: [{ text: "Yann Le Goff" }], anchor: "p1" },
      { kind: "paragraph", runs: [{ text: "Ancien gardien." }] },
      { kind: "paragraph", runs: [{ text: "Relié à : ", italic: true }, { text: "Inès Morvan", ref: "p2" }] },
    ]);
    expect(doc.chapters[2].blocks.filter((b) => b.kind === "heading").map((b) => b.runs[0].text)).toEqual(["Sans titre", "Arrivée", "Vide"]);
  });
});

const doc: ExportDoc = {
  ...info,
  indent: true,
  chapters: [
    {
      title: "Arrivée & départ",
      blocks: [
        { kind: "paragraph", runs: [{ text: "Inès " }, { text: "arrive", bold: true }, { text: " <enfin>.\nIl pleut." }] },
        { kind: "heading", runs: [{ text: "Le soir" }] },
        { kind: "paragraph", runs: [{ text: "Un" }], list: "bullet", index: 1 },
        { kind: "paragraph", runs: [{ text: "Deux" }], list: "number", index: 2 },
        { kind: "paragraph", runs: [{ text: "Dit-elle.", italic: true }], quote: true },
      ],
    },
    { title: "La lampe", blocks: [{ kind: "paragraph", runs: [{ text: "Elle s’allume *seule*." }] }] },
  ],
};

describe("Markdown", () => {
  it("un seul fichier lisible : titre, auteur, scènes, mise en forme", () => {
    expect(toMarkdown(doc)).toBe(
      "# Kerlaouen\n\nInès Morvan\n\n## Arrivée & départ\n\nInès **arrive** <enfin>.  \nIl pleut.\n\n### Le soir\n\n- Un\n2. Deux\n\n> *Dit-elle.*\n\n## La lampe\n\nElle s’allume \\*seule\\*.\n",
    );
  });
});

describe("Word (.docx)", () => {
  it("document.xml : titres, gras, retours à la ligne, texte échappé", () => {
    const xml = documentXml(doc);
    expect(xml).toContain('<w:pStyle w:val="Title"/></w:pPr><w:r><w:t xml:space="preserve">Kerlaouen</w:t></w:r>');
    expect(xml).toContain('<w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">Arrivée &amp; départ</w:t></w:r>');
    expect(xml).toContain('<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">arrive</w:t></w:r>');
    expect(xml).toContain('<w:t xml:space="preserve"> &lt;enfin&gt;.</w:t><w:br/><w:t xml:space="preserve">Il pleut.</w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">• </w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">2. </w:t>');
    expect(xml).toContain('<w:pStyle w:val="Quote"/>');
    // XML bien formé.
    expect(wellFormed(xml)).toBe(true);
  });

  it("archive : les parties attendues par Word, intactes", () => {
    const files = unzip(toDocx(doc));
    expect(files.map((f) => f.path)).toEqual(["[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml"]);
    expect(files[3].text).toBe(documentXml(doc));
    expect(files[4].text).toContain('w:lang w:val="fr"');
    for (const f of files) expect(wellFormed(f.text)).toBe(true);
  });
});

describe("EPUB", () => {
  const meta = { id: "urn:uuid:00000000-0000-4000-8000-000000000000", modified: "2026-10-08T12:00:00Z", contents: "Sommaire" };

  it("« mimetype » en premier, sans compression, puis le livre", () => {
    const data = toEpub(doc, meta);
    const files = unzip(data);
    expect(files[0]).toMatchObject({ path: "mimetype", text: "application/epub+zip", offset: 0 });
    // Les liseuses lisent le type aux octets 30 à 58.
    expect(new TextDecoder().decode(data.subarray(30, 58))).toBe("mimetypeapplication/epub+zip");
    expect(files.map((f) => f.path)).toEqual([
      "mimetype", "META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/style.css", "OEBPS/cover.xhtml", "OEBPS/ch1.xhtml", "OEBPS/ch2.xhtml",
    ]);
  });

  it("métadonnées, sommaire et chapitres", () => {
    const files = Object.fromEntries(unzip(toEpub(doc, meta)).map((f) => [f.path, f.text]));
    expect(files["OEBPS/content.opf"]).toContain("<dc:title>Kerlaouen</dc:title>");
    expect(files["OEBPS/content.opf"]).toContain("<dc:creator>Inès Morvan</dc:creator>");
    expect(files["OEBPS/content.opf"]).toContain('<itemref idref="cover"/>\n<itemref idref="ch1"/>\n<itemref idref="ch2"/>');
    expect(files["OEBPS/nav.xhtml"]).toContain('<li><a href="ch1.xhtml">Arrivée &amp; départ</a></li>');
    expect(files["OEBPS/ch1.xhtml"]).toContain("<h1>Arrivée &amp; départ</h1>");
    for (const [path, text] of Object.entries(files)) {
      if (path.endsWith(".xhtml") || path.endsWith(".opf") || path.endsWith(".xml")) {
        expect(wellFormed(text)).toBe(true);
      }
    }
  });

  it("corps d'un chapitre : listes et citations balisées", () => {
    expect(chapterXhtml(doc.chapters[0].blocks)).toBe(
      "<p>Inès <strong>arrive</strong> &lt;enfin&gt;.<br/>Il pleut.</p>\n<h2>Le soir</h2>\n<ul>\n<li>Un</li>\n</ul>\n<ol>\n<li>Deux</li>\n</ol>\n<blockquote><p><em>Dit-elle.</em></p></blockquote>",
    );
  });

  it("sans auteur : pas de créateur déclaré", () => {
    const files = unzip(toEpub({ ...doc, author: "" }, meta));
    expect(files.find((f) => f.path.endsWith("content.opf"))!.text).not.toContain("dc:creator");
  });
});

describe("archive ZIP", () => {
  it("somme de contrôle connue, noms en UTF-8, même contenu : même fichier", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const a = zip([{ path: "été/é.txt", data: "Inès" }, { path: "b.bin", data: new Uint8Array([0, 255]) }]);
    expect(unzip(a).map((f) => f.path)).toEqual(["été/é.txt", "b.bin"]);
    expect(unzip(a)[0].text).toBe("Inès");
    expect(zip([{ path: "été/é.txt", data: "Inès" }, { path: "b.bin", data: new Uint8Array([0, 255]) }])).toEqual(a);
    expect(unzip(zip([]))).toEqual([]);
  });
});

describe("mise en page du PDF", () => {
  const geometry = { cols: 30, rows: 20 };
  const text = (page: ReturnType<typeof layoutProse>[number]) => page.lines.map((l) => `${l.row}:${" ".repeat(l.segments[0]?.col ?? 0)}${l.segments.map((s) => s.text).join("|")}`);

  it("géométrie : marges d'un pouce en Courier 12", () => {
    expect(proseGeometry(595.28, 841.89)).toEqual({ cols: 62, rows: 58 });
    expect(proseGeometry(612, 792)).toEqual({ cols: 65, rows: 54 });
  });

  it("page de titre à part, sans numéro ; le texte commence page 1", () => {
    const pages = layoutProse({ ...info, chapters: [{ title: "Un", blocks: [{ kind: "paragraph", runs: [{ text: "Texte." }] }] }], indent: true }, geometry);
    expect(pages).toHaveLength(2);
    expect(pages[0].number).toBeUndefined();
    expect(text(pages[0])).toEqual(["6:          KERLAOUEN", "10:         Inès Morvan"]);
    expect(pages[1].number).toBe(1);
  });

  it("manuscrit : titre centré en gras, alinéa, double interligne, italique souligné", () => {
    const pages = layoutProse(
      { ...info, indent: true, chapters: [{ title: "Arrivée", blocks: [{ kind: "paragraph", runs: [{ text: "Inès descend du bateau et " }, { text: "regarde", italic: true }, { text: " le phare." }] }] }] },
      geometry,
    );
    expect(text(pages[1])).toEqual(["0:           Arrivée", "2:     Inès descend du bateau et", "4:regarde|le phare."]);
    expect(pages[1].lines[0].segments[0].bold).toBe(true);
    expect(pages[1].lines[2].segments).toEqual([{ col: 0, text: "regarde", underline: true }, { col: 8, text: "le phare." }]);
  });

  it("aucune ligne ne dépasse la largeur ni la hauteur ; un mot trop long est coupé", () => {
    const long = Array.from({ length: 60 }, (_, i) => `mot${i}`).join(" ") + " " + "x".repeat(70);
    const pages = layoutProse({ ...info, indent: true, chapters: [{ title: "Long", blocks: [{ kind: "paragraph", runs: [{ text: long }] }] }] }, geometry);
    expect(pages.length).toBeGreaterThan(2);
    for (const page of pages) {
      for (const line of page.lines) {
        expect(line.row).toBeLessThan(geometry.rows);
        const last = line.segments[line.segments.length - 1];
        expect(last.col + last.text.length).toBeLessThanOrEqual(geometry.cols);
      }
    }
    const all = pages.slice(1).flatMap((p) => p.lines.flatMap((l) => l.segments.map((s) => s.text))).join(" ");
    expect(all.replace(/ /g, "")).toBe(("Long" + long).replace(/ /g, ""));
  });

  it("un titre ne reste pas seul en bas de page", () => {
    const filler = { kind: "paragraph" as const, runs: [{ text: "Ligne." }] };
    const pages = layoutProse(
      { ...info, indent: true, chapters: [{ title: "Un", blocks: Array.from({ length: 8 }, () => filler) }, { title: "Deux", blocks: [filler] }] },
      geometry,
    );
    // Page 1 : le titre et huit lignes (rangs 0 à 16). Le titre suivant passerait au rang 20 : nouvelle page.
    expect(pages[2].lines[0].segments[0].text).toBe("Deux");
    expect(pages[2].lines[0].row).toBe(0);
  });

  it("bible : interligne simple, ligne vide entre les paragraphes, listes en retrait", () => {
    const pages = layoutProse(
      { ...info, chapters: [{ title: "Personnages", blocks: [{ kind: "heading", runs: [{ text: "Inès" }] }, { kind: "paragraph", runs: [{ text: "Gardienne." }] }, { kind: "paragraph", runs: [{ text: "Aime le silence du phare la nuit." }], list: "bullet", index: 1 }] }] },
      geometry,
    );
    expect(text(pages[1])).toEqual(["0:         Personnages", "4:Inès", "6:Gardienne.", "8:  • Aime le silence du phare", "9:    la nuit."]);
  });
});

describe("bible composée et images (recette d'octobre)", () => {
  const strings = { sections: { personnage: "Personnages", lieu: "Lieux", idee: "Idées" } as never, untitled: "Sans titre", linkedTo: "Relié à" };
  const cards: CardData[] = [
    { ...card("p", "personnage", "Inès"), image: "p.jpg", images: ["p.jpg", "p2.jpg", "../x.jpg"] },
    card("l", "lieu", "Le phare", "<p>Blanc.</p>"),
    card("i", "idee", "Une idée"),
  ];

  it("suit les rubriques de la Bible (ordre, rubriques masquées) et cite les images de chaque fiche", () => {
    const doc = bibleDoc(info, cards, [], strings, {}, ["lieu", "personnage"]);
    expect(doc.chapters.map((c) => c.title)).toEqual(["Lieux", "Personnages"]);
    // Image principale puis photos, sans doublon ni nom suspect.
    expect(doc.chapters[1].blocks.filter((b) => b.kind === "image")).toEqual([
      { kind: "image", name: "p.jpg" },
      { kind: "image", name: "p2.jpg" },
    ]);
  });

  it("Markdown cite medias/, Word intègre l'image, le PDF lui réserve sa place", () => {
    const doc: ExportDoc = {
      ...bibleDoc(info, cards, [], strings, {}, ["personnage"]),
      images: { "p.jpg": { data: new Uint8Array([0xff, 0xd8, 0xff]), width: 400, height: 200 } },
    };
    expect(toMarkdown(doc)).toContain("![](medias/p.jpg)");
    const xmlText = documentXml(doc);
    expect(wellFormed(xmlText)).toBe(true);
    expect(xmlText).toContain('r:embed="rImg1"');
    // 3 pouces de large au plus : 216 points, soit 2 743 200 EMU, et la moitié en hauteur.
    expect(xmlText).toContain('cx="2743200" cy="1371600"');
    const files = unzip(toDocx(doc)).map((f) => f.path);
    expect(files).toContain("word/media/image1.jpeg");
    // Une image absente de `images` (p2.jpg) est ignorée sans erreur.
    expect(xmlText.match(/<w:drawing>/g)).toHaveLength(1);
    const pages = layoutProse(doc, proseGeometry(612, 792));
    const placed = pages.flatMap((p) => p.images ?? []);
    expect(placed).toEqual([expect.objectContaining({ name: "p.jpg", width: 216, height: 108 })]);
  });
});

describe("chapitres déplacés (recette d'octobre)", () => {
  it("un chapitre entier passe avant un autre, ou à la fin ; ses scènes prennent la case de leur voisine", async () => {
    const { moveChapter, chapterStep, planOrder } = await import("../plan");
    const plan = {
      template: "libre" as const,
      beats: { libre: ["a", "b", "c", "d", "e"] },
      chapters: [
        { id: "c1", title: "", scenes: ["a", "b"] },
        { id: "c2", title: "", scenes: ["c"] },
        { id: "c3", title: "", scenes: ["d", "e"] },
      ],
    };
    const ids = ["a", "b", "c", "d", "e"];
    expect(planOrder(moveChapter(plan, ids, "c3", "a"), ids)).toEqual(["d", "e", "a", "b", "c"]);
    expect(planOrder(moveChapter(plan, ids, "c1", null), ids)).toEqual(["c", "d", "e", "a", "b"]);
    expect(moveChapter(plan, ids, "c1", "a")).toBe(plan);
    expect(moveChapter(plan, ids, "c2", "d")).toBe(plan); // déjà juste avant
    expect(chapterStep(plan, ids, "c1", "up")).toBeUndefined();
    expect(chapterStep(plan, ids, "c1", "down")).toBe("d");
    expect(chapterStep(plan, ids, "c2", "down")).toBeNull();
    // Avec un gabarit : le chapitre passe dans la case de sa nouvelle voisine.
    const acts = { ...plan, template: "troisActes" as const, beats: { a_setup: ["a", "b"], a_confrontation: ["c"], a_resolution: ["d", "e"] } };
    const moved = moveChapter(acts, ids, "c1", "d");
    expect(planOrder(moved, ids)).toEqual(["c", "a", "b", "d", "e"]);
    expect(moved.beats.a_confrontation).toEqual(["c", "a", "b"]);
  });
});

describe("manuscrit au format Shunn", () => {
  const geometry = { cols: 40, rows: 30 };
  const shunn = { running: "Morvan / KERLAOUEN", words: "environ 80 000 mots", byline: "par Inès Morvan" };
  const doc = (): ExportDoc => ({
    ...info,
    indent: true,
    shunn,
    contact: ["Inès Morvan", "ines@exemple.fr"],
    chapters: [
      { title: "Chapitre 1", blocks: [{ kind: "paragraph", runs: [{ text: "Un." }] }, { kind: "paragraph", runs: [{ text: "* * *" }] }, { kind: "paragraph", runs: [{ text: "Deux." }] }] },
      { title: "Chapitre 2", blocks: [{ kind: "paragraph", runs: [{ text: "Trois." }] }] },
    ],
  });

  it("mots arrondis à la centaine, puis au millier", async () => {
    const { roundWords } = await import("../export/prose");
    expect(roundWords(12)).toBe(100);
    expect(roundWords(4349)).toBe(4300);
    expect(roundWords(81499)).toBe(81000);
  });

  it("page de garde : coordonnées à gauche, mots à droite, titre au milieu et « par Untel »", () => {
    const [cover] = layoutProse(doc(), geometry);
    const row0 = cover.lines.filter((l) => l.row === 0).flatMap((l) => l.segments);
    expect(row0.map((s) => s.text)).toEqual(["Inès Morvan", "environ 80 000 mots"]);
    expect(row0[1].col + row0[1].text.length).toBe(40);
    const title = cover.lines.find((l) => l.segments.some((s) => s.text === "KERLAOUEN"))!;
    expect(title.row).toBe(14);
    expect(cover.lines.some((l) => l.segments.some((s) => s.text === "par Inès Morvan"))).toBe(true);
  });

  it("chaque chapitre au tiers d'une nouvelle page, « # » entre deux scènes, un signet par chapitre", () => {
    const pages = layoutProse(doc(), geometry);
    expect(pages).toHaveLength(3);
    expect(pages[1].marks).toEqual(["Chapitre 1"]);
    expect(pages[2].marks).toEqual(["Chapitre 2"]);
    const heading = pages[1].lines.find((l) => l.segments.some((s) => s.text === "Chapitre 1"))!;
    expect(heading.row).toBeGreaterThanOrEqual(10);
    expect(pages[1].lines.some((l) => l.segments.some((s) => s.text === "#"))).toBe(true);
    expect(pages[1].lines.some((l) => l.segments.some((s) => s.text === "* * *"))).toBe(false);
  });
});
