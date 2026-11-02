// @vitest-environment happy-dom
// Import Scrivener, lot 1 (docs/plan-import-scrivener.md) : lecteur RTF, classeur, et projet fabriqué à la façon
// de Scrivener 3 (zippé sur Mac, avec __MACOSX et nom encodé) → chapitres, scènes, synopsis, statuts.

import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { rtfParagraphs, rtfText } from "../import/scrivener/rtf";
import { readBinder, statusOf } from "../import/scrivener/binder";
import { chapterTitle, decodeScrivenerName } from "../import/scrivener/mapping";
import { findScrivx, isScrivenerEntry, readScrivener, readScrivenerZip } from "../import/scrivener";
import { importFromFile } from "../import";

let n = 0;
const newId = () => `id${++n}`;

/** Un RTF tel que l'écrit Scrivener 3 sur Mac (Cocoa, cp1252), autour de lignes de corps déjà en RTF. */
const rtf = (body: string) =>
  `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2761\n\\cocoatextscaling0\\cocoaplatform0{\\fonttbl\\f0\\fnil\\fcharset0 Palatino-Roman;}\n{\\colortbl;\\red255\\green255\\blue255;}\n{\\*\\expandedcolortbl;;}\n\\pard\\tx720\\pardeftab720\\sl264\\slmult1\\fi360\\partightenfactor0\n\n\\f0\\fs26 \\cf0 ${body}}`;

describe("lecteur RTF", () => {
  it("lit accents cp1252, insécables, tirets de dialogue et apostrophes", () => {
    const paras = rtfParagraphs(rtf("\\'97 Tu viens\\'a0? demanda-t-elle. L\\'92\\'e9t\\'e9 \\'e0 Paris.\\\n"));
    expect(paras[0].text).toBe("— Tu viens ? demanda-t-elle. L’été à Paris.");
  });

  it("lit \\uN avec son caractère de repli, et \\uc0", () => {
    expect(rtfText(rtf("\\u8212 \\'97 ok\\\n"))).toBe("— ok");
    expect(rtfParagraphs(rtf("{\\uc0\\u8239 }!\\\n"))[0].html).toBe("\u202f!");
    expect(rtfText(rtf("\\u-3913 ?\\\n"))).toBe(String.fromCharCode(-3913 + 65536));
  });

  it("garde gras, italique et barré, et coupe les paragraphes", () => {
    const paras = rtfParagraphs(rtf("Un {\\b mot} fort, un {\\i autre}.\\\n\\pard Puis {\\strike barr\\'e9}\\i  et\\i0  fin.\\\n"));
    expect(paras[0].html).toBe("Un <strong>mot</strong> fort, un <em>autre</em>.");
    expect(paras[1].html).toBe("Puis <s>barré</s><em> et</em> fin.");
  });

  it("ignore tables, destinations \\* et images, et retire les marqueurs de Scrivener", () => {
    const body = "<$Scr_Ps::0>Texte{\\*\\shppict{\\pict\\pngblip 89504e47}} propre<!$Scr_Ps::0> <$n>.\\\n";
    expect(rtfText(rtf(body))).toBe("Texte propre .");
    expect(rtfParagraphs(rtf("<$Scr_H::1>Intertitre<!$Scr_H::1>\\\n"))[0]).toMatchObject({ text: "Intertitre", heading: true });
  });

  it("garde les lignes vides, échappe le HTML, lit un lien web et ignore un lien interne", () => {
    const paras = rtfParagraphs(rtf("a < b & c\\\n\\\nVoir {\\field{\\*\\fldinst{HYPERLINK \"https://ex.fr/?a=1\"}}{\\fldrslt le site}} et {\\field{\\*\\fldinst{HYPERLINK \"scrivlnk://AB-12\"}}{\\fldrslt la sc\\'e8ne}}.\\\n"));
    expect(paras[0].html).toBe("a &lt; b &amp; c");
    expect(paras[1]).toMatchObject({ text: "", html: "" });
    expect(paras[2].html).toBe('Voir <a href="https://ex.fr/?a=1">le site</a> et la scène.');
  });

  it("lit \\par ordinaire, \\line et les caractères échappés", () => {
    const paras = rtfParagraphs("{\\rtf1\\ansi Un\\line deux \\{x\\}\\par Trois\\par}");
    expect(paras.map((p) => p.text)).toEqual(["Un\ndeux {x}", "Trois"]);
    expect(paras[0].html).toBe("Un<br>deux {x}");
  });
});

const scrivx = (binder: string, extra = "") => `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Template="No" Version="2.0" Identifier="X" Creator="SCRMAC-3.4">
  <Binder>${binder}</Binder>
  <LabelSettings><Title>Label</Title><DefaultLabelID>-1</DefaultLabelID><Labels><Label ID="-1">No Label</Label><Label ID="0" Color="1 0 0">Red</Label></Labels></LabelSettings>
  <StatusSettings><Title>Status</Title><DefaultStatusID>-1</DefaultStatusID><StatusItems><Status ID="-1">No Status</Status><Status ID="0">A faire</Status><Status ID="1">Premier jet</Status><Status ID="2">Version révisée</Status><Status ID="3">Version finale</Status><Status ID="4">Terminé</Status></StatusItems></StatusSettings>
  <Keywords><Keyword ID="0"><Title>Characters</Title><Children><Keyword ID="1"><Title>Ethan</Title></Keyword></Children></Keyword><Keyword ID="2"><Title>Violette</Title></Keyword></Keywords>
  <ProjectTargets Notify="No"><DraftTarget Type="Words" CountIncludedOnly="Yes">80000</DraftTarget></ProjectTargets>
  ${extra}
</ScrivenerProject>`;

const item = (uuid: string, type: string, title: string, meta = "", children = "") =>
  `<BinderItem UUID="${uuid}" Type="${type}" Created="2024-01-01 10:00:00 +0100" Modified="2024-01-01 10:00:00 +0100"><Title>${title}</Title><MetaData>${meta}</MetaData>${children ? `<Children>${children}</Children>` : ""}</BinderItem>`;

describe("classeur", () => {
  it("lit l'arbre, les statuts, les étiquettes, les mots-clés en arbre et l'objectif", () => {
    const b = readBinder(scrivx(item("D", "DraftFolder", "Manuscrit", "", item("A", "Text", "Chapitre 1", "<StatusID>1</StatusID><LabelID>0</LabelID><IncludeInCompile>No</IncludeInCompile>") + `<BinderItem UUID="B" Type="Text"><Title>Deux</Title><Keywords><KeywordID>1</KeywordID><KeywordID>2</KeywordID></Keywords></BinderItem>`)))!;
    expect(b.items[0].type).toBe("DraftFolder");
    expect(b.items[0].children.map((c) => c.title)).toEqual(["Chapitre 1", "Deux"]);
    expect(b.items[0].children[0]).toMatchObject({ statusId: "1", labelId: "0", includeInCompile: false });
    expect(b.items[0].children[1].keywordIds).toEqual(["1", "2"]);
    expect(b.statuses["1"]).toBe("Premier jet");
    expect(b.labels).toEqual({ "0": "Red" });
    expect(b.keywords["1"]).toEqual({ id: "1", title: "Ethan", parentId: "0" });
    expect(b.draftTarget).toBe(80000);
  });

  it("refuse un fichier qui n'est pas un projet Scrivener", () => {
    expect(readBinder("<html></html>")).toBeNull();
    expect(readBinder("pas du xml <<")).toBeNull();
  });

  it("reconnaît les statuts en français et en anglais", () => {
    expect(["To Do", "First Draft", "A faire", "Premier jet"].map(statusOf)).toEqual(["brouillon", "brouillon", "brouillon", "brouillon"]);
    expect(["Revised Draft", "Version révisée"].map(statusOf)).toEqual(["revoir", "revoir"]);
    expect(["Final Draft", "Done", "Version finale", "Terminé"].map(statusOf)).toEqual(["fini", "fini", "fini", "fini"]);
    expect(statusOf("Envoyé à Paul")).toBeNull();
  });
});

describe("titres et noms", () => {
  it("retire la numérotation des titres de chapitre", () => {
    expect(chapterTitle("Chapitre 1 - Le monde ordinaire d'Ethan")).toBe("Le monde ordinaire d'Ethan");
    expect(chapterTitle("Chapter 3")).toBe("");
    expect(chapterTitle("Chapter III: Home")).toBe("Home");
    expect(chapterTitle("12. La fuite")).toBe("La fuite");
    expect(chapterTitle("1984")).toBe("1984");
    expect(chapterTitle("La chute")).toBe("La chute");
  });

  it("décode les noms d'un zip fait sur Mac", () => {
    expect(decodeScrivenerName("Sacr#U00e9 Bonhomme")).toBe("Sacré Bonhomme");
  });
});

// Un projet à la façon de « Sacré Bonhomme » : chapitres en documents de premier niveau, plus un dossier de
// chapitre avec ses scènes (cas du tutoriel), une scène sans texte, la Recherche et la Corbeille à côté.
const binder =
  item(
    "DRAFT",
    "DraftFolder",
    "Manuscrit",
    "",
    item("C1", "Text", "Chapitre 1 - Le monde ordinaire d'Ethan", "<StatusID>4</StatusID>") +
      item("C2", "Text", "Chapitre 2 - La rencontre", "<StatusID>2</StatusID><IncludeInCompile>No</IncludeInCompile>") +
      item("F3", "Folder", "Chapitre 3 - La fuite", "", item("S31", "Text", "Le quai", "<StatusID>1</StatusID>") + item("S32", "Text", "Le train") + item("SUB", "Folder", "Plus tard", "", item("S33", "Text", ""))) +
      item("EP", "Text", "Épilogue"),
  ) +
  item("RES", "ResearchFolder", "Recherche", "", item("R1", "Text", "Notes")) +
  item("TR", "TrashFolder", "Corbeille", "", item("T1", "Text", "Vieux chapitre"));

const project = (prefix: string): Record<string, Uint8Array> => {
  const f: Record<string, string> = {
    [`${prefix}Sacr#U00e9 Bonhomme.scrivx`]: scrivx(binder),
    [`${prefix}Files/version.txt`]: "23",
    [`${prefix}Files/Data/C1/content.rtf`]: rtf("<$Scr_Ps::0>\\'97 Bonjour, dit Ethan.\\\nIl partit.<!$Scr_Ps::0>\\\n\\\n*  *  *\\\n\\\nLe soir tomba.\\\n"),
    [`${prefix}Files/Data/C1/synopsis.txt`]: "Ethan rencontre Violette.\r\n",
    [`${prefix}Files/Data/C2/content.rtf`]: rtf("Elle arriva \\'e0 l\\'92heure.\\\n"),
    [`${prefix}Files/Data/S31/content.rtf`]: rtf("Le quai \\'e9tait vide.\\\n"),
    [`${prefix}Files/Data/S32/content.rtf`]: rtf("Le train partit.\\\n"),
    [`${prefix}Files/Data/S33/synopsis.txt`]: "Une scène encore à écrire.",
    [`${prefix}Files/Data/EP/content.rtf`]: rtf("Fin.\\\n"),
    [`${prefix}Files/Data/R1/content.rtf`]: rtf("Une note.\\\n"),
    [`${prefix}Files/Data/T1/content.rtf`]: rtf("Jeté.\\\n"),
  };
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, strToU8(v)]));
};

describe("projet Scrivener → projet roman", () => {
  it("trouve le .scrivx et ne garde que les fichiers utiles", () => {
    expect(findScrivx(["__MACOSX/x/._a.scrivx", "a.scriv/a.scrivx", "a.scriv/Files/b.scrivx/c.scrivx"])).toBe("a.scriv/a.scrivx");
    expect(isScrivenerEntry("a.scriv/Files/Data/X/content.rtf")).toBe(true);
    expect(isScrivenerEntry("a.scriv/Files/Data/X/synopsis.txt")).toBe(true);
    expect(isScrivenerEntry("a.scriv/Files/search.indexes")).toBe(false);
    expect(isScrivenerEntry("a.scriv/QuickLook/Preview.html")).toBe(false);
    expect(isScrivenerEntry("../a.scriv/Files/Data/X/content.rtf")).toBe(false);
  });

  it("donne les chapitres et les scènes dans l'ordre du classeur, avec titres, synopsis et statuts", () => {
    const read = readScrivener(new Map(Object.entries(project("Sacr#U00e9 Bonhomme.scriv/"))), newId)!;
    const { project: p, report } = read;
    expect(p.meta.title).toBe("Sacré Bonhomme");
    expect(p.meta.kind).toBe("roman");
    const byId = new Map(p.cards.map((c) => [c.id, c]));
    const chapters = p.meta.plan!.chapters!;
    expect(chapters.map((c) => c.title)).toEqual(["Le monde ordinaire d'Ethan", "La rencontre", "La fuite"]);
    // Chapitre 1 : coupé en deux scènes au séparateur ; la première garde titre, synopsis et statut du document.
    const [a, b] = chapters[0].scenes.map((id) => byId.get(id)!);
    expect(a).toMatchObject({ type: "scene", title: "Le monde ordinaire d'Ethan", fiche: { synopsis: "Ethan rencontre Violette.", statut: "fini" } });
    expect(p.manuscript![a.id]).toBe("<p>— Bonjour, dit Ethan.</p><p>Il partit.</p>");
    expect(b.title).toBe("Le soir tomba");
    expect(byId.get(chapters[1].scenes[0])!.fiche).toEqual({ statut: "revoir" });
    // Dossier de chapitre : ses documents à toute profondeur ; une scène sans texte garde son synopsis.
    expect(chapters[2].scenes.map((id) => byId.get(id)!.title)).toEqual(["Le quai", "Le train", "La fuite"]);
    expect(byId.get(chapters[2].scenes[2])!.fiche).toEqual({ synopsis: "Une scène encore à écrire." });
    expect(p.manuscript![chapters[2].scenes[2]]).toBe("");
    // Épilogue d'une scène : une page du livre, hors des chapitres.
    expect(p.cards.find((c) => c.page === "epilogue")).toBeTruthy();
    // Ni la Recherche ni la Corbeille dans le manuscrit (lot 2 pour la Recherche).
    expect(Object.values(p.manuscript!).join(" ")).not.toMatch(/note|Jeté/i);
    expect(p.meta.plan!.beats.libre).toHaveLength(6);
    expect(report).toEqual({ chapters: 4, scenes: 7, excluded: ["Chapitre 2 - La rencontre"] });
  });

  it("refuse un projet sans manuscrit lisible", () => {
    const files = new Map([["a.scrivx", strToU8(scrivx(item("RES", "ResearchFolder", "Recherche")))]]);
    expect(readScrivener(files, newId)).toBeNull();
  });

  it("lit le zip fait sur Mac, et laisse passer un zip qui n'est pas de Scrivener", async () => {
    const zip = zipSync({ ...project("Sacr#U00e9 Bonhomme.scriv/"), "__MACOSX/Sacr#U00e9 Bonhomme.scriv/._Sacr#U00e9 Bonhomme.scrivx": strToU8("x"), "Sacr#U00e9 Bonhomme.scriv/Files/search.indexes": strToU8("y") });
    const read = await readScrivenerZip(zip, newId);
    expect(read && read !== "not-scrivener" && read.project.meta.title).toBe("Sacré Bonhomme");
    const other = zipSync({ "Mon projet/cosmos.json": strToU8("{}") });
    expect(await readScrivenerZip(other, newId)).toBe("not-scrivener");
    expect(await importFromFile({ name: "Mon projet.zip", data: other }, { fileName: "Mon projet.zip", locale: "fr", linkLabel: "", newId })).toBe("project-zip");
    const outcome = await importFromFile({ name: "Sacré Bonhomme.zip", data: zip }, { fileName: "Sacré Bonhomme.zip", locale: "fr", linkLabel: "", newId });
    expect(outcome && outcome !== "project-zip" && outcome.source).toBe("scrivener");
  });
});
