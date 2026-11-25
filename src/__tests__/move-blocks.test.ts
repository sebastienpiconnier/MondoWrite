import { describe, expect, it } from "vitest";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { BOOK_MOVE, SCREENPLAY_MOVE, moveBlocks } from "../components/moveBlocks";

// Un schéma minimal qui porte les noms des nœuds du livre et du scénario.
const textBlock = { group: "block", content: "text*" };
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: {},
    paragraph: textBlock,
    sceneMark: { group: "block", atom: true, attrs: { id: { default: "" } } },
    sceneChoices: textBlock,
    action: textBlock,
    character: textBlock,
    parenthetical: textBlock,
    dialogue: textBlock,
    transition: textBlock,
    sceneHeading: textBlock,
    preserved: { group: "block", atom: true, attrs: { kind: { default: "note" } } },
  },
});

type B = [string, string?];
function doc(blocks: B[]): PMNode {
  return schema.node(
    "doc",
    null,
    blocks.map(([type, text]) => (schema.nodes[type].isAtom ? schema.node(type, type === "preserved" ? { kind: text } : { id: text }) : schema.node(type, null, text ? schema.text(text) : undefined))),
  );
}
const show = (d: PMNode) => {
  const out: string[] = [];
  d.forEach((n) => out.push(`${n.type.name}:${n.isAtom ? (n.attrs.kind ?? n.attrs.id) : n.textContent}`));
  return out;
};
/** État avec le curseur dans le texte qui contient `word`. */
function at(d: PMNode, word: string) {
  let pos = -1;
  d.descendants((n, p) => {
    if (pos < 0 && n.isText && n.text!.includes(word)) pos = p + n.text!.indexOf(word);
  });
  return EditorState.create({ doc: d, selection: TextSelection.create(d, pos) });
}

describe("déplacer des lignes au clavier (#145)", () => {
  it("le livre : un paragraphe monte, le curseur le suit", () => {
    const d = doc([["sceneMark", "s1"], ["paragraph", "un"], ["paragraph", "deux"]]);
    const tr = moveBlocks(at(d, "deux"), -1, BOOK_MOVE)!;
    expect(show(tr.doc)).toEqual(["sceneMark:s1", "paragraph:deux", "paragraph:un"]);
    expect(tr.doc.resolve(tr.selection.head).parent.textContent).toBe("deux");
  });

  it("le livre : il passe dans la scène voisine, jamais avant la première scène ni derrière un bloc de choix", () => {
    const d = doc([["sceneMark", "s1"], ["paragraph", "un"], ["sceneMark", "s2"], ["paragraph", "deux"]]);
    expect(show(moveBlocks(at(d, "deux"), -1, BOOK_MOVE)!.doc)).toEqual(["sceneMark:s1", "paragraph:un", "paragraph:deux", "sceneMark:s2"]);
    expect(show(moveBlocks(at(d, "un"), 1, BOOK_MOVE)!.doc)).toEqual(["sceneMark:s1", "sceneMark:s2", "paragraph:un", "paragraph:deux"]);
    expect(moveBlocks(at(d, "un"), -1, BOOK_MOVE)).toBeNull();
    const withChoices = doc([["sceneMark", "s1"], ["paragraph", "un"], ["sceneChoices", "choix"], ["sceneMark", "s2"], ["paragraph", "deux"]]);
    expect(moveBlocks(at(withChoices, "deux"), -1, BOOK_MOVE)).toBeNull();
    expect(moveBlocks(at(withChoices, "un"), 1, BOOK_MOVE)).toBeNull();
    expect(moveBlocks(at(withChoices, "choix"), -1, BOOK_MOVE)).toBeNull();
  });

  it("la sélection de plusieurs paragraphes bouge d'un seul coup", () => {
    const d = doc([["sceneMark", "s1"], ["paragraph", "a"], ["paragraph", "b"], ["paragraph", "c"]]);
    const start = at(d, "b");
    const end = at(d, "c");
    const state = EditorState.create({ doc: d, selection: TextSelection.create(d, start.selection.from, end.selection.from + 1) });
    expect(show(moveBlocks(state, -1, BOOK_MOVE)!.doc)).toEqual(["sceneMark:s1", "paragraph:b", "paragraph:c", "paragraph:a"]);
  });

  it("le scénario : la réplique entière bouge, passe un en-tête, jamais une section", () => {
    const d = doc([
      ["sceneHeading", "INT. PHARE"],
      ["preserved", "synopsis"],
      ["action", "La lanterne tourne."],
      ["character", "INÈS"],
      ["parenthetical", "(bas)"],
      ["dialogue", "Tu entends ?"],
      ["preserved", "section"],
      ["action", "Fin."],
    ]);
    const up = moveBlocks(at(d, "entends"), -1, SCREENPLAY_MOVE)!;
    expect(show(up.doc).slice(2, 6)).toEqual(["character:INÈS", "parenthetical:(bas)", "dialogue:Tu entends ?", "action:La lanterne tourne."]);
    // L'action passe au-dessus de l'en-tête et de son synopsis caché (scène d'avant), pas au-dessus de la section.
    expect(show(moveBlocks(at(d, "lanterne"), -1, SCREENPLAY_MOVE)!.doc).slice(0, 3)).toEqual(["action:La lanterne tourne.", "sceneHeading:INT. PHARE", "preserved:synopsis"]);
    expect(moveBlocks(at(d, "Fin."), -1, SCREENPLAY_MOVE)).toBeNull();
    // Un en-tête ne bouge pas.
    expect(moveBlocks(at(d, "PHARE"), 1, SCREENPLAY_MOVE)).toBeNull();
  });
});

import { keptScenes } from "../review/filter";

describe("« Ses scènes » et les fils (#137)", () => {
  it("une scène reliée au personnage par un fil est gardée, même s'il n'y parle pas", () => {
    const elements = [
      { type: "sceneHeading", text: "INT. PHARE", cardId: "s1" },
      { type: "character", text: "INÈS" },
      { type: "dialogue", text: "Tu entends ?" },
      { type: "sceneHeading", text: "EXT. QUAI", cardId: "s2" },
      { type: "action", text: "La mer." },
    ];
    expect(keptScenes(elements, { name: "Inès", mode: "scenes" })).toEqual([0]);
    expect(keptScenes(elements, { name: "Inès", mode: "scenes", linked: ["s2"] })).toEqual([0, 3]);
  });
});
