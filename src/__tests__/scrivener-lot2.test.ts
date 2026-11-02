// @vitest-environment happy-dom
// Import Scrivener, lot 2 (docs/plan-import-scrivener.md) : Bible (fiches « Sketch »), Recherche (PDF, image,
// page web), autres dossiers en cadres, mots-clés en cartes reliées, étiquette renommée en point de vue,
// signets et liens internes en fils, commentaires et notes de bas de page (inspecteur et en ligne), intertitres,
// images du texte, notes des documents, rapport et choix des dossiers.

import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { readSketch } from "../import/scrivener/sketch";
import { readInspectorNotes } from "../import/scrivener/comments";
import { rtfDocument } from "../import/scrivener/rtf";
import { buildScrivener, readScrivenerSource, scrivenerFolders } from "../import/scrivener";
import { folderKind } from "../import/scrivener/mapping";
import { readBinder } from "../import/scrivener/binder";
import type { ImportedPara } from "../import/manuscript";
import type { CardData } from "../types";

let n = 0;
const newId = () => `id${String(++n).padStart(6, "0")}`;
const rtf = (body: string) => `{\\rtf1\\ansi\\ansicpg1252{\\fonttbl\\f0\\fnil Palatino;}\\pard\\f0\\fs26 ${body}}`;
const para = (text: string): ImportedPara => ({ html: text, text });

describe("fiches de modèle", () => {
  it("lit une fiche de personnage remplie, en anglais ou en français", () => {
    const s = readSketch([para("Character Name: Inès"), para("Role in Story: Héroïne"), para("Occupation:"), para("Gardienne de phare"), para("Habits/Mannerisms: Siffle"), para("Background:")], "personnage");
    expect(s.title).toBe("Inès");
    expect(s.fiche).toEqual({ role: "Héroïne", metier: "Gardienne de phare" });
    expect(s.body.join("")).toBe("<p><strong>Habits/Mannerisms</strong></p><p>Siffle</p>");
    expect(s.empty).toBe(false);
    const fr = readSketch([para("Rôle dans l’histoire : Mentor"), para("Conflits internes : La peur de la mer")], "personnage");
    expect(fr.fiche).toEqual({ role: "Mentor", blessure: "La peur de la mer" });
  });

  it("reconnaît une fiche jamais remplie, et une fiche de lieu", () => {
    expect(readSketch([para("Character Name:"), para("Role in Story:"), para("Occupation:")], "personnage").empty).toBe(true);
    const place = readSketch([para("Location Name: Le phare"), para("Role in Story: Le refuge"), para("Sights:"), para("La lanterne"), para("Description:"), para("Tour blanche.")], "lieu");
    expect(place.fiche).toEqual({ importance: "Le refuge", ambiance: "La lanterne" });
    expect(place.body.join("")).toContain("Tour blanche.");
  });

  it("devine la nature d'un dossier à son titre", () => {
    const item = (title: string, type = "Folder") => ({ uuid: "X", type, title, labelId: null, statusId: null, includeInCompile: true, keywordIds: [], bookmarks: [], url: null, children: [] });
    expect(folderKind(item("Personnages"))).toBe("personnage");
    expect(folderKind(item("Characters"))).toBe("personnage");
    expect(folderKind(item("Lieux"))).toBe("lieu");
    expect(folderKind(item("Places"))).toBe("lieu");
    expect(folderKind(item("Recherche", "ResearchFolder"))).toBe("research");
    expect(folderKind(item("Notes"))).toBe("other");
  });
});

describe("texte : commentaires, notes, images", () => {
  it("lit un commentaire de l'inspecteur et une note de bas de page", () => {
    const notes = readInspectorNotes(`<?xml version="1.0"?><Comments><Comment ID="c1" Color="1 1 0">{\\rtf1\\ansi Trop t\\'f4t ?}</Comment><Comment ID="f1" Footnote="Yes">{\\rtf1\\ansi Source : INSEE.}</Comment></Comments>`);
    expect(notes.get("c1")).toEqual({ id: "c1", text: "Trop tôt ?", footnote: false });
    expect(notes.get("f1")?.footnote).toBe(true);
    expect(readInspectorNotes("pas du xml").size).toBe(0);
  });

  it("garde les repères du passage commenté, du lien interne, des notes en ligne et les images", () => {
    const doc = rtfDocument(
      rtf(
        `Il {\\field{\\*\\fldinst{HYPERLINK "scrivcmt://c1"}}{\\fldrslt partit}} vers {\\field{\\*\\fldinst{HYPERLINK "scrivlnk://AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"}}{\\fldrslt Paris}}.{\\Scrv_fn=\\text=Note en ligne.\\end_Scrv_fn}\\\n` +
          `Suite{\\Scrv_annot \\color={\\R=1\\G=0\\B=0} \\text=Revoir ce passage\\end_Scrv_annot}.\\\n` +
          `{{\\*\\shppict{\\pict\\pngblip\\picw10\\pich10 89504e470d0a1a0a00000000}}{\\nonshppict{\\pict\\wmetafile8 0102}}}\\\n`,
      ),
    );
    expect(doc.paras[0].html).toBe('Il <span data-scrivcmt="c1">partit</span> vers <span data-scrivlnk="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE">Paris</span>.0');
    expect(doc.inline).toEqual([
      { kind: "footnote", text: "Note en ligne." },
      { kind: "annotation", text: "Revoir ce passage" },
    ]);
    expect(doc.paras[1].text).toBe("Suite1.");
    expect(doc.images).toHaveLength(1);
    expect(doc.images[0].ext).toBe("png");
    expect([...doc.images[0].data.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("lit les signets et l'adresse d'une page archivée", () => {
    const b = readBinder(
      `<ScrivenerProject Version="2.0"><Binder><BinderItem UUID="11111111-2222-3333-4444-555555555555" Type="Text"><Title>A</Title><Bookmarks><Bookmark Target="x-scrivener-item:///aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" Title="B"/></Bookmarks></BinderItem><BinderItem UUID="w" Type="WebArchive"><Title>Le Monde</Title><MetaData><URL>https://lemonde.fr/article</URL></MetaData></BinderItem></Binder></ScrivenerProject>`,
    )!;
    expect(b.items[0].bookmarks).toEqual(["AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"]);
    expect(b.items[1].url).toBe("https://lemonde.fr/article");
  });
});

// ---- Un projet complet, à la façon du tutoriel de Scrivener -------------------------------------------------------

// Identifiant du classeur à la façon de Scrivener (hexadécimal) tiré d'un nom court.
const U = (k: string) => `${[...k].map((c) => c.charCodeAt(0).toString(16)).join("").padEnd(8, "0").slice(0, 8)}-0000-0000-0000-000000000000`.toUpperCase();
const item = (uuid: string, type: string, title: string, inner = "", children = "") =>
  `<BinderItem UUID="${U(uuid)}" Type="${type}"><Title>${title}</Title>${inner}${children ? `<Children>${children}</Children>` : ""}</BinderItem>`;
const meta = (m: string) => `<MetaData>${m}</MetaData>`;
const kws = (...ids: string[]) => `<Keywords>${ids.map((i) => `<KeywordID>${i}</KeywordID>`).join("")}</Keywords>`;

const binder =
  item(
    "draft",
    "DraftFolder",
    "Manuscrit",
    "",
    item("c1", "Text", "Chapitre 1 - Le départ", meta("<LabelID>0</LabelID><StatusID>9</StatusID>") + kws("1", "3", "4")) +
      item("c2", "Text", "Chapitre 2 - Paris", meta("<LabelID>1</LabelID>") + `<Bookmarks><Bookmark UUID="${U("pdf")}"/></Bookmarks>`),
  ) +
  item("chars", "Folder", "Personnages", "", item("ch1", "Text", "Ethan") + item("ch2", "Text", "Character Sketch")) +
  item("places", "Folder", "Lieux", "", item("pl1", "Text", "Paris")) +
  item("res", "ResearchFolder", "Recherche", "", item("pdf", "PDF", "Plan de Paris") + item("img", "Image", "Gare de Lyon") + item("web", "WebArchive", "Wikipédia", meta("<URL>https://fr.wikipedia.org/wiki/Paris</URL>")) + item("wav", "Media", "Ambiance")) +
  item("notes", "Folder", "Notes", "", item("n1", "Text", "Idée de fin")) +
  item("trash", "TrashFolder", "Corbeille", "", item("t1", "Text", "Jeté"));

const scrivx = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>${binder}</Binder>
  <LabelSettings><Title>POV</Title><Labels><Label ID="-1">Aucun</Label><Label ID="0">Violette</Label><Label ID="1">Ethan</Label></Labels></LabelSettings>
  <StatusSettings><StatusItems><Status ID="9">Envoyé à Lise</Status></StatusItems></StatusSettings>
  <Keywords><Keyword ID="0"><Title>Characters</Title><Children><Keyword ID="1"><Title>Ethan</Title></Keyword></Children></Keyword><Keyword ID="2"><Title>Lieux</Title><Children><Keyword ID="3"><Title>Gare</Title></Keyword></Children></Keyword><Keyword ID="4"><Title>Amour</Title></Keyword></Keywords>
  <ProjectTargets><DraftTarget Type="Words">90000</DraftTarget></ProjectTargets>
</ScrivenerProject>`;

const data = (uuid: string, file: string) => `Projet.scriv/Files/Data/${U(uuid)}/${file}`;
const files = new Map<string, Uint8Array>(
  Object.entries({
    "Projet.scriv/Projet.scrivx": scrivx,
    [data("c1", "content.rtf")]: rtf(`<$Scr_H::1>Le d\\'e9part<!$Scr_H::1>\\\nEthan {\\field{\\*\\fldinst{HYPERLINK "scrivcmt://c1"}}{\\fldrslt quitta}} la gare.{\\Scrv_fn=\\text=En 1998.\\end_Scrv_fn}\\\n`),
    [data("c1", "content.comments")]: `<Comments><Comment ID="c1">{\\rtf1\\ansi Pourquoi si t\\'f4t ?}</Comment></Comments>`,
    [data("c1", "notes.rtf")]: rtf("Le d\\'e9part d'Ethan.\\\n"),
    [data("c2", "content.rtf")]: rtf(`Paris{\\Scrv_annot \\color={\\R=1} \\text=V\\'e9rifier le trajet\\end_Scrv_annot}, enfin. Voir {\\field{\\*\\fldinst{HYPERLINK "scrivlnk://${U("ch1")}"}}{\\fldrslt Ethan}}.\\\n{{\\*\\shppict{\\pict\\pngblip 89504e470d0a1a0a00000000}}}\\\n`),
    [data("c2", "notes.rtf")]: rtf("Premi\\'e8re id\\'e9e.\\\nDeuxi\\'e8me id\\'e9e.\\\n"),
    [data("ch1", "content.rtf")]: rtf("Character Name: Ethan\\\nRole in Story: H\\'e9ros\\\nOccupation: Boulanger\\\nBackground:\\\nN\\'e9 \\'e0 Lyon.\\\n"),
    [data("ch1", "synopsis.txt")]: "Le boulanger qui part.",
    [data("ch2", "content.rtf")]: rtf("Character Name:\\\nRole in Story:\\\nOccupation:\\\n"),
    [data("pl1", "content.rtf")]: rtf("Location Name: Paris\\\nRole in Story: La ville r\\'eav\\'e9e\\\n"),
    [data("pdf", "content.pdf")]: "%PDF-1.4 fake",
    [data("img", "content.png")]: "PNGDATA",
    [data("n1", "content.rtf")]: rtf("Ils se retrouvent sur le quai.\\\n"),
    [data("t1", "content.rtf")]: rtf("Jet\\'e9.\\\n"),
  }).map(([k, v]) => [k, strToU8(v)]),
);

describe("projet complet → projet roman avec sa Bible et son canevas", () => {
  const source = readScrivenerSource(files)!;
  const built = buildScrivener(source, { newId, now: "2026-11-02T10:00:00.000Z" })!;
  const { project, medias, report } = built;
  const byTitle = (title: string, type?: string) => project.cards.find((c) => c.title === title && (!type || c.type === type)) as CardData;
  const linkedTo = (a: string) =>
    project.meta.links
      .filter((l) => l.source === a || l.target === a)
      .map((l) => (l.source === a ? l.target : l.source))
      .map((id) => project.cards.find((c) => c.id === id)!.title)
      .sort();
  const [s1, s2] = project.meta.plan!.chapters!.map((c) => c.scenes[0]);

  it("propose les dossiers de premier niveau, sans le Manuscrit ni la Corbeille", () => {
    expect(scrivenerFolders(source.binder).map((f) => [f.title, f.count])).toEqual([
      ["Personnages", 2],
      ["Lieux", 1],
      ["Recherche", 4],
      ["Notes", 1],
    ]);
  });

  it("met les personnages et les lieux dans la Bible, avec leur fiche, sans les fiches vides", () => {
    const ethan = byTitle("Ethan", "personnage");
    expect(ethan.fiche).toEqual({ role: "Héros", metier: "Boulanger", accroche: "Le boulanger qui part." });
    expect(ethan.html).toContain("Né à Lyon.");
    expect(project.cards.filter((c) => c.title === "Character Sketch")).toHaveLength(0);
    expect(byTitle("Paris", "lieu").fiche).toEqual({ importance: "La ville rêvée" });
    expect(report).toMatchObject({ characters: 1, places: 1, emptySketches: 1 });
  });

  it("fait des cartes Document, Image et Lien de la Recherche, et cite ce qu'il ne garde pas", () => {
    const pdf = byTitle("Plan de Paris", "document");
    expect(pdf.fichier).toMatch(/^id\d+\.pdf$/);
    const img = byTitle("Gare de Lyon", "image");
    expect(img.image).toMatch(/^id\d+\.png$/);
    expect(byTitle("Wikipédia", "lien").fiche).toEqual({ url: "https://fr.wikipedia.org/wiki/Paris" });
    expect(medias.map(([name]) => name)).toEqual(expect.arrayContaining([pdf.fichier, img.image]));
    expect(report.unsupported).toEqual(["Ambiance"]);
    expect(report.trash).toBe(1);
  });

  it("range les autres dossiers en cadres, à droite du récit", () => {
    const titles = project.meta.frames!.map((f) => f.title);
    expect(titles).toEqual(expect.arrayContaining(["Personnages", "Lieux", "Recherche", "Notes", "Mots-clés", "Notes des scènes", "Images du texte"]));
    const sceneX = Math.max(...project.meta.layout.filter((l) => l.id === s1 || l.id === s2).map((l) => l.x));
    for (const f of project.meta.frames!) expect(f.x).toBeGreaterThan(sceneX);
    expect(byTitle("Idée de fin", "idee").html).toBe("<p>Ils se retrouvent sur le quai.</p>");
  });

  it("relie les mots-clés, en retrouvant le personnage existant et en créant les autres", () => {
    expect(linkedTo(s1)).toEqual(expect.arrayContaining(["Amour", "Ethan", "Gare"]));
    expect(byTitle("Gare").type).toBe("lieu");
    expect(byTitle("Amour").type).toBe("idee");
    expect(project.cards.filter((c) => c.title === "Ethan")).toHaveLength(1);
  });

  it("fait de l'étiquette « POV » le point de vue des scènes", () => {
    const violette = byTitle("Violette", "personnage");
    const ethan = byTitle("Ethan", "personnage");
    expect(project.cards.find((c) => c.id === s1)!.fiche?.pov).toBe(violette.id);
    expect(project.cards.find((c) => c.id === s2)!.fiche?.pov).toBe(ethan.id);
  });

  it("tire des fils pour les signets et les liens internes", () => {
    expect(linkedTo(s2)).toEqual(expect.arrayContaining(["Plan de Paris", "Ethan"]));
  });

  it("garde commentaires et notes à leur place, retire l'intertitre qui répète le titre", () => {
    const html = project.manuscript![s1];
    expect(html).not.toContain("<h3>");
    expect(html).toMatch(/^<p>Ethan <span data-comment="(id\d+)">quitta<\/span> la gare\.<sup data-footnote="En 1998\."><\/sup><\/p>$/);
    const cid = html.match(/data-comment="(id\d+)"/)![1];
    expect(project.comments![s1]).toEqual([{ id: cid, date: "2026-11-02T10:00:00.000Z", text: "Pourquoi si tôt ?", quote: "quitta" }]);
    // Une annotation en ligne : un commentaire sur son paragraphe, et le texte n'en garde rien.
    const html2 = project.manuscript![s2];
    expect(html2).toMatch(/^<p><span data-comment="id\d+">Paris, enfin\. Voir Ethan\.<\/span><\/p>$/);
    expect(project.comments![s2][0]).toMatchObject({ text: "Vérifier le trajet", quote: "Paris, enfin. Voir Ethan." });
    expect(report).toMatchObject({ comments: 2, footnotes: 1 });
  });

  it("met une note d'une ligne dans le synopsis, une plus longue dans une carte reliée, les images du texte à part", () => {
    expect(project.cards.find((c) => c.id === s1)!.fiche?.synopsis).toBe("Le départ d'Ethan.");
    const notes = project.cards.find((c) => c.type === "idee" && c.title.startsWith("Notes"))!;
    expect(notes.html).toBe("<p>Première idée.</p><p>Deuxième idée.</p>");
    expect(linkedTo(notes.id)).toEqual(["Paris"]);
    expect(linkedTo(s2)).toContain("Paris");
    expect(project.cards.filter((c) => c.type === "image")).toHaveLength(2);
  });

  it("dit ce qui n'a pas été repris, et reprend l'objectif du livre", () => {
    expect(report.statuses).toEqual([{ label: "Envoyé à Lise", count: 1 }]);
    expect(project.meta.goals).toEqual({ total: 90000 });
  });

  it("laisse de côté les dossiers décochés", () => {
    const res = source.binder.items.find((i) => i.title === "Recherche")!;
    const without = buildScrivener(source, { newId, exclude: new Set([res.uuid]) })!;
    expect(without.project.cards.some((c) => c.title === "Plan de Paris")).toBe(false);
    expect(without.report.skippedFolders).toEqual(["Recherche"]);
  });
});
