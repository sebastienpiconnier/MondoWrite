// @vitest-environment node
// Lot 1.7.4, zone Scénario et exports : défauts relevés par l'audit du 30 octobre 2026.

import { describe, expect, it } from "vitest";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";
import { parse } from "../screenplay/parse";
import { serialize } from "../screenplay/serialize";
import { screenplayExtensions, toDoc, fromDoc } from "../screenplay/editor";
import { enter } from "../screenplay/editor/keymap";
import { isTransitionCue } from "../screenplay/rules";
import { buildPdf } from "../screenplay/export/pdf";
import { buildFdx } from "../screenplay/export/fdx";
import { resumedCues, typeset } from "../screenplay/export/typeset";
import { wrap } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { readPdfText } from "../pdfDocument";
import { screenplayFromPdf } from "../import/pdf";
import { checkScreenplay } from "../review/checks";
import { screenplayReport } from "../review/report";
import { proseUtterances, screenplayUtterances, sentences } from "../reading";
import type { CardData } from "../types";

const meta = import.meta as unknown as { resolve: (s: string) => string };
pdfjs.GlobalWorkerOptions.workerSrc = meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

const sp = (...elements: ScreenplayElement[]): Screenplay => ({ titlePage: {}, elements });
const roundTrip = (s: Screenplay) => parse(serialize(s)).elements;
const strings = { more: "(À SUIVRE)", contd: "(SUITE)" };
const letter = LAYOUTS.letter;

describe("1. Maj+Entrée en tête d'une réplique", () => {
  it("le personnage et sa réplique survivent à la relecture du Fountain", () => {
    const els = roundTrip(sp({ type: "character", text: "HUGO" }, { type: "dialogue", text: "\nTu viens ?" }));
    expect(els).toEqual([
      { type: "character", text: "HUGO" },
      { type: "dialogue", text: "Tu viens ?" },
    ]);
  });

  it("une réplique faite seulement de retours : le nom reste un personnage forcé", () => {
    const els = roundTrip(sp({ type: "character", text: "HUGO" }, { type: "dialogue", text: "\n\n" }, { type: "action", text: "Il part." }));
    expect(els[0]).toMatchObject({ type: "character", text: "HUGO" });
  });
});

describe("2. Ligne d'action qui commence par un marqueur Fountain", () => {
  for (const second of ["# Acte", "= résumé", "/* coupé", "[[note]]", "> centré <", "!bang", "  # retrait"]) {
    it(`« ${second} » reste dans l'action`, () => {
      const text = `Il entre.\n${second}`;
      expect(roundTrip(sp({ type: "action", text }))).toEqual([{ type: "action", text }]);
    });
  }
});

describe("3. Dialogue double de nos PDF, réimporté", () => {
  it("deux colonnes relues en deux répliques, la seconde en dialogue double", async () => {
    const source = sp(
      { type: "sceneHeading", text: "INT. PHARE - NUIT" },
      { type: "action", text: "Ils parlent en même temps." },
      { type: "character", text: "INÈS" },
      { type: "dialogue", text: "Je reste ici, quoi que tu dises ce soir." },
      { type: "character", text: "YANN", dual: true },
      { type: "parenthetical", text: "(fort)" },
      { type: "dialogue", text: "Tu pars avec moi." },
      { type: "action", text: "Silence." },
    );
    const bytes = await buildPdf(source, { layout: letter, locale: "fr", strings, numberScenes: false, underlineHeadings: false, titlePage: false });
    const out = screenplayFromPdf(await readPdfText(bytes));
    expect(out.elements).toEqual(source.elements);
    // Dans un long scénario (interligne simple le plus courant), avec des numéros de scène.
    const many = sp(...Array.from({ length: 8 }, () => source.elements).flat());
    const again = screenplayFromPdf(await readPdfText(await buildPdf(many, { layout: letter, locale: "fr", strings, numberScenes: true, underlineHeadings: false, titlePage: false })));
    expect(again.elements.map(({ sceneNumber: _n, ...el }) => el)).toEqual(many.elements);
  }, 30000);
});

describe("4. Nom d'usage proposé par la complétion", () => {
  const cards = [{ id: "h", type: "personnage", title: "Hugo Le Bris", html: "" } as unknown as CardData];
  const els: ScreenplayElement[] = [
    { type: "sceneHeading", text: "INT. PHARE - NUIT" },
    { type: "character", text: "HUGO" },
    { type: "dialogue", text: "Bonsoir." },
    { type: "character", text: "HUGO LE BRIS" },
    { type: "dialogue", text: "Encore." },
  ];

  it("« HUGO » n'est pas un personnage inconnu", () => {
    expect(checkScreenplay(els, letter, cards).filter((f) => f.rule === "unknownCharacter")).toEqual([]);
  });

  it("une seule ligne dans les chiffres des personnages", () => {
    const rows = screenplayReport(els, cards);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "h", lines: 2 });
  });

  it("deux cartes au même prénom : le prénom seul ne désigne personne", () => {
    const two = [...cards, { id: "m", type: "personnage", title: "Hugo Martin", html: "" } as unknown as CardData];
    expect(checkScreenplay(els, letter, two).filter((f) => f.rule === "unknownCharacter").map((f) => f.names)).toEqual([["HUGO"]]);
  });
});

describe("5. Entrée sur une action en majuscules finie par « : »", () => {
  const schema = getSchema(screenplayExtensions({ locale: () => "fr", placeholder: () => "", onEscape: () => {} }));
  const pressEnter = (text: string) => {
    const doc = schema.nodeFromJSON(toDoc(sp({ type: "action", text })));
    let state = EditorState.create({ schema, doc });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, text.length + 1)));
    let after = state;
    enter(state, (tr: Transaction) => (after = state.apply(tr)));
    return fromDoc(after.doc.toJSON(), {}).elements[0].type;
  };

  it("une vraie transition devient une transition", () => {
    expect(pressEnter("CUT TO:")).toBe("transition");
    expect(pressEnter("COUPE À :")).toBe("transition");
    expect(pressEnter("FONDU AU NOIR :")).toBe("transition");
  });

  it("« SILENCE : » et « FADE IN: » restent de l'action (comme le relit le parseur)", () => {
    expect(pressEnter("SILENCE :")).toBe("action");
    expect(pressEnter("FADE IN:")).toBe("action");
    expect(parse("Avant.\n\nFADE IN:\n\nAprès.").elements[1].type).toBe("action");
    expect(isTransitionCue("DISSOLVE TO:")).toBe(true);
    expect(isTransitionCue("Coupe à :")).toBe(false);
  });
});

describe("6. (SUITE) dans un dialogue double", () => {
  const els: ScreenplayElement[] = [
    { type: "sceneHeading", text: "INT. PHARE - NUIT" },
    { type: "character", text: "INÈS" },
    { type: "dialogue", text: "Tu entends ?" },
    { type: "action", text: "Le vent." },
    { type: "character", text: "INÈS" },
    { type: "dialogue", text: "Encore." },
    { type: "character", text: "YANN", dual: true },
    { type: "dialogue", text: "Rien." },
  ];

  it("l'orateur de gauche qui reprend reçoit (SUITE), à l'écran comme dans le PDF", () => {
    expect([...resumedCues(els)]).toEqual([4]);
    const texts = typeset(els, letter, "fr", strings, { resumes: true }).flatMap((p) => p.lines.map((l) => l.text));
    expect(texts).toContain("INÈS (SUITE)");
    expect(texts).not.toContain("YANN (SUITE)");
  });
});

describe("7. Coupure de ligne et espace insécable", () => {
  it("« ? » et « ! » ne commencent jamais une ligne", () => {
    const text = "Tu viens avec moi ce soir au phare ?";
    for (const line of wrap(text, 30)) expect(line.startsWith("?")).toBe(false);
    expect(wrap("Tu viens ?", 9)).toEqual(["Tu", "viens ?"]);
    expect(wrap("Non ! Si.", 5)).toEqual(["Non !", "Si."]);
    // Les autres espaces coupent toujours.
    expect(wrap("Un\tdeux trois", 5)).toEqual(["Un", "deux", "trois"]);
  });
});

describe("8. Lecture à voix haute", () => {
  it("ni les notes ni le texte mis de côté ne se lisent", () => {
    const out = screenplayUtterances(
      [
        { type: "action", text: "Il entre. [[à revoir]] Il s'assoit. /* coupé */" },
        { type: "character", text: "HUGO" },
        { type: "dialogue", text: "Bonsoir [[trop sec ?]]." },
      ],
      0,
      "fr",
    );
    expect(out.map((u) => u.text)).toEqual(["Il entre.", "Il s'assoit.", "Bonsoir."]);
  });

  it("un long bloc est lu phrase par phrase, même rang pour le surlignage", () => {
    const out = proseUtterances([{ type: "paragraph", text: "Un. Deux ? Trois !" }], 0);
    expect(out).toEqual([
      { index: 0, speaker: null, text: "Un." },
      { index: 0, speaker: null, text: "Deux ?" },
      { index: 0, speaker: null, text: "Trois !" },
    ]);
  });

  it("une phrase trop longue est coupée à une virgule, jamais au milieu d'un mot", () => {
    const long = Array.from({ length: 30 }, (_, i) => `mot${i} encore`).join(", ") + ".";
    const parts = sentences(long, "fr");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(200);
    expect(parts.join(" ")).toBe(long);
  });
});

describe("9. Dialogue double dans le FDX", () => {
  it("les deux répliques dans un <DualDialogue>", () => {
    const fdx = buildFdx(
      sp(
        { type: "character", text: "INÈS" },
        { type: "dialogue", text: "Je reste." },
        { type: "character", text: "YANN", dual: true },
        { type: "dialogue", text: "Tu pars." },
        { type: "action", text: "Silence." },
      ),
      "fr",
    );
    const dual = /<Paragraph>\s*<DualDialogue>([\s\S]*?)<\/DualDialogue>\s*<\/Paragraph>/.exec(fdx);
    expect(dual).not.toBeNull();
    expect(dual![1]).toContain("INÈS");
    expect(dual![1]).toContain("Tu pars.");
    expect(dual![1]).not.toContain("Silence.");
  });
});
