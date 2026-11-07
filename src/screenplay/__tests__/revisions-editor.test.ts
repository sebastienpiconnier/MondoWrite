// @vitest-environment happy-dom
// Marques de révision pendant la frappe (#18), jouées sur un vrai éditeur TipTap.

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import type { ScreenplayElement } from "../model";
import { fromDoc, screenplayExtensions, toDoc } from "../editor";

let editor: Editor;
let pass: number | null = null;

function open(elements: ScreenplayElement[]): Editor {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: screenplayExtensions({ locale: () => "fr", placeholder: (t) => t, onEscape: () => {}, revision: () => pass }),
    content: toDoc({ titlePage: {}, elements }),
  });
  return editor;
}

const revs = () => fromDoc(editor.getJSON(), {}).elements.map((e) => e.rev);
/** Écrit `text` à la fin de l'élément d'index donné. */
function typeIn(index: number, text: string) {
  let pos = 0;
  editor.state.doc.forEach((node, offset, i) => {
    if (i === index) pos = offset + node.nodeSize - 1;
  });
  editor.view.dispatch(editor.state.tr.insertText(text, pos));
}

afterEach(() => {
  editor?.destroy();
  pass = null;
});

describe("marquage à la frappe", () => {
  const base: ScreenplayElement[] = [
    { type: "sceneHeading", text: "INT. PHARE - NUIT" },
    { type: "action", text: "La lampe tourne." },
    { type: "action", text: "Un cri." },
  ];

  it("ne marque rien tant qu'aucune passe n'est ouverte", () => {
    open(base);
    typeIn(1, " Encore.");
    expect(revs()).toEqual([undefined, undefined, undefined]);
  });

  it("marque l'élément modifié de la passe ouverte, pas les autres", () => {
    pass = 2;
    open(base);
    expect(revs()).toEqual([undefined, undefined, undefined]);
    typeIn(1, " Encore.");
    expect(revs()).toEqual([undefined, 2, undefined]);
  });

  it("une passe plus récente remplace la marque", () => {
    pass = 1;
    open([base[0], { ...base[1], rev: 1 }, base[2]]);
    pass = 2;
    typeIn(1, "!");
    typeIn(2, "!");
    expect(revs()).toEqual([undefined, 2, 2]);
  });

  it("l'élément né d'un Entrée ne reprend pas la marque", () => {
    pass = 2;
    open([base[0], { ...base[1], rev: 2 }]);
    expect(editor.getJSON().content?.[1].attrs?.rev).toBe(2);
    // Le nouvel élément est vide : il est marqué à sa première lettre, pas avant.
    editor.chain().focus("end").splitBlock().run();
    expect(revs().at(-1)).toBeUndefined();
  });

  it("recharger le contenu ne marque rien", () => {
    pass = 2;
    open(base);
    editor.commands.setContent(toDoc({ titlePage: {}, elements: [{ type: "action", text: "Autre texte." }] }), { emitUpdate: false });
    expect(revs()).toEqual([undefined]);
  });

  it("un nom de personnage n'est jamais marqué", () => {
    pass = 2;
    open([{ type: "character", text: "INÈS" }, { type: "dialogue", text: "Oui." }]);
    typeIn(0, "X");
    typeIn(1, "!");
    expect(revs()).toEqual([undefined, 2]);
  });
});
