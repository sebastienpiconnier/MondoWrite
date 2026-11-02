// @vitest-environment happy-dom
// Commentaires ancrés (1.13.0, docs/plan-commentaires.md) : fichier commentaires/<id>.md, marque dans le texte,
// ordre, « À faire », store (ajouter, modifier, résoudre, supprimer et annuler), enregistrement et relecture.

import { beforeEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { Schema } from "@tiptap/pm/model";
import { cleanQuote, commentIdsInElements, readCommentNotes, removeCommentFromElements, commentIdsIn, commentsFile, isAnchored, isCommentId, openComments, orderComments, readCommentsFile, removeCommentMark, type SceneComment } from "../comments";
import { commentStyle } from "../components/commentMark";
import { changedRange } from "../bookDoc";
import { htmlToMarkdown, markdownToHtml } from "../storage/markdown";
import { deserialize, serialize } from "../storage";
import { collectTodos } from "../todos";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { parse as parseFountain } from "../screenplay/parse";
import { serialize as serializeFountain } from "../screenplay/serialize";
import { fromDoc, toDoc } from "../screenplay/editor/convert";

const c = (over: Partial<SceneComment> = {}): SceneComment => ({ id: "abc123def456", date: "2026-11-02T10:12:00+01:00", text: "Trop tôt.", quote: "six heures", ...over });

describe("fichier commentaires/<id>.md", () => {
  it("écrit puis relu à l'identique, résolu compris", () => {
    const list = [c(), c({ id: "zzz999yyy888", text: "Deux lignes\n\nde texte", quote: "", resolved: true })];
    const raw = commentsFile(list)!;
    expect(raw).toContain("## abc123def456 · 2026-11-02T10:12:00+01:00\n> six heures\nTrop tôt.");
    expect(raw).toContain("## zzz999yyy888 · 2026-11-02T10:12:00+01:00 · resolved");
    expect(readCommentsFile(raw)).toEqual(list);
    expect(commentsFile([])).toBeNull();
  });

  it("une ligne du texte qui ressemble à un en-tête est protégée", () => {
    const tricky = c({ text: "## abc123def457 · 2026-11-02T10:12:00+01:00\nsuite" });
    const back = readCommentsFile(commentsFile([tricky])!);
    expect(back).toEqual([tricky]);
  });

  it("en-tête illisible, doublon, identifiant piégé : ignorés", () => {
    const raw = "## pas un en-tête\nperdu\n\n## abc123def456 · 2026-11-02T10:12:00+01:00\nGardé\n\n## abc123def456 · 2026-11-03T10:12:00+01:00\nDoublon\n\n## ../evil · 2026-11-02T10:12:00+01:00\nnon";
    expect(readCommentsFile(raw).map((x) => x.text)).toEqual(["Gardé"]);
    expect(isCommentId("../evil")).toBe(false);
    expect(isCommentId('a" onclick="x')).toBe(false);
  });

  it("citation sur une ligne, bornée", () => {
    expect(cleanQuote("  deux\n lignes ")).toBe("deux lignes");
    expect(cleanQuote("x".repeat(500)).length).toBe(300);
  });
});

describe("marque dans le texte", () => {
  const html = '<p>Le réveil sonne à <span data-comment="abc123def456">six heures</span> et <span data-comment="zzz999yyy888">Ethan</span> rêve.</p>';

  it("identifiants dans l'ordre du texte, marque retirée sans toucher au texte", () => {
    expect(commentIdsIn(html)).toEqual(["abc123def456", "zzz999yyy888"]);
    expect(removeCommentMark(html, "abc123def456")).toBe('<p>Le réveil sonne à six heures et <span data-comment="zzz999yyy888">Ethan</span> rêve.</p>');
    expect(removeCommentMark(html, "inconnu12345")).toBe(html);
  });

  it("gardée par le Markdown du manuscrit et par le nettoyage, rien d'autre que l'identifiant", () => {
    const md = htmlToMarkdown(html);
    expect(md).toContain('<span data-comment="abc123def456">six heures</span>');
    expect(markdownToHtml(md)).toContain('<span data-comment="abc123def456">six heures</span>');
    expect(markdownToHtml('<span data-comment="abc123def456" onclick="x" style="color:red">a</span>')).toContain('<span data-comment="abc123def456">a</span>');
    expect(markdownToHtml('<span data-comment="../x">a</span>')).not.toContain("data-comment");
  });

  it("ordre : selon le texte, puis ceux dont le passage a disparu", () => {
    const list = [c({ id: "zzz999yyy888" }), c({ id: "lost00000001", date: "2026-01-01T00:00:00" }), c()];
    expect(orderComments(list, commentIdsIn(html)).map((x) => x.id)).toEqual(["abc123def456", "zzz999yyy888", "lost00000001"]);
    expect(isAnchored(c({ id: "lost00000001" }), commentIdsIn(html))).toBe(false);
  });

  it("surlignage : seulement les commentaires ouverts, identifiants vérifiés", () => {
    expect(commentStyle([], null)).toBe("");
    const css = commentStyle(["abc123def456", "bad\"id"], "abc123def456");
    expect(css).toContain('[data-comment="abc123def456"]');
    expect(css).not.toContain("bad");
    expect(css).toContain("box-shadow");
  });

  it("une marque posée sans rien déplacer compte comme un changement (l'éditeur du livre l'enregistre)", () => {
    const schema = new Schema({
      nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*", toDOM: () => ["p", 0] }, text: {} },
      marks: { comment: { attrs: { id: {} }, excludes: "" } },
    });
    const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Le réveil sonne")])]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4, 10) });
    const tr = state.tr.addMark(4, 10, schema.marks.comment.create({ id: "abc123def456" }));
    expect(changedRange(tr)).toEqual({ from: 4, to: 10 });
    expect(changedRange(state.tr.setSelection(TextSelection.create(doc, 2)))).toBeNull();
  });
});

describe("« À faire »", () => {
  it("les commentaires ouverts et écrits, d'une carte qui existe", () => {
    const cards = [{ id: "s1", type: "scene" as const, title: "Le réveil", html: "" }];
    const comments = { s1: [c(), c({ id: "done00000001", resolved: true }), c({ id: "empty0000001", text: " " })], gone: [c({ id: "gone00000001" })] };
    const todos = collectTodos(cards, {}, null, comments).filter((x) => x.kind === "comment");
    expect(todos).toEqual([{ kind: "comment", cardId: "s1", where: "manuscript", text: "Trop tôt.", index: 0, markId: "abc123def456" }]);
    expect(openComments(comments, ["s1"]).map((x) => x.comment.id)).toEqual(["abc123def456", "gone00000001"]);
  });
});

const state = () => useCosmos.getState();

describe("store et enregistrement", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {} });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
  });

  it("ajouter, écrire, résoudre, supprimer puis annuler : hors historique, marque comprise", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().setManuscriptText(id, '<p>Le réveil sonne à <span data-comment="abc123def456">six heures</span>.</p>');
    const past = state().past.length;
    state().addComment(id, "abc123def456", "six  heures");
    expect(state().comments[id]).toMatchObject([{ id: "abc123def456", text: "", quote: "six heures" }]);
    expect(state().commentFocus).toEqual({ cardId: id, id: "abc123def456", edit: true });
    state().editComment(id, "abc123def456", "Trop tôt.");
    state().resolveComment(id, "abc123def456", true);
    expect(state().comments[id][0]).toMatchObject({ text: "Trop tôt.", resolved: true });
    state().resolveComment(id, "abc123def456", false);
    expect(state().comments[id][0].resolved).toBeUndefined();
    expect(state().past.length).toBe(past);

    const undo = state().deleteComment(id, "abc123def456")!;
    expect(state().comments[id]).toBeUndefined();
    expect(state().manuscript[id]).toBe("<p>Le réveil sonne à six heures.</p>");
    state().undoDeleteComment(undo);
    expect(state().comments[id]).toHaveLength(1);
    expect(state().manuscript[id]).toContain('data-comment="abc123def456"');
  });

  it("annuler une suppression après une frappe : le commentaire revient sans toucher au texte", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().setManuscriptText(id, '<p><span data-comment="abc123def456">six</span> heures</p>');
    state().addComment(id, "abc123def456", "six");
    const undo = state().deleteComment(id, "abc123def456")!;
    state().setManuscriptText(id, "<p>six heures et quart</p>");
    state().undoDeleteComment(undo);
    expect(state().comments[id]).toHaveLength(1);
    expect(state().manuscript[id]).toBe("<p>six heures et quart</p>");
  });

  it("refuse un identifiant piégé ou une carte inconnue", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().addComment(id, "../x", "a");
    state().addComment("inconnue", "abc123def456", "a");
    expect(state().comments).toEqual({});
  });

  it("enregistré dans commentaires/<id>.md et relu", async () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().setManuscriptText(id, '<p><span data-comment="abc123def456">six</span> heures</p>');
    state().addComment(id, "abc123def456", "six");
    state().editComment(id, "abc123def456", "Trop tôt.");
    await state().save();
    const files = state().lastFiles;
    expect(files[`commentaires/${id}.md`]).toContain("Trop tôt.");
    expect(files[`manuscrit/${id}.md`]).toContain('<span data-comment="abc123def456">six</span>');
    const back = deserialize(files)!;
    expect(back.comments?.[id]?.[0]).toMatchObject({ id: "abc123def456", text: "Trop tôt.", quote: "six" });
    expect(serialize(back)[`commentaires/${id}.md`]).toBe(files[`commentaires/${id}.md`]);
  });
});

describe("scénario : note [[cosmos:comment:<id>]] en fin d'élément", () => {
  const source = "INT. PHARE - NUIT\n\nInès monte les marches. [[ia]] [[cosmos:comment:abc123def456]] [[cosmos:comment:zzz999yyy888]]\n\nINÈS\nIl y a quelqu’un ? [[cosmos:comment:dlg000000001]]\n";

  it("lue, retirée du texte, réécrite à l'identique (avec la note de l'IA)", () => {
    const sp = parseFountain(source);
    const action = sp.elements.find((e) => e.type === "action")!;
    expect(action).toMatchObject({ text: "Inès monte les marches.", ia: true, comments: ["abc123def456", "zzz999yyy888"] });
    expect(sp.elements.find((e) => e.type === "character")?.text).toBe("INÈS");
    expect(sp.elements.find((e) => e.type === "dialogue")).toMatchObject({ text: "Il y a quelqu’un ?", comments: ["dlg000000001"] });
    expect(serializeFountain(sp)).toBe(source);
    expect(commentIdsInElements(sp.elements)).toEqual(["abc123def456", "zzz999yyy888", "dlg000000001"]);
  });

  it("passe par l'éditeur sans se perdre", () => {
    const sp = parseFountain(source);
    expect(fromDoc(toDoc(sp), sp.titlePage).elements).toEqual(sp.elements);
  });

  it("une note au milieu du texte ou piégée n'est pas un commentaire", () => {
    expect(readCommentNotes("a [[cosmos:comment:abc123def456]] b")).toEqual({ text: "a [[cosmos:comment:abc123def456]] b", ids: [] });
    expect(readCommentNotes("a [[cosmos:comment:../x]]").ids).toEqual([]);
  });

  it("retirer un commentaire d'un élément", () => {
    const els = parseFountain(source).elements;
    const next = removeCommentFromElements(els, "abc123def456");
    expect(next.find((e) => e.type === "action")?.comments).toEqual(["zzz999yyy888"]);
    expect(removeCommentFromElements(next, "zzz999yyy888").find((e) => e.type === "action")).not.toHaveProperty("comments");
    expect(removeCommentFromElements(els, "inconnu00000")).toBe(els);
  });
});

describe("scénario : store", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {} });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "scenario" });
  });

  it("supprimer retire la note de l'élément, annuler la remet", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    const sp = state().screenplay!;
    const at = sp.elements.findIndex((e) => e.type === "sceneHeading" && e.cardId === id);
    state().setScreenplay({ ...sp, elements: [...sp.elements.slice(0, at + 1), { type: "action", text: "Inès monte.", comments: ["abc123def456"] }, ...sp.elements.slice(at + 1)] });
    state().addComment(id, "abc123def456", "Inès monte.");
    state().editComment(id, "abc123def456", "Trop vite.");
    const undo = state().deleteComment(id, "abc123def456")!;
    expect(state().screenplay!.elements.find((e) => e.text === "Inès monte.")).not.toHaveProperty("comments");
    state().undoDeleteComment(undo);
    expect(state().screenplay!.elements.find((e) => e.text === "Inès monte.")?.comments).toEqual(["abc123def456"]);
    expect(state().comments[id]).toHaveLength(1);
  });
});
