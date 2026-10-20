// Chutier : un passage quitte le texte et revient exactement à sa place.

import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { placePassage, readChutier, takePassage, type Passage } from "../chutier";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    sceneMark: { group: "block", atom: true, selectable: false, attrs: { id: { default: "" } }, toDOM: () => ["div"] },
    text: { group: "inline" },
  },
  marks: { em: { toDOM: () => ["em", 0] } },
});

const p = (text: string, em = false) => schema.nodes.paragraph.create(null, text ? schema.text(text, em ? [schema.marks.em.create()] : undefined) : undefined);
const mark = (id: string) => schema.nodes.sceneMark.create({ id });
const book = (...nodes: ReturnType<typeof p>[]) => schema.nodes.doc.create(null, nodes);

/** Position du `n`-ième caractère de `needle` dans le document. */
function find(state: EditorState, needle: string, at = 0): number {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText) return;
    const i = node.text!.indexOf(needle);
    if (i >= 0) found = pos + i + at;
  });
  return found;
}
const select = (state: EditorState, from: number, to: number) => state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
const texts = (state: EditorState) => state.doc.textBetween(0, state.doc.content.size, "|", "?");

function start() {
  const doc = book(mark("a"), p("Il était une fois un loup."), p("Il avait faim, très faim."), mark("b"), p("Autre scène."));
  return EditorState.create({ doc, schema });
}

describe("takePassage", () => {
  it("retire la sélection et en garde le texte", () => {
    const s0 = start();
    const from = find(s0, " très faim");
    const s = select(s0, from, from + " très faim".length);
    const out = takePassage(s, "x", "2026-10-20");
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.passage.text).toBe("très faim");
    expect(out.passage.scene).toBe("a");
    expect(texts(s.apply(out.tr))).toBe("?|Il était une fois un loup.|Il avait faim,.|?|Autre scène.");
  });

  it("refuse une sélection vide ou à cheval sur deux scènes", () => {
    const s0 = start();
    expect(takePassage(select(s0, 5, 5), "x", "d")).toEqual({ error: "empty" });
    const from = find(s0, "faim, très");
    const to = find(s0, "Autre");
    expect(takePassage(select(s0, from, to + 3), "x", "d")).toEqual({ error: "scene" });
  });
});

describe("placePassage", () => {
  const roundTrip = (s0: EditorState, from: number, to: number) => {
    const out = takePassage(select(s0, from, to), "x", "d");
    if ("error" in out) throw new Error(out.error);
    const s1 = s0.apply(out.tr);
    return { s1, passage: out.passage };
  };

  it("remet un passage au milieu d'un paragraphe exactement comme avant", () => {
    const s0 = start();
    const from = find(s0, " très faim");
    const { s1, passage } = roundTrip(s0, from, from + " très faim".length);
    const back = placePassage(s1, passage, "a");
    expect(back?.where).toBe("exact");
    expect(back && s1.apply(back.tr).doc.eq(s0.doc)).toBe(true);
  });

  it("remet plusieurs paragraphes entiers, mise en forme comprise", () => {
    const doc = book(mark("a"), p("Un."), p("Deux en italique.", true), p("Trois."), p("Quatre."));
    const s0 = EditorState.create({ doc, schema });
    const from = find(s0, "Deux");
    const to = find(s0, "Trois") + "Trois.".length;
    const { s1, passage } = roundTrip(s0, from, to);
    const back = placePassage(s1, passage, "a");
    expect(back && s1.apply(back.tr).doc.eq(s0.doc)).toBe(true);
  });

  it("le retrouve même si du texte a été ajouté avant", () => {
    const s0 = start();
    const from = find(s0, "Il avait");
    const { s1, passage } = roundTrip(s0, from, from + "Il avait ".length);
    // Un nouveau paragraphe en tête de scène décale tout.
    const at = find(s1, "Il était") - 1;
    const s2 = s1.apply(s1.tr.insert(at, p("Prologue ajouté.")));
    const back = placePassage(s2, passage, "a");
    expect(back?.where).toBe("exact");
    const after = s2.apply(back!.tr);
    expect(texts(after)).toContain("Il avait faim");
    expect(texts(after).indexOf("Prologue")).toBeLessThan(texts(after).indexOf("Il avait"));
  });

  it("à défaut de la scène d'origine, va à la fin de la scène en cours", () => {
    const s0 = start();
    const from = find(s0, "Il était");
    const { s1, passage } = roundTrip(s0, from, from + "Il était une fois ".length);
    const gone = EditorState.create({ doc: book(mark("b"), p("Autre scène.")), schema });
    const back = placePassage(gone, { ...passage, scene: "disparue" }, "b");
    expect(back?.where).toBe("elsewhere");
    expect(texts(gone.apply(back!.tr))).toContain("Autre scène.Il était une fois");
    expect(placePassage(gone, { ...passage, scene: "disparue" }, null)).toBeNull();
    expect(s1).toBeTruthy();
  });

  it("garde la place la plus proche quand le texte autour a changé", () => {
    const s0 = start();
    const from = find(s0, " très faim");
    const { s1, passage } = roundTrip(s0, from, from + " très faim".length);
    const s2 = s1.apply(s1.tr.insertText("!!!", find(s1, "Il avait faim,") + 2));
    const back = placePassage(s2, passage, "a");
    expect(back?.where).toBe("near");
    expect(texts(s2.apply(back!.tr))).toContain("très faim");
  });
});

describe("readChutier", () => {
  it("écarte ce qui n'a pas la bonne forme", () => {
    const ok = { id: "p", scene: "a", slice: { content: [] }, text: "t", before: "", after: "", offset: 3, date: "d" };
    const out: Passage[] = readChutier([ok, { id: 1 }, null, { ...ok, id: "q", slice: "non" }, { ...ok, id: "r", offset: "x" }]);
    expect(out.map((x) => x.id)).toEqual(["p", "r"]);
    expect(out[1].offset).toBe(0);
    expect(readChutier(undefined)).toEqual([]);
  });
});
