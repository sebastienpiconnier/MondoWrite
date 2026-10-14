// @vitest-environment happy-dom
// Import depuis l'accueil : un manuscrit (.docx, .md, .txt) devient un projet roman (chapitres, scènes,
// texte dans le manuscrit), un scénario Final Draft (.fdx) un projet scénario comme un Fountain.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { bookToProject, chapterize, inlineMarkdown, isSceneBreak, sceneTitle, textParagraphs } from "../import/manuscript";
import { docxParagraph, docxParagraphs, readDocx } from "../import/docx";
import { parseFdx } from "../screenplay/fdxImport";
import { looksLikeScreenplay, projectFromFile } from "../import";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN, planOrder } from "../plan";
import { storage } from "../storage";
import { planScenes } from "../projectState";

let n = 0;
const newId = () => `id${++n}`;
const options = { fileName: "Le phare.md", locale: "fr", linkLabel: "se passe à", newId };
const file = (name: string, text: string) => ({ name, data: strToU8(text) });

const novel = `Le phare

par Inès Morvan

# Chapitre 1 : La relève

Elle arrive au phare à la nuit tombée. Le vent **hurle**.

La porte grince.

* * *

Le lendemain, le *calme*.

## Chapitre 2

Yann n'est pas venu.

Épilogue

Des années plus tard, la lampe tourne encore.
`;

describe("manuscrit en texte (fonctions pures)", () => {
  it("gras, italique, séparateurs, titres de carte", () => {
    expect(inlineMarkdown("un **mot** et un *autre* et _un dernier_ < 3")).toBe("un <strong>mot</strong> et un <em>autre</em> et <em>un dernier</em> &lt; 3");
    expect(["***", "* * *", "#", "⁂", "---"].every(isSceneBreak)).toBe(true);
    expect(isSceneBreak("Il dit *non*")).toBe(false);
    expect(sceneTitle("<p>« Elle arrive au phare à la nuit tombée. » Puis rien.</p>")).toBe("Elle arrive au phare à la…");
  });

  it("chapitres (titres, « Chapitre N »), scènes, titre et auteur en tête, épilogue", () => {
    const book = chapterize(textParagraphs(novel, "md"), "Le phare.md");
    expect(book.title).toBe("Le phare");
    expect(book.author).toBe("Inès Morvan");
    expect(book.chapters.map((c) => [c.title, c.role, c.scenes.length])).toEqual([
      ["La relève", null, 2],
      ["", null, 1],
      ["", "epilogue", 1],
    ]);
    expect(book.chapters[0].scenes[0][0]).toContain("<strong>hurle</strong>");
  });

  it("des numéros seuls, en série, font des chapitres ; un seul ne compte pas", () => {
    const ladder = chapterize(textParagraphs("1\n\nUn début.\n\n2\n\nLa suite.", "md"));
    expect(ladder.chapters.length).toBe(2);
    const single = chapterize(textParagraphs("Sept.\n\nIl compta sept vagues.", "md"));
    expect(single.chapters.length).toBe(1);
  });

  it("un .txt à un paragraphe par ligne", () => {
    const paras = textParagraphs("Ligne un.\nLigne deux.\nLigne trois.\nLigne quatre.\nLigne cinq.", "txt");
    expect(paras.length).toBe(5);
  });

  it("le projet : cartes Scène, manuscrit, chapitres du plan, épilogue en page du livre", () => {
    const project = bookToProject(chapterize(textParagraphs(novel, "md"), "Le phare.md"), { fileName: "Le phare.md", newId });
    expect(project.meta.title).toBe("Le phare");
    expect(project.cards.length).toBe(4);
    const epilogue = project.cards.find((c) => c.page === "epilogue")!;
    expect(project.manuscript![epilogue.id]).toContain("la lampe tourne encore");
    expect(project.meta.plan!.chapters!.map((c) => c.scenes.length)).toEqual([2, 1]);
    expect(project.meta.plan!.beats.libre).not.toContain(epilogue.id);
  });
});

describe("Word (.docx)", () => {
  const styles = `<w:styles><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:rPr><w:b/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Titre"><w:name w:val="Title"/></w:style></w:styles>`;
  const p = (body: string, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${body}</w:p>`;
  const r = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  const document = `<w:document><w:body>${[
    p(r("Le phare"), "Titre"),
    p(r("Chapitre 1"), "Titre1"),
    p(r("Elle arrive. ") + r("Seule", "<w:i/>") + r(" &amp; sans bruit.")),
    p(r("***")),
    p(r("Le matin.") + `<w:r><w:br/></w:r>` + r("Deuxième ligne.")),
    p(`<w:r><w:br w:type="page"/></w:r>` + r("Un autre chapitre.")),
  ].join("")}</w:body></w:document>`;

  it("titres par le nom du style (quelle que soit la langue de Word), italique, entités, retours à la ligne", () => {
    const paras = docxParagraphs(document, styles);
    expect(paras[0]).toMatchObject({ text: "Le phare", title: true });
    expect(paras[1]).toMatchObject({ text: "Chapitre 1", heading: true, html: "Chapitre 1" });
    expect(paras[2].html).toBe("Elle arrive. <em>Seule</em> &amp; sans bruit.");
    expect(paras.filter((x) => x.text === "Deuxième ligne.").length).toBe(1);
    expect(docxParagraph(p(`<w:r><w:br w:type="page"/></w:r>` + r("x")))[0].pageBreak).toBe(true);
  });

  it("de l'archive au projet", async () => {
    const data = zipSync({ "word/document.xml": strToU8(document), "word/styles.xml": strToU8(styles), "[Content_Types].xml": strToU8("<Types/>") });
    expect((await readDocx(data))!.length).toBeGreaterThan(4);
    expect(await readDocx(strToU8("pas un zip"))).toBeNull();
    const project = (await projectFromFile({ name: "phare.docx", data }, options))!;
    expect(project.meta).toMatchObject({ title: "Le phare", kind: "roman" });
    expect(project.meta.plan!.chapters!.length).toBe(2);
    expect(project.cards.length).toBe(3);
  });
});

describe("Final Draft (.fdx)", () => {
  const fdx = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Version="1">
  <Content>
    <Paragraph Type="Scene Heading" Number="1"><Text>INT. PHARE - NUIT</Text></Paragraph>
    <Paragraph Type="Action"><Text>Inès monte </Text><Text Style="Bold">vite</Text><Text>.</Text></Paragraph>
    <Paragraph><DualDialogue>
      <Paragraph Type="Character"><Text>INÈS</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>Qui est là ?</Text></Paragraph>
      <Paragraph Type="Character"><Text>YANN</Text></Paragraph>
      <Paragraph Type="Dialogue"><Text>Moi.</Text></Paragraph>
    </DualDialogue></Paragraph>
    <Paragraph Type="Transition"><Text>COUPE À :</Text></Paragraph>
    <Paragraph Type="Shot"><Text>GROS PLAN SUR LA LAMPE</Text></Paragraph>
  </Content>
  <TitlePage><Content>
    <Paragraph Alignment="Center"><Text>Le phare</Text></Paragraph>
    <Paragraph Alignment="Center"><Text>Écrit par</Text></Paragraph>
    <Paragraph Alignment="Center"><Text>Inès Morvan</Text></Paragraph>
    <Paragraph><Text>ines@example.com</Text></Paragraph>
  </Content></TitlePage>
</FinalDraft>`;

  it("éléments, dialogue simultané, page de titre", () => {
    const sp = parseFdx(fdx)!;
    expect(sp.elements.map((el) => el.type)).toEqual(["sceneHeading", "action", "character", "dialogue", "character", "dialogue", "transition", "action"]);
    expect(sp.elements[0]).toMatchObject({ text: "INT. PHARE - NUIT", sceneNumber: "1" });
    expect(sp.elements[1].text).toBe("Inès monte vite.");
    expect(sp.elements[4]).toMatchObject({ text: "YANN", dual: true });
    expect(sp.titlePage).toEqual({ Title: "Le phare", Credit: "Écrit par", Author: "Inès Morvan", Contact: "ines@example.com" });
    expect(parseFdx("<html/>")).toBeNull();
  });

  it("devient un projet scénario, comme un Fountain", async () => {
    const project = (await projectFromFile(file("phare.fdx", fdx), options))!;
    expect(project.meta.kind).toBe("scenario");
    expect(project.cards.map((c) => c.type).sort()).toEqual(["lieu", "personnage", "personnage", "scene"]);
  });

  it("un .txt avec des en-têtes de scène est lu comme un Fountain", () => {
    expect(looksLikeScreenplay("INT. PHARE - NUIT\n\nAction.\n\nEXT. FALAISE - JOUR\n\nVent.")).toBe(true);
    expect(looksLikeScreenplay(novel)).toBe(false);
  });
});

describe("depuis l'accueil", () => {
  const state = () => useCosmos.getState();
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useSettings.setState({ lang: "en" });
  });

  it("un manuscrit Markdown ouvre un projet roman, dans l'ordre, enregistré", async () => {
    vi.spyOn(storage, "pickFile").mockResolvedValue(file("Le phare.md", novel));
    await state().importFile();
    expect(state()).toMatchObject({ screen: "project", kind: "roman", title: "Le phare", view: "manuscrit" });
    const order = planOrder(state().plan, planScenes(state().nodes));
    expect(order.length).toBe(3);
    expect(state().manuscript[order[0]]).toContain("Elle arrive au phare");
    expect(state().status).toBe("enregistre");
  });

  it("un fichier vide : un message, aucun projet", async () => {
    vi.spyOn(storage, "pickFile").mockResolvedValue(file("vide.md", "\n\n"));
    await state().importFile();
    expect(state()).toMatchObject({ screen: "home", importNotice: "empty" });
  });
});
