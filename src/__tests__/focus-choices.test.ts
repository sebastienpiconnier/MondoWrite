import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { jumpOverChoices, moveOffChoices } from "../components/focusChoices";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    sceneChoices: { group: "block", atom: true },
    text: {},
  },
});
const p = (t: string) => schema.node("paragraph", null, t ? [schema.text(t)] : []);
const doc = schema.node("doc", null, [p("Avant"), schema.node("sceneChoices"), p("Après")]);
// Positions : « Avant » 1..6, paragraphe finit à 7 ; bloc de choix 7..8 ; « Après » 9..14.

describe("blocs de choix cachés en mode focus", () => {
  it("Suppr au bout du texte saute le bloc au lieu de l'effacer", () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 6) });
    expect(jumpOverChoices(state, 1)?.from).toBe(9);
  });
  it("Retour arrière au début du texte qui suit revient avant le bloc", () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 9) });
    expect(jumpOverChoices(state, -1)?.from).toBe(6);
  });
  it("ne fait rien loin d'un bloc", () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 3) });
    expect(jumpOverChoices(state, 1)).toBeNull();
  });
  it("une sélection posée sur le bloc passe au texte voisin, dans le sens du geste", () => {
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 7) });
    expect(moveOffChoices(state, 6)?.from).toBe(9);
    expect(moveOffChoices(state, 10)?.from).toBe(6);
  });
});
