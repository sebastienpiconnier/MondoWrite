// @vitest-environment happy-dom
// Assistant externe par MCP, écriture (#62, lot 3) : résolution, marques « IA », Fountain, et application d'une
// demande sur un store simulé.

import { describe, expect, it } from "vitest";
import { fr } from "../i18n/fr";
import type { CardData, CardType } from "../types";
import type { Screenplay } from "../screenplay/model";
import type { Plan } from "../plan";
import type { Pitch } from "../pitch";
import type { Comments } from "../comments";
import type { Goals } from "../stats";
import { parse } from "../screenplay/parse";
import { serialize } from "../screenplay/serialize";
import { applyMcpRequest, cardTypeOf, pageKindOf, replaceQuoteInHtml, replaceQuoteInScene, withMentions, commentInScene, findSeriesPart, markQuoteInHtml, moveScreenplayScene, pitchKeyOf, splitHtmlAt, templateOf, findCard, iaFountain, iaHtml, resolveFields, withIaSynopsis, withSceneText, type McpStore } from "../mcpWrite";

const card = (c: Partial<CardData> & Pick<CardData, "id" | "type" | "title">): CardData => ({ html: "", ...c });

describe("résolution", () => {
  const cards = [card({ id: "c1", type: "personnage", title: "Inès Morvan" }), card({ id: "l1", type: "lieu", title: "Le phare" })];

  it("trouve une carte par identifiant, titre exact sans accents, puis titre qui le contient", () => {
    expect(findCard(cards, "c1")?.id).toBe("c1");
    expect(findCard(cards, "INES MORVAN")?.id).toBe("c1");
    expect(findCard(cards, "morvan")?.id).toBe("c1");
    expect(findCard(cards, "xx")).toBeNull();
  });

  it("type par clé, par libellé ou par nom anglais", () => {
    expect(cardTypeOf("personnage", fr, "roman")).toBe("personnage");
    expect(cardTypeOf("Lieu", fr, "roman")).toBe("lieu");
    expect(cardTypeOf("Décor", fr, "scenario")).toBe("lieu");
    expect(cardTypeOf("character", fr, "roman")).toBe("personnage");
    expect(cardTypeOf("locations", fr, "roman")).toBe("lieu");
    expect(cardTypeOf("licorne", fr, "roman")).toBeNull();
  });

  it("champs par clé ou libellé ; champs à choix et références vérifiés", () => {
    const r = resolveFields("personnage", { Âge: "34 ans", metier: "Gardienne", "Type d’arc": "Tragique", Taille: "1,70 m" }, fr, cards);
    expect(r.fiche).toMatchObject({ age: "34 ans", metier: "Gardienne", arcType: "negatif" });
    expect(r.refused).toEqual(["Taille"]);
    const scene = resolveFields("scene", { statut: "À revoir", pov: "Inès", issue: "n'importe" }, fr, cards);
    expect(scene.fiche).toEqual({ statut: "revoir", pov: "c1" });
    expect(scene.refused[0]).toMatch(/^issue/);
  });
});

describe("marques IA", () => {
  it("chaque bloc de texte est marqué, la mise en forme gardée", () => {
    const html = iaHtml("Un **passage**.\n\nDeux.", "m1");
    expect(html).toBe('<p><span data-ia="m1">Un <strong>passage</strong>.</span></p><p><span data-ia="m1">Deux.</span></p>');
  });

  it("Fountain : répliques et actions marquées, un en-tête refusé", () => {
    const els = iaFountain("Inès monte.\n\nINÈS\nIl y a quelqu’un ?")!;
    expect(els.map((e) => [e.type, e.ia ?? false])).toEqual([
      ["action", true],
      ["character", false],
      ["dialogue", true],
    ]);
    expect(iaFountain("INT. PHARE - NUIT\n\nAction.")).toBeNull();
  });

  it("synopsis et corps d'une scène du scénario", () => {
    const sp = parse("INT. PHARE - NUIT [[cosmos:s1]]\n\n= Ancien.\n\nAction.\n\nEXT. FALAISE - JOUR [[cosmos:s2]]\n\nVent.");
    const syn = withIaSynopsis(sp, "s1", "Inès arrive.");
    expect(serialize(syn)).toContain("= Inès arrive. [[ia]]");
    expect(serialize(syn)).not.toContain("Ancien");
    const added = withSceneText(sp, "s1", iaFountain("Elle allume.")!, false);
    const text = serialize(added);
    expect(text.indexOf("Action.")).toBeLessThan(text.indexOf("Elle allume. [[ia]]"));
    expect(text.indexOf("Elle allume.")).toBeLessThan(text.indexOf("EXT. FALAISE"));
    expect(serialize(withSceneText(sp, "s1", iaFountain("Tout neuf.")!, true))).not.toContain("Action.");
  });
});

/** Store simulé : garde cartes, manuscrit, scénario ; compte les étapes d'annulation (`batch`). */
function fakeStore(kind: "roman" | "scenario", screenplay: Screenplay | null = null) {
  const state = {
    cards: [card({ id: "c1", type: "personnage", title: "Inès Morvan" }), card({ id: "s1", type: "scene", title: "L’arrivée" })] as CardData[],
    manuscript: { s1: "<p>Avant.</p>" } as Record<string, string>,
    screenplay,
    edges: [] as [string, string, string][],
    batches: 0,
    versions: [] as string[],
    journal: [] as string[],
    moves: [] as string[][],
    chapters: [] as { id: string; title: string; start: string }[],
    wires: [] as { id: string; source: string; target: string }[],
    plan: { template: "libre", beats: {} } as Plan,
    pitch: {} as Pitch,
    comments: {} as Comments,
    calls: [] as string[],
    trash: [] as CardData[],
    frames: [] as { id: string; title: string; locked?: boolean }[],
    title: "Projet",
    goals: {} as Goals,
  };
  let n = 0;
  const store: McpStore = {
    kind,
    cards: () => state.cards,
    screenplay: () => state.screenplay,
    manuscript: () => state.manuscript,
    scenes: () => state.cards.filter((c) => c.type === "scene").map((c, i) => ({ n: i + 1, id: c.id, title: c.title })),
    batch: (fn) => {
      state.batches++;
      return fn();
    },
    addTitledCard: (type: CardType, title: string) => {
      const id = `new${++n}`;
      state.cards = [...state.cards, card({ id, type, title })];
      return id;
    },
    updateCard: (id, patch) => {
      state.cards = state.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
    },
    linkCards: (a, b, label) => void state.edges.push([a, b, label]),
    addQuestionAbout: (title, ids) => {
      const id = store.addTitledCard("question", title);
      for (const target of ids) state.edges.push([id, target, ""]);
      return id;
    },
    setManuscriptText: (id, html) => void (state.manuscript = { ...state.manuscript, [id]: html }),
    setScreenplay: (sp) => void (state.screenplay = sp),
    keepVersion: async (id) => {
      state.versions.push(id);
      return "v";
    },
    log: (target) => void state.journal.push(target),
    moveBookScene: (id, target, side) => {
      state.moves.push([id, target, side]);
      return true;
    },
    chapters: () => state.chapters.map((c, i) => ({ n: i + 1, ...c })),
    startChapterAt: (sceneId) => {
      if (state.chapters.some((c) => c.start === sceneId)) return null;
      state.chapters.push({ id: `ch${state.chapters.length + 1}`, title: "", start: sceneId });
      return `ch${state.chapters.length}`;
    },
    renameChapter: (id, title) => void (state.chapters = state.chapters.map((c) => (c.id === id ? { ...c, title } : c))),
    deleteChapter: (id) => void (state.chapters = state.chapters.filter((c) => c.id !== id)),
    moveChapter: (id, before) => void state.moves.push([id, before ?? "", "chapter"]),
    edges: () => state.wires,
    plan: () => state.plan,
    pitch: () => state.pitch,
    comments: () => state.comments,
    addComment: (cardId, id, quote, text) => void (state.comments = { ...state.comments, [cardId]: [...(state.comments[cardId] ?? []), { id, date: "2026-11-09T10:00:00+01:00", quote, text }] }),
    resolveComment: (cardId, id, resolved) =>
      void (state.comments = { ...state.comments, [cardId]: state.comments[cardId].map((c) => (c.id === id ? { ...c, resolved } : c)) }),
    addEpisode: () => "ep1",
    addSeason: () => "sa1",
    renameSeriesPart: (id, title) => void state.calls.push(`rename:${id}:${title}`),
    setEpisodeSynopsis: (id, text) => void state.calls.push(`synopsis:${id}:${text}`),
    moveSeriesPart: (id, way) => void state.calls.push(`move:${id}:${way}`),
    placeInEpisode: (id, ep) => void state.calls.push(`episode:${id}:${ep}`),
    placeInBeat: (id, beat) => void state.calls.push(`beat:${id}:${beat}`),
    setPlanTemplate: (tpl) => void (state.plan = { ...state.plan, template: tpl }),
    nextMergeable: (id) => (id === "s1" ? "s2" : null),
    joinScenes: (from, into) => {
      state.calls.push(`join:${from}:${into}`);
      return true;
    },
    splitScene: (_afterId, html) => {
      state.manuscript = { ...state.manuscript, cut: html };
      return "cut";
    },
    trash: (ids) => void (state.cards = state.cards.filter((c) => !ids.includes(c.id))),
    removeLink: (id) => void (state.wires = state.wires.filter((w) => w.id !== id)),
    replace: () => 3,
    rename: () => ({ count: 4, skipped: 1 }),
    setCoverIa: (key, text) => void (state.pitch = { ...state.pitch, [key]: text }),
    frame: (title, ids) => {
      state.calls.push(`frame:${title}:${ids.join(",")}`);
      return "f1";
    },
    organize: () => void state.calls.push("organize"),
    trashed: () => state.trash,
    restore: (id) => {
      const c = state.trash.find((x) => x.id === id)!;
      state.trash = state.trash.filter((x) => x.id !== id);
      state.cards = [...state.cards, c];
    },
    renameLink: (id, label) => void state.calls.push(`label:${id}:${label}`),
    setWireFiche: (id, field, value) => void state.calls.push(`wire:${id}:${field}:${value}`),
    frames: () => state.frames,
    renameFrame: (id, title) => void (state.frames = state.frames.map((f) => (f.id === id ? { ...f, title } : f))),
    deleteFrame: (id) => void (state.frames = state.frames.filter((f) => f.id !== id || f.locked)),
    setTitle: (title) => void (state.title = title),
    goals: () => state.goals,
    setGoals: (goals) => void (state.goals = goals),
  };
  return { state, store };
}

describe("application d'une demande", () => {
  it("créer une carte : champs et titre marqués IA, notes marquées, une étape, journal", async () => {
    const { state, store } = fakeStore("roman");
    const res = await applyMcpRequest({ id: "1", tool: "create_card", args: { type: "lieu", title: "La crique", notes: "Abritée du vent.", fields: { Époque: "1912" } } }, store, fr);
    expect(res.ok).toBe(true);
    const created = state.cards.find((c) => c.title === "La crique")!;
    expect(created.type).toBe("lieu");
    expect(created.ia).toEqual(expect.arrayContaining(["title"]));
    expect(created.html).toContain("data-ia=");
    expect(state.batches).toBe(1);
    expect(state.journal).toEqual(["La crique"]);
  });

  it("une scène se crée par create_scene, pas par create_card", async () => {
    const { store } = fakeStore("roman");
    expect((await applyMcpRequest({ id: "1", tool: "create_card", args: { type: "scene", title: "X" } }, store, fr)).ok).toBe(false);
  });

  it("réécrire une scène de roman garde d'abord une version, compléter non", async () => {
    const { state, store } = fakeStore("roman");
    await applyMcpRequest({ id: "1", tool: "write_scene", args: { scene: "1", text: "Après." } }, store, fr);
    expect(state.manuscript.s1).toMatch(/^<p>Avant\.<\/p><p><span data-ia="[^"]+">Après\.<\/span><\/p>$/);
    expect(state.versions).toEqual([]);
    const res = await applyMcpRequest({ id: "2", tool: "write_scene", args: { scene: "L'arrivée", text: "Tout neuf.", mode: "replace" } }, store, fr);
    expect(res.ok).toBe(true);
    expect(state.versions).toEqual(["s1"]);
    expect(state.manuscript.s1).not.toContain("Avant");
  });

  it("question reliée aux cartes nommées, fil étiqueté", async () => {
    const { state, store } = fakeStore("roman");
    await applyMcpRequest({ id: "1", tool: "add_question", args: { question: "Pourquoi Inès ment-elle ?", about: ["Inès"] } }, store, fr);
    expect(state.edges.some(([, to]) => to === "c1")).toBe(true);
    await applyMcpRequest({ id: "2", tool: "link_cards", args: { from: "Inès", to: "L’arrivée", label: "ouvre" } }, store, fr);
    expect(state.edges).toContainEqual(["c1", "s1", "ouvre"]);
  });

  it("scénario : texte de scène en Fountain, annulable comme le séquencier", async () => {
    const { state, store } = fakeStore("scenario", parse("INT. PHARE - NUIT [[cosmos:s1]]\n\nAction."));
    const res = await applyMcpRequest({ id: "1", tool: "write_scene", args: { scene: "1", text: "INÈS\nQui est là ?" } }, store, fr);
    expect(res.ok).toBe(true);
    expect(serialize(state.screenplay!)).toContain("Qui est là ? [[ia]]");
    const bad = await applyMcpRequest({ id: "2", tool: "write_scene", args: { scene: "1", text: "EXT. DEHORS - JOUR\n\nVent." } }, store, fr);
    expect(bad.ok).toBe(false);
  });

  it("outil ou scène inconnus : refus clair", async () => {
    const { store } = fakeStore("roman");
    expect((await applyMcpRequest({ id: "1", tool: "delete_all", args: {} }, store, fr)).ok).toBe(false);
    expect((await applyMcpRequest({ id: "2", tool: "write_scene", args: { scene: "9", text: "x" } }, store, fr)).ok).toBe(false);
  });

  it("roman : déplacer une scène avant ou après une autre, une étape", async () => {
    const { state, store } = fakeStore("roman");
    state.cards.push(card({ id: "s2", type: "scene", title: "La tempête" }));
    const res = await applyMcpRequest({ id: "1", tool: "move_scene", args: { scene: "La tempête", before: "1" } }, store, fr);
    expect(res.ok).toBe(true);
    expect(state.moves).toEqual([["s2", "s1", "before"]]);
    expect(state.batches).toBe(1);
    expect((await applyMcpRequest({ id: "2", tool: "move_scene", args: { scene: "2" } }, store, fr)).ok).toBe(false);
    expect((await applyMcpRequest({ id: "3", tool: "move_scene", args: { scene: "2", after: "2" } }, store, fr)).ok).toBe(false);
  });

  it("roman : créer, renommer, déplacer et retirer un chapitre", async () => {
    const { state, store } = fakeStore("roman");
    const res = await applyMcpRequest({ id: "1", tool: "create_chapter", args: { scene: "1", title: "Le phare" } }, store, fr);
    expect(res.ok).toBe(true);
    expect(state.chapters).toEqual([{ id: "ch1", title: "Le phare", start: "s1" }]);
    expect(state.batches).toBe(1);
    expect((await applyMcpRequest({ id: "2", tool: "create_chapter", args: { scene: "1" } }, store, fr)).ok).toBe(false);
    expect((await applyMcpRequest({ id: "3", tool: "rename_chapter", args: { chapter: "Chapitre 1", title: "La lanterne" } }, store, fr)).ok).toBe(true);
    expect(state.chapters[0].title).toBe("La lanterne");
    expect((await applyMcpRequest({ id: "4", tool: "move_chapter", args: { chapter: "lanterne" } }, store, fr)).ok).toBe(true);
    expect(state.moves).toEqual([["ch1", "", "chapter"]]);
    expect((await applyMcpRequest({ id: "5", tool: "delete_chapter", args: { chapter: "1" } }, store, fr)).ok).toBe(true);
    expect(state.chapters).toEqual([]);
    expect((await applyMcpRequest({ id: "6", tool: "rename_chapter", args: { chapter: "1", title: "x" } }, store, fr)).ok).toBe(false);
  });

  it("scénario : pas de chapitres, mais la scène se déplace avec son texte", async () => {
    const sp = parse("INT. PHARE - NUIT [[cosmos:s1]]\n\nUn.\n\nEXT. FALAISE - JOUR [[cosmos:s2]]\n\nDeux.\n\nINT. CUISINE - JOUR [[cosmos:s3]]\n\nTrois.");
    const after = moveScreenplayScene(sp, "s3", "s1", "before");
    expect(serialize(after).indexOf("Trois.")).toBeLessThan(serialize(after).indexOf("Un."));
    const end = moveScreenplayScene(sp, "s1", "s3", "after");
    expect(serialize(end).trim().endsWith("Un.")).toBe(true);
    expect(moveScreenplayScene(sp, "s2", "s1", "after")).toBe(sp);
    expect(moveScreenplayScene(sp, "s1", "zz", "after")).toBe(sp);
    const { store } = fakeStore("scenario", sp);
    expect((await applyMcpRequest({ id: "1", tool: "create_chapter", args: { scene: "1" } }, store, fr)).ok).toBe(false);
  });

  it("commentaire : passage marqué dans le manuscrit, ou noté sur l'élément du scénario", async () => {
    const html = "<p>Inès monte l\u2019escalier du <em>phare</em>.</p><p>La mer gronde.</p>";
    expect(markQuoteInHtml(html, "monte l'escalier", "c123456")).toBe('<p>Inès <span data-comment="c123456">monte l’escalier</span> du <em>phare</em>.</p><p>La mer gronde.</p>');
    expect(markQuoteInHtml(html, "escalier du phare", "c123456")).toBeNull();
    const sp = parse("INT. PHARE - NUIT [[cosmos:s1]]\n\nLa mer gronde.\n\nINÈS\nQui est là ?");
    const next = commentInScene(sp, "s1", "Qui est là", "c123456")!;
    expect(serialize(next)).toContain("Qui est là ? [[cosmos:comment:c123456]]");
    expect(commentInScene(sp, "s1", "INÈS", "c123456")).toBeNull();

    const { state, store } = fakeStore("roman");
    const res = await applyMcpRequest({ id: "1", tool: "add_comment", args: { scene: "1", quote: "Avant", text: "Trop court ?" }, client: "Claude" }, store, fr);
    expect(res.ok).toBe(true);
    expect(state.manuscript.s1).toMatch(/<span data-comment="[\w-]+">Avant<\/span>/);
    const [comment] = state.comments.s1;
    expect(comment.text).toBe("Claude\u00a0: Trop court ?");
    expect((await applyMcpRequest({ id: "2", tool: "resolve_comment", args: { comment: comment.id } }, store, fr)).ok).toBe(true);
    expect(state.comments.s1[0].resolved).toBe(true);
  });

  it("couper une scène au paragraphe cité, jamais au premier", async () => {
    expect(splitHtmlAt("<p>Un.</p><p>Deux.</p><p>Trois.</p>", "Deux")).toEqual(["<p>Un.</p>", "<p>Deux.</p><p>Trois.</p>"]);
    expect(splitHtmlAt("<p>Un.</p><p>Deux.</p>", "Un")).toBeNull();
    const { state, store } = fakeStore("roman");
    state.manuscript.s1 = "<p>Un.</p><p>Deux.</p>";
    expect((await applyMcpRequest({ id: "1", tool: "split_scene", args: { scene: "1", at: "Deux" } }, store, fr)).ok).toBe(true);
    expect(state.manuscript).toMatchObject({ s1: "<p>Un.</p>", cut: "<p>Deux.</p>" });
  });

  it("série : épisodes et saisons désignés par numéro, « 2.1 », titre ou identifiant", () => {
    const sp = parse(
      "# Saison 1 [[cosmos:season:sa1]]\n\n## Le phare [[cosmos:episode:e1]]\n\nINT. PHARE - NUIT\n\nUn.\n\n## La lande [[cosmos:episode:e2]]\n\n# Saison 2 [[cosmos:season:sa2]]\n\n## Retour [[cosmos:episode:e3]]\n",
    );
    expect(findSeriesPart(sp, "2.1")?.id).toBe("e3");
    expect(findSeriesPart(sp, "3")?.id).toBe("e3");
    expect(findSeriesPart(sp, "la lande")?.id).toBe("e2");
    expect(findSeriesPart(sp, "saison 2")).toMatchObject({ kind: "season", id: "sa2" });
    expect(findSeriesPart(sp, "e1")?.kind).toBe("episode");
    expect(findSeriesPart(sp, "9")).toBeNull();
  });

  it("gabarits et champs de la couverture par clé ou par nom", () => {
    expect(templateOf("Save the Cat", "roman", fr)).toBe("saveTheCat");
    expect(templateOf("trois actes", "scenario", fr)).toBe("troisActes");
    expect(templateOf("aucun", "scenario", fr)).toBeNull();
    expect(templateOf("huitSequences", "roman", fr)).toBeUndefined();
    expect(pitchKeyOf("logline", "roman", {}, fr)).toBe("logline");
    expect(pitchKeyOf("summary", "roman", {}, fr)).toBe("resume");
    expect(pitchKeyOf("n'importe quoi", "roman", {}, fr)).toBeNull();
  });

  it("structure et canevas : gabarit, case, fusion, corbeille, fils, cadre, rangement", async () => {
    const { state, store } = fakeStore("roman");
    state.cards.push(card({ id: "s2", type: "scene", title: "La tempête" }));
    state.wires.push({ id: "w1", source: "c1", target: "s1" });
    const run = (tool: string, args: Record<string, unknown>) => applyMcpRequest({ id: tool, tool, args }, store, fr);
    expect((await run("set_template", { template: "Save the Cat" })).ok).toBe(true);
    expect(state.plan.template).toBe("saveTheCat");
    expect((await run("place_scene", { scene: "1", beat: "Catalyseur" })).ok).toBe(true);
    expect(state.calls.at(-1)).toMatch(/^beat:s1:/);
    expect((await run("place_scene", { scene: "1", beat: "Nulle part" })).ok).toBe(false);
    expect((await run("merge_scenes", { scene: "1" })).ok).toBe(true);
    expect(state.calls).toContain("join:s2:s1");
    expect((await run("merge_scenes", { scene: "2" })).ok).toBe(false);
    expect((await run("unlink_cards", { from: "Inès", to: "L'arrivée" })).ok).toBe(true);
    expect(state.wires).toEqual([]);
    expect((await run("trash_card", { card: "La tempête" })).ok).toBe(true);
    expect(state.cards.some((c) => c.id === "s2")).toBe(false);
    expect((await run("create_frame", { title: "Famille", cards: ["Inès", "Personne"] })).text).toContain("Introuvables : Personne");
    expect((await run("organize_canvas", {})).ok).toBe(true);
    expect((await run("set_cover", { field: "logline", text: "Une gardienne de phare…" })).ok).toBe(true);
    expect(state.pitch.logline).toBe("Une gardienne de phare…");
    expect((await run("rename_everywhere", { card: "Inès", name: "Iris" })).text).toContain("1 occurrence");
    expect((await run("create_episode", { title: "Pilote" })).ok).toBe(false);
  });

  it("fiche d'une scène : statut et point de vue par leur libellé, champs de texte marqués IA", async () => {
    const { state, store } = fakeStore("roman");
    const res = await applyMcpRequest({ id: "1", tool: "set_scene_fields", args: { scene: "1", fields: { Statut: "Brouillon", pov: "Inès", "Ce qu’il veut": "Trouver le gardien", couleur: "bleu" } } }, store, fr);
    expect(res.ok).toBe(true);
    expect(res.text).toContain("couleur");
    const scene = state.cards.find((c) => c.id === "s1")!;
    expect(scene.fiche).toMatchObject({ statut: "brouillon", pov: "c1", but: "Trouver le gardien" });
    expect(scene.ia).toEqual(["but"]);
    expect((await applyMcpRequest({ id: "2", tool: "set_scene_fields", args: { scene: "1", fields: { statut: "" } } }, store, fr)).ok).toBe(true);
    expect(state.cards.find((c) => c.id === "s1")!.fiche?.statut).toBeUndefined();
    expect((await applyMcpRequest({ id: "3", tool: "set_scene_fields", args: { scene: "1", fields: { rien: "x" } } }, store, fr)).text).toContain("Champs de la fiche d'une scène");
  });

  it("fiche d'une scène de scénario : le synopsis va dans le Fountain", async () => {
    const { state, store } = fakeStore("scenario", parse("INT. PHARE - NUIT [[cosmos:s1]]\n\nAction."));
    expect((await applyMcpRequest({ id: "1", tool: "set_scene_fields", args: { scene: "1", fields: { synopsis: "Inès arrive.", obstacle: "La tempête" } } }, store, fr)).ok).toBe(true);
    expect(serialize(state.screenplay!)).toContain("= Inès arrive. [[ia]]");
    expect(state.cards.find((c) => c.id === "s1")!.fiche).toEqual({ obstacle: "La tempête" });
  });
});

describe("dernier lot", () => {
  it("[[Titre]] devient une mention, une carte inconnue reste du texte", () => {
    const cards = [card({ id: "c1", type: "personnage", title: "Inès Morvan" })];
    const r = withMentions("Avec [[Inès Morvan]] et [[Personne]].", cards);
    expect(r.md).toBe("Avec [@Inès Morvan](cosmos:c1) et Personne.");
    expect(r.ids).toEqual(["c1"]);
  });

  it("une mention dans les notes tire le fil", async () => {
    const { state, store } = fakeStore("roman");
    await applyMcpRequest({ id: "1", tool: "create_card", args: { type: "lieu", title: "Phare", notes: "Là où vit [[Inès Morvan]]." } }, store, fr);
    const created = state.cards.find((c) => c.title === "Phare")!;
    expect(created.html).toContain('data-mention="c1"');
    expect(state.edges).toContainEqual([created.id, "c1", ""]);
  });

  it("remplacer un passage : roman et scénario", () => {
    expect(replaceQuoteInHtml("<p>Il pleut sur la mer.</p>", "sur la mer", "sur le port", "m")).toBe('<p>Il pleut <span data-ia="m">sur le port</span>.</p>');
    expect(replaceQuoteInHtml("<p>Il pleut.</p>", "neige", "x")).toBeNull();
    const sp = parse("INT. PHARE - NUIT [[cosmos:s1]]\n\nInès monte l'escalier.");
    const next = replaceQuoteInScene(sp, "s1", "monte l'escalier", "redescend")!;
    expect(serialize(next)).toContain("Inès redescend. [[ia]]");
  });

  it("replace_passage garde une version et journalise ; refuse un passage absent", async () => {
    const { state, store } = fakeStore("roman");
    const ok = await applyMcpRequest({ id: "1", tool: "replace_passage", args: { scene: "1", quote: "Avant", text: "Plus tôt" } }, store, fr);
    expect(ok.ok).toBe(true);
    expect(state.manuscript.s1).toMatch(/<span data-ia="[^"]+">Plus tôt<\/span>\./);
    expect(state.versions).toEqual(["s1"]);
    expect((await applyMcpRequest({ id: "2", tool: "replace_passage", args: { scene: "1", quote: "Absent", text: "x" } }, store, fr)).ok).toBe(false);
  });

  it("changer le type d'une carte, puis ses champs", async () => {
    const { state, store } = fakeStore("roman");
    state.cards.push(card({ id: "i1", type: "idee", title: "La lanterne" }));
    const res = await applyMcpRequest({ id: "1", tool: "update_card", args: { card: "La lanterne", type: "objet", fields: { usage: "Éclairer" } } }, store, fr);
    expect(res.ok).toBe(true);
    const c = state.cards.find((x) => x.id === "i1")!;
    expect(c.type).toBe("objet");
    expect(c.fiche?.usage).toBe("Éclairer");
  });

  it("page du livre, pas dans un scénario", async () => {
    expect(pageKindOf("Dédicace", fr)).toBe("dedicace");
    const { state, store } = fakeStore("roman");
    expect((await applyMcpRequest({ id: "1", tool: "create_scene", args: { page: "dedicace", text: "À Yann." } }, store, fr)).ok).toBe(true);
    expect(state.cards.at(-1)?.page).toBe("dedicace");
    const sc = fakeStore("scenario", parse("INT. PHARE - NUIT [[cosmos:s1]]\n\nAction."));
    expect((await applyMcpRequest({ id: "2", tool: "create_scene", args: { page: "dedicace" } }, sc.store, fr)).ok).toBe(false);
  });

  it("fil : étiquette et fiche", async () => {
    const { state, store } = fakeStore("roman");
    state.wires.push({ id: "w1", source: "c1", target: "s1" });
    const res = await applyMcpRequest({ id: "1", tool: "update_link", args: { from: "s1", to: "Inès", label: "raconte", fields: { Enjeu: "Sa place", taille: "x" } } }, store, fr);
    expect(res.ok).toBe(true);
    expect(state.calls).toEqual(["label:w1:raconte", "wire:w1:enjeu:Sa place"]);
    expect(res.text).toContain("taille");
  });

  it("corbeille, question d'un personnage, cadre, projet", async () => {
    const { state, store } = fakeStore("roman");
    state.trash.push(card({ id: "t1", type: "lieu", title: "La crique" }));
    expect((await applyMcpRequest({ id: "1", tool: "restore_card", args: { card: "crique" } }, store, fr)).ok).toBe(true);
    expect(state.cards.some((c) => c.id === "t1")).toBe(true);

    await applyMcpRequest({ id: "2", tool: "add_character_question", args: { character: "Inès", question: "Que craint-elle ?" } }, store, fr);
    await applyMcpRequest({ id: "3", tool: "add_character_question", args: { character: "Inès", question: "que craint-elle ?" } }, store, fr);
    expect(state.cards.find((c) => c.id === "c1")?.questions).toEqual(["Que craint-elle ?"]);

    state.frames.push({ id: "f1", title: "Lieux" }, { id: "f2", title: "Verrou", locked: true });
    await applyMcpRequest({ id: "4", tool: "update_frame", args: { frame: "Lieux", title: "Décors" } }, store, fr);
    expect(state.frames[0].title).toBe("Décors");
    expect((await applyMcpRequest({ id: "5", tool: "update_frame", args: { frame: "Verrou", remove: true } }, store, fr)).ok).toBe(false);

    state.goals = { daily: 500 };
    await applyMcpRequest({ id: "6", tool: "set_project", args: { title: "Le phare", goals: { total: 80000, daily: 0 } } }, store, fr);
    expect(state.title).toBe("Le phare");
    expect(state.goals).toEqual({ total: 80000 });
  });
});
