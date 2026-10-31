// @vitest-environment happy-dom
// Lot 1.7.4, zone Scénario : l'éditeur joué avec ses pages, ses (SUITE) et ses scènes, pour garder la couverture
// de src/screenplay/ au-dessus de 90 % (les mesures de l'écran sont simulées : une ligne = 16 px).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/react";
import type { ScreenplayElement } from "../screenplay/model";
import { screenplayExtensions, toDoc } from "../screenplay/editor";
import { docElements } from "../screenplay/editor/continued";
import { layoutPages, pagesKey } from "../screenplay/editor/pages";
import { screenplayGroups } from "../screenplay/groups";
import { elementWords, sceneWords, screenplayWords } from "../screenplay/words";

let frames: FrameRequestCallback[] = [];
const flush = () => {
  while (frames.length) frames.shift()!(0);
};
let editor: Editor | null = null;

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => ({ ...real(el), fontSize: "16px", paddingTop: "16px" }) as CSSStyleDeclaration);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ height: 16, bottom: 16, top: 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect);
});

afterEach(() => {
  editor?.destroy();
  editor = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const scene: ScreenplayElement[] = [
  { type: "sceneHeading", text: "INT. PHARE - NUIT", cardId: "c1" },
  { type: "character", text: "INÈS" },
  { type: "dialogue", text: "Un." },
  { type: "parenthetical", text: "(bas)" },
  { type: "dialogue", text: "Deux." },
  { type: "dialogue", text: "Trois." },
  { type: "action", text: "Le vent." },
  { type: "character", text: "INÈS" },
  { type: "dialogue", text: "Encore." },
  { type: "sceneHeading", text: "EXT. CÔTE - AUBE" },
  { type: "action", text: "La mer." },
  { type: "note", text: "à revoir" },
];

function open(elements: ScreenplayElement[], book = false) {
  const layouts: number[] = [];
  const element = document.createElement("div");
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: screenplayExtensions({
      locale: () => "fr",
      placeholder: () => "",
      onEscape: () => {},
      pages: {
        geometry: () => ({ lines: 4, pageLines: 7, marginTop: 1 }),
        enabled: () => true,
        continued: () => ({ more: "(À SUIVRE)", contd: "(SUITE)" }),
        onLayout: (pages) => layouts.push(pages),
        ...(book ? { numberAt: "bottom" as const, firstPage: () => 3, label: (p: number) => String(p) } : {}),
      },
      continued: { resumes: () => true, contd: () => "(SUITE)" },
    }),
    content: toDoc({ titlePage: {}, elements }),
  });
  flush();
  return { dom: editor.view.dom as HTMLElement, layouts };
}

describe("feuille en pages, à l'écran", () => {
  it("coupe en pages, avec (À SUIVRE) et le nom (SUITE) quand une réplique est coupée", () => {
    const { dom, layouts } = open(scene);
    expect(layouts.at(-1)).toBeGreaterThan(1);
    expect(dom.querySelectorAll(".sp-pagebreak").length).toBeGreaterThan(1);
    const speech = [...dom.querySelectorAll(".sp-pagebreak-speech")].map((e) => e.textContent);
    expect(speech).toContain("(À SUIVRE)");
    expect(speech).toContain("INÈS (SUITE)");
    expect(dom.querySelector(".sp-pagebreak-number")?.textContent).toMatch(/^\d+\.$/);
    // Le même découpage ne redessine rien.
    const before = editor!.state;
    editor!.view.dispatch(editor!.state.tr.setMeta("rien", true));
    flush();
    expect(pagesKey.getState(editor!.state)?.find().length).toBe(pagesKey.getState(before)?.find().length);
  });

  it("le personnage qui reprend après une action porte (SUITE)", () => {
    const { dom } = open(scene);
    expect(dom.querySelectorAll(".has-contd")).toHaveLength(1);
    expect(docElements(editor!.state.doc).map((e) => e.type)).toEqual(scene.map((e) => e.type));
  });

  it("livre : numéro en bas, numérotation qui continue", () => {
    const { dom } = open(scene, true);
    const numbers = [...dom.querySelectorAll(".sp-pagebreak-number.is-bottom")].map((e) => e.textContent);
    expect(numbers[0]).toBe("3");
  });

  it("clic sous le texte : le curseur va à la fin du dernier élément", () => {
    const { dom } = open(scene.slice(0, 3));
    const event = new MouseEvent("mousedown", { button: 0, clientY: 9999, bubbles: true, cancelable: true });
    dom.dispatchEvent(event);
    expect(editor!.state.selection.from).toBe(editor!.state.doc.content.size - 1);
    // Clic sur le texte : rien de spécial.
    dom.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientY: 1, bubbles: true }));
  });

  it("répartition pure : page pleine, élément plus haut qu'une page, page imposée", () => {
    const out = layoutPages(
      [
        { height: 9, margin: 0, keep: 0 },
        { height: 1, margin: 1, keep: 0, before: true },
        { height: 1, margin: 1, keep: 0, cont: true },
      ],
      4,
      2,
    );
    expect(out.pages).toBe(2);
    expect(out.breaks.map((b) => b.index)).toEqual([1]);
  });
});

describe("scènes et mots du scénario", () => {
  it("les scènes du document, repérées par leur carte ou leur rang", () => {
    open(scene);
    const groups = screenplayGroups(editor!.state.doc);
    expect(groups.map((g) => g.id)).toEqual(["c1", "scene-1"]);
    expect(groups[0]).toMatchObject({ first: 1, last: 9 });
    expect(groups[1].last).toBe(scene.length);
  });

  it("mots écrits, sans les notes", () => {
    const sp = { titlePage: {}, elements: scene };
    expect(elementWords({ type: "note", text: "à revoir" })).toBe(0);
    expect(screenplayWords(sp)).toBe(sceneWords(sp, 0));
    expect(sceneWords(sp, 9, 11)).toBe(6);
    expect(screenplayWords(null)).toBe(0);
  });
});
