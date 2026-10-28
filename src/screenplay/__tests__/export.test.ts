// @vitest-environment happy-dom
// Exports du scénario : composition en pages, PDF, FDX, Fountain.

import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ScreenplayElement } from "../model";
import { LAYOUTS } from "../layout";
import { paginate } from "../paginate";
import { parse } from "../parse";
import { exportScreenplay, fileName } from "../export";
import { buildFdx } from "../export/fdx";
import { buildPdf } from "../export/pdf";
import { hasContd, printable, resumedCues, typeset, typesetTitlePage } from "../export/typeset";
import courtFr from "./fixtures/court-fr.fountain?raw";
import torture from "./fixtures/torture.fountain?raw";

const letter = LAYOUTS.letter;
const a4 = LAYOUTS.a4;
const strings = { more: "(À SUIVRE)", contd: "(SUITE)" };
const options = { title: "Le Phare des Absents", paper: "letter" as const, locale: "fr", strings };
const action = (text: string): ScreenplayElement => ({ type: "action", text });
const block = (n: number) => action(Array.from({ length: n }, () => "x").join("\n"));
const REFERENCE_PAGES = { letter: [84, 82], a4: [75, 75] };
const lf = (text: string) => text.replace(/\r\n?/g, "\n");

describe("composition en pages", () => {
  it("fixture française : une page, chaque élément à sa colonne", () => {
    const pages = typeset(parse(courtFr).elements, letter, "fr", strings);
    expect(pages).toHaveLength(1);
    const lines = pages[0].lines;
    expect(lines[0]).toEqual({ row: 0, column: 0, text: "INT. PHARE, LANTERNE - NUIT", bold: true });
    // Une ligne vide, puis l'action sur trois lignes de 60 caractères au plus.
    expect(lines[1]).toMatchObject({ row: 2, column: 0 });
    expect(lines.slice(1, 4).every((l) => l.text.length <= 60)).toBe(true);
    const at = (text: string) => lines.find((l) => l.text === text);
    expect(at("INÈS")).toMatchObject({ row: 6, column: 22 });
    expect(at("(à voix basse)")).toMatchObject({ row: 7, column: 16 });
    expect(lines.find((l) => l.text.startsWith("Le 13 octobre"))).toMatchObject({ row: 8, column: 10 });
    // Transition alignée à droite : elle finit à la colonne 60.
    const transition = at("COUPE À :")!;
    expect(transition.column + transition.text.length).toBe(60);
    // Même nombre de lignes que l'estimation : 29.
    expect(Math.max(...lines.map((l) => l.row)) + 1).toBe(29);
  });

  it("fixture française : même nombre de pages que l'estimation", () => {
    const { elements } = parse(courtFr);
    for (const layout of [letter, a4]) {
      expect(typeset(elements, layout, "fr", strings).length, layout.paper).toBe(paginate(elements, layout).pages);
    }
  });

  it("long métrage : l'estimation reste à moins de 5 % de la pagination réelle (Letter et A4)", () => {
    const scene = parse(courtFr).elements;
    const long = Array.from({ length: 150 }, () => scene).flat();
    const measured: Record<string, [number, number]> = {};
    for (const layout of [letter, a4]) {
      const real = typeset(long, layout, "fr", strings).length;
      const estimated = paginate(long, layout).pages;
      measured[layout.paper] = [real, estimated];
      expect(Math.abs(real - estimated) / real, layout.paper).toBeLessThan(0.05);
    }
    // Valeurs de référence [réel, estimé] : l'écart vient des répliques coupées, (À SUIVRE) et (SUITE).
    expect(measured).toEqual(REFERENCE_PAGES);
  });

  it("jamais plus de lignes que la page n'en contient", () => {
    const scene = parse(courtFr).elements;
    const long = Array.from({ length: 40 }, () => scene).flat();
    for (const page of typeset(long, a4, "fr", strings)) {
      expect(Math.max(...page.lines.map((l) => l.row))).toBeLessThan(a4.linesPerPage);
    }
  });

  it("un en-tête de scène ne termine jamais une page", () => {
    const heading: ScreenplayElement = { type: "sceneHeading", text: "int. phare - nuit", sceneNumber: "12A" };
    const pages = typeset([block(52), heading, action("Texte.")], letter, "fr", strings);
    expect(pages).toHaveLength(2);
    // Mis en majuscules, en gras, avec son numéro dans les deux marges.
    expect(pages[1].lines).toEqual([
      { row: 0, column: -5, text: "12A", bold: true },
      { row: 0, column: 62, text: "12A", bold: true },
      { row: 0, column: 0, text: "INT. PHARE - NUIT", bold: true },
      { row: 2, column: 0, text: "Texte." },
    ]);
  });

  it("réplique coupée : (À SUIVRE) en bas, le nom et (SUITE) en haut de la page suivante", () => {
    const speech: ScreenplayElement[] = [
      { type: "character", text: "Hugo" },
      { type: "dialogue", text: Array.from({ length: 10 }, (_, i) => `Ligne ${i + 1}.`).join("\n") },
    ];
    const pages = typeset([block(48), ...speech], letter, "fr", strings);
    expect(pages).toHaveLength(2);
    const first = pages[0].lines;
    // 48 lignes, une vide, HUGO (ligne 49), quatre lignes de réplique, puis (À SUIVRE) sur la dernière.
    expect(first[48]).toEqual({ row: 49, column: 22, text: "HUGO" });
    expect(first[first.length - 2]).toEqual({ row: 53, column: 10, text: "Ligne 4." });
    expect(first[first.length - 1]).toEqual({ row: 54, column: 22, text: "(À SUIVRE)" });
    expect(pages[1].lines[0]).toEqual({ row: 0, column: 22, text: "HUGO (SUITE)" });
    expect(pages[1].lines.map((l) => l.text).slice(1)).toEqual(["Ligne 5.", "Ligne 6.", "Ligne 7.", "Ligne 8.", "Ligne 9.", "Ligne 10."]);
  });

  it("(À SUIVRE) et (SUITE) décochés : la réplique coupée garde son nom en haut, sans mention", () => {
    const speech: ScreenplayElement[] = [
      { type: "character", text: "Hugo" },
      { type: "dialogue", text: Array.from({ length: 10 }, (_, i) => `Ligne ${i + 1}.`).join("\n") },
    ];
    const pages = typeset([block(48), ...speech], letter, "fr", strings, { breaks: false });
    const all = pages.flatMap((p) => p.lines.map((l) => l.text));
    expect(all).not.toContain("(À SUIVRE)");
    expect(pages[1].lines[0]).toEqual({ row: 0, column: 22, text: "HUGO" });
  });

  it("un personnage qui reprend après une action dans la même scène : (SUITE) après son nom", () => {
    const els: ScreenplayElement[] = [
      { type: "sceneHeading", text: "INT. PHARE - NUIT" },
      { type: "character", text: "INÈS" },
      { type: "dialogue", text: "Tu entends ?" },
      { type: "action", text: "Le vent." },
      { type: "character", text: "INÈS" },
      { type: "dialogue", text: "Encore." },
      { type: "character", text: "YANN" },
      { type: "dialogue", text: "Rien." },
      { type: "character", text: "INÈS (SUITE)" },
      { type: "dialogue", text: "Déjà écrit." },
      { type: "sceneHeading", text: "EXT. CÔTE - NUIT" },
      { type: "character", text: "YANN" },
      { type: "dialogue", text: "Viens." },
    ];
    expect([...resumedCues(els)]).toEqual([4]);
    const names = (o: Parameters<typeof typeset>[4]) => typeset(els, letter, "fr", strings, o).flatMap((p) => p.lines.filter((l) => l.column === 22).map((l) => l.text));
    expect(names({})).toEqual(["INÈS", "INÈS", "YANN", "INÈS (SUITE)", "YANN"]);
    expect(names({ resumes: true })).toEqual(["INÈS", "INÈS (SUITE)", "YANN", "INÈS (SUITE)", "YANN"]);
    expect(hasContd("HUGO (CONT'D)", "(SUITE)")).toBe(true);
  });

  it("pas la place de commencer une réplique : elle passe entière à la page suivante", () => {
    const pages = typeset([block(52), { type: "character", text: "HUGO" }, { type: "dialogue", text: "Un.\nDeux.\nTrois." }], letter, "fr", strings);
    expect(pages[1].lines.map((l) => l.text)).toEqual(["HUGO", "Un.", "Deux.", "Trois."]);
    expect(pages[0].lines.some((l) => l.text === "(À SUIVRE)")).toBe(false);
  });

  it("fichier torture : notes, sections et texte mis de côté ne s'impriment pas", () => {
    const pages = typeset(parse(torture).elements, letter, "fr", strings);
    const text = pages.flatMap((p) => p.lines.map((l) => l.text)).join("\n");
    expect(pages).toHaveLength(2); // le saut de page
    expect(text).not.toMatch(/Vérifier l’heure|Scène coupée|Acte I\b|rien ne se perd|trop sec|\[\[/);
    expect(text).toContain("On t’écoute.");
    expect(text).toContain("FIN DE L’ACTE I");
    expect(text).toContain("MCAVOY");
    expect(pages[1].lines[0]).toMatchObject({ row: 0, text: "EXT. QUAI - NUIT" });
  });

  it("texte imprimable", () => {
    expect(printable("On t’écoute. [[trop sec ?]]")).toBe("On t’écoute.");
    expect(printable("Avant /* coupé */ après.")).toBe("Avant après.");
    expect(printable("[[seulement une note]]")).toBe("");
  });

  it("page de titre : titre et auteur centrés, contact et date en bas à gauche", () => {
    const lines = typesetTitlePage(parse(torture).titlePage, letter);
    expect(lines[0]).toEqual({ row: 18, column: 26, text: "TORTURE", bold: true });
    expect(lines.find((l) => l.text === "Zoé N’Guyen")).toMatchObject({ column: Math.floor((60 - 11) / 2) });
    expect(lines.slice(-2)).toEqual([
      { row: 53, column: 0, text: "12 rue de l’Été" },
      { row: 54, column: 0, text: "29200 Brest" },
    ]);
    expect(typesetTitlePage({}, letter)).toEqual([]);
  });
});

describe("PDF", () => {
  it("fixture française : une page de titre et une page de texte, en Letter", async () => {
    const bytes = await buildPdf(parse(courtFr), { layout: letter, locale: "fr", strings });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(pdf.getTitle()).toBe("Le Phare des Absents");
    expect(pdf.getCreator()).toBe("MondoWrite");
  });

  it("A4, sans page de titre ; scénario vide : une feuille blanche", async () => {
    const pdf = await PDFDocument.load(await buildPdf({ titlePage: {}, elements: parse(courtFr).elements }, { layout: a4, locale: "fr", strings }));
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    const empty = await PDFDocument.load(await buildPdf({ titlePage: {}, elements: [] }, { layout: a4, locale: "fr", strings }));
    expect(empty.getPageCount()).toBe(1);
  });

  it("long métrage : autant de pages que la composition, plus la page de titre", async () => {
    const screenplay = parse(courtFr);
    const elements = Array.from({ length: 150 }, () => screenplay.elements).flat();
    const pdf = await PDFDocument.load(await buildPdf({ ...screenplay, elements }, { layout: letter, locale: "fr", strings }));
    expect(pdf.getPageCount()).toBe(typeset(elements, letter, "fr", strings).length + 1);
  });
});

describe("FDX (Final Draft)", () => {
  it("un paragraphe par élément, dans l'ordre, avec les types de Final Draft", () => {
    const fdx = buildFdx(parse(courtFr), "fr");
    expect(fdx.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="1">')).toBe(true);
    const types = [...fdx.matchAll(/<Paragraph Type="([^"]+)">/g)].map((m) => m[1]);
    expect(types.slice(0, 6)).toEqual(["Scene Heading", "Action", "Character", "Parenthetical", "Dialogue", "Action"]);
    expect(types).toHaveLength(15);
    expect(fdx).toContain("<Text>INT. PHARE, LANTERNE - NUIT</Text>");
    expect(fdx).not.toContain("cosmos:");
    expect(fdx).toContain("<TitlePage>");
    expect(fdx).toContain("<Text>Le Phare des Absents</Text>");
  });

  it("majuscules, numéro de scène, texte centré, caractères XML échappés", () => {
    const fdx = buildFdx(
      {
        titlePage: {},
        elements: [
          { type: "sceneHeading", text: "int. café « Chez & Fils » - jour", sceneNumber: "12A" },
          { type: "character", text: "zoé" },
          { type: "dialogue", text: "1 < 2, non ?" },
          { type: "centered", text: "FIN" },
          { type: "note", text: "à revoir" },
          { type: "action", text: "" },
        ],
      },
      "fr",
    );
    expect(fdx).toContain('<Paragraph Number="12A" Type="Scene Heading">\n      <Text>INT. CAFÉ « CHEZ &amp; FILS » - JOUR</Text>');
    expect(fdx).toContain("<Text>ZOÉ</Text>");
    expect(fdx).toContain("<Text>1 &lt; 2, non ?</Text>");
    expect(fdx).toContain('<Paragraph Alignment="Center" Type="Action">');
    expect(fdx).not.toContain("à revoir");
    expect(fdx).not.toContain("<TitlePage>");
    expect([...fdx.matchAll(/<Paragraph/g)]).toHaveLength(4);
  });
});

describe("export", () => {
  it("nom de fichier valable partout", () => {
    expect(fileName("Le Phare des Absents", "scenario")).toBe("Le Phare des Absents");
    expect(fileName('  Qui ? Quoi : "Où" / <fin>. ', "scenario")).toBe("Qui Quoi Où fin");
    expect(fileName(" .. ", "scenario")).toBe("scenario");
  });

  it("Fountain : le fichier tel quel s'il n'a pas changé, sinon sa sérialisation", async () => {
    const source = "INT. PHARE - NUIT\n\n\n\nLa lampe.\n";
    const screenplay = parse(source);
    const kept = await exportScreenplay(screenplay, "fountain", { ...options, source });
    expect(kept).toMatchObject({ name: "Le Phare des Absents.fountain", extension: "fountain", mime: "text/plain" });
    expect(new TextDecoder().decode(kept.data)).toBe(source);
    const rewritten = await exportScreenplay(screenplay, "fountain", options);
    expect(new TextDecoder().decode(rewritten.data)).toBe("INT. PHARE - NUIT\n\nLa lampe.\n");
  });

  it("les trois formats de la fixture française s'ouvrent", async () => {
    const screenplay = parse(courtFr);
    const fountain = await exportScreenplay(screenplay, "fountain", options);
    expect(parse(new TextDecoder().decode(fountain.data))).toEqual(screenplay);

    const fdx = await exportScreenplay(screenplay, "fdx", options);
    expect(fdx.name).toBe("Le Phare des Absents.fdx");
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(fdx.data), "application/xml");
    expect(xml.querySelector("parsererror")).toBeNull();
    expect(xml.documentElement.tagName).toBe("FinalDraft");

    const pdf = await exportScreenplay(screenplay, "pdf", { ...options, paper: "a4" });
    expect(pdf).toMatchObject({ name: "Le Phare des Absents.pdf", mime: "application/pdf" });
    expect((await PDFDocument.load(pdf.data)).getPageCount()).toBe(2);
    expect(lf(courtFr)).toContain("INÈS");
  });
});
