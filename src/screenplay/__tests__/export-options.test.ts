// @vitest-environment happy-dom
// Fenêtre « Exporter le scénario en PDF » : texte d'un personnage, synopsis, sections, notes, dialogue
// simultané côte à côte, en-tête et filigrane, réglages gardés dans cosmos.json.

import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { ScreenplayElement } from "../model";
import { LAYOUTS } from "../layout";
import { buildPdf } from "../export/pdf";
import { printable, typeset } from "../export/typeset";
import { cleanScriptPrint, DEFAULT_SCRIPT_PRINT, fillHeader, scriptPrintToMeta } from "../export/scriptPrint";

const a4 = LAYOUTS.a4;
const strings = { more: "(À SUIVRE)", contd: "(SUITE)" };
const el = (type: ScreenplayElement["type"], text: string, extra: Partial<ScreenplayElement> = {}): ScreenplayElement => ({ type, text, ...extra });
const script: ScreenplayElement[] = [
  el("section", "Acte I [[cosmos:beat:a_setup]]"),
  el("sceneHeading", "EXT. BOIS - JOUR", { cardId: "s1" }),
  el("synopsis", "Le Loup rencontre l’enfant."),
  el("action", "Le Loup sort d’un fourré. [[à couper ?]] [[cosmos:x1]]"),
  el("character", "LE LOUP"),
  el("dialogue", "Où allez-vous ?"),
  el("character", "CHAPERON"),
  el("dialogue", "Chez ma mère-grand !"),
  el("note", "Revoir ce dialogue"),
  el("sceneHeading", "INT. MAISON - JOUR"),
  el("character", "LA MÈRE"),
  el("dialogue", "Porte-lui cette galette."),
  el("sceneHeading", "INT. CHAUMIÈRE - NUIT"),
  el("character", "CHAPERON"),
  el("dialogue", "Bonjour !"),
  el("character", "LE LOUP", { dual: true }),
  el("dialogue", "Entre donc."),
];
const text = (pages: ReturnType<typeof typeset>) => pages.flatMap((p) => p.lines.map((l) => l.text)).join("\n");

describe("options de l'export PDF", () => {
  it("format standard : ni synopsis, ni section, ni note", () => {
    const out = text(typeset(script, a4, "fr", strings));
    expect(out).not.toContain("ACTE I");
    expect(out).not.toContain("rencontre");
    expect(out).not.toContain("couper");
    expect(out).not.toContain("Revoir");
  });
  it("synopsis, sections et notes en gris, jamais les notes de lien", () => {
    const lines = typeset(script, a4, "fr", strings, { synopsis: true, sections: true, notes: true }).flatMap((p) => p.lines);
    expect(lines.find((l) => l.text === "ACTE I")).toMatchObject({ bold: true, gray: true });
    expect(lines.find((l) => l.text.includes("rencontre"))?.gray).toBe(true);
    expect(lines.some((l) => l.text.includes("[[à couper ?]]"))).toBe(true);
    expect(lines.some((l) => l.text.includes("cosmos:"))).toBe(false);
    expect(lines.find((l) => l.text.includes("Revoir"))?.text).toBe("[[Revoir ce dialogue]]");
    expect(printable("a [[cosmos:z]] b", true)).toBe("a b");
  });
  it("texte d'un personnage : ses scènes, numérotées comme dans le scénario, ses répliques surlignées", () => {
    const lines = typeset(script, a4, "fr", strings, { character: "Le Loup" }).flatMap((p) => p.lines);
    const all = lines.map((l) => l.text).join("\n");
    expect(all).not.toContain("galette");
    expect(all).not.toContain("MAISON");
    expect(lines.filter((l) => l.text === "3")).toHaveLength(2); // la chaumière garde son numéro, des deux côtés
    expect(lines.find((l) => l.text === "Où allez-vous ?")?.highlight).toBe(true);
    expect(lines.find((l) => l.text === "Chez ma mère-grand !")?.highlight).toBeUndefined();
  });
  it("dialogue simultané : les deux répliques sur les mêmes lignes, côte à côte", () => {
    const lines = typeset(script, a4, "fr", strings).flatMap((p) => p.lines);
    const left = lines.find((l) => l.text === "Bonjour !")!;
    const right = lines.find((l) => l.text === "Entre donc.")!;
    expect(left.row).toBe(right.row);
    expect(right.column).toBeGreaterThan(left.column + 20);
    expect(lines.find((l) => l.text === "LE LOUP" && l.row === left.row - 1)).toBeTruthy();
  });
  it("en-tête rempli, réglages relus et écrits seulement s'ils changent", () => {
    expect(fillHeader("Version 3 · {date} · {TITRE} · {author}", { date: "24 octobre 2026", title: "Chaperon", author: "Perrault" })).toBe("Version 3 · 24 octobre 2026 · Chaperon · Perrault");
    expect(scriptPrintToMeta(DEFAULT_SCRIPT_PRINT)).toBeUndefined();
    expect(scriptPrintToMeta({ ...DEFAULT_SCRIPT_PRINT, watermark: "  Confidentiel " })).toEqual({ ...DEFAULT_SCRIPT_PRINT, watermark: "Confidentiel" });
    expect(cleanScriptPrint({ titlePage: "oui", notes: true, header: 3 })).toEqual({ ...DEFAULT_SCRIPT_PRINT, notes: true });
  });
  it("le PDF se fabrique avec toutes les options (sans page de titre)", async () => {
    const bytes = await buildPdf(
      { titlePage: { Title: "Chaperon" }, elements: script },
      { layout: a4, locale: "fr", strings, titlePage: false, synopsis: true, sections: true, notes: true, character: "LE LOUP", header: "Version 3 · 24 octobre 2026", watermark: "Confidentiel" },
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });
});
