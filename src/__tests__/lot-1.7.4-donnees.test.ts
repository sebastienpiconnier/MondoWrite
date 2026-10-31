// @vitest-environment happy-dom
// Lot 1.7.4, zone « données » : historique d'annulation, mentions qui suivent les renommages, corbeille,
// typographie dans les adresses, filtres et mise en avant du canevas. Un test par défaut relevé par l'audit.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { EMPTY_PLAN } from "../plan";
import { NO_FILTER } from "../canvasFilter";
import { mentionHtml } from "../mentions";
import { toProject, frameBox } from "../projectState";
import { smartType, NNBSP } from "../typography";
import { bookWords, presenceIn } from "../manuscript";
import { richTextExtensions } from "../components/editorKit";
import { MentionNode } from "../components/MentionNode";
import { SceneMark } from "../components/bookExtensions";
import { composeBook } from "../bookDoc";
import type { CardData } from "../types";

const state = () => useCosmos.getState();
const card = (id: string) => state().nodes.find((n) => n.id === id)!.data;

async function fresh(kind: "roman" | "scenario" = "roman") {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, trash: [], lastFiles: {}, past: [], future: [], filter: NO_FILTER, spotlightId: null });
  await state().start();
  await state().createProject({ title: "Kerlaouen", kind });
}

const PNG = { name: "phare.png", data: new Uint8Array([137, 80, 78, 71]) };

describe("point 5 : une image ou un document posés sur une carte font une seule étape d'historique", () => {
  const realWrite = storage.writeMedia;
  afterEach(() => {
    storage.writeMedia = realWrite;
  });
  beforeEach(() => fresh());

  it("addImageCard : une étape, la carte naît avec son image ; un échec de copie ne défait rien d'autre", async () => {
    const other = state().addTitledCard("idee", "Garde-moi");
    const past = state().past.length;
    const id = await state().addImageCard({ x: 600, y: 0 }, PNG);
    expect(id).not.toBeNull();
    expect(card(id!).image).toMatch(/\.png$/);
    expect(state().past.length).toBe(past + 1);
    state().undo();
    expect(state().nodes.some((n) => n.id === id)).toBe(false);
    expect(state().nodes.some((n) => n.id === other)).toBe(true);

    storage.writeMedia = async () => {
      throw new Error("disque plein");
    };
    const before = state().past.length;
    expect(await state().addImageCard({ x: 600, y: 0 }, PNG)).toBeNull();
    expect(state().past.length).toBe(before);
    expect(state().nodes.some((n) => n.id === other)).toBe(true);
  });

  it("turnIntoImage : image et type en une étape", async () => {
    const id = state().addCard({ x: 0, y: 0 });
    const past = state().past.length;
    expect(await state().turnIntoImage(id, PNG)).toBe(true);
    expect(card(id).type).toBe("image");
    expect(state().past.length).toBe(past + 1);
    state().undo();
    expect(card(id).type).toBe("idee");
    expect(card(id).image).toBeUndefined();
  });

  it("setCardDocument : une étape", async () => {
    const id = state().addTitledCard("idee", "Rapport");
    const past = state().past.length;
    expect(await state().setCardDocument(id, { name: "rapport.pdf", data: new Uint8Array([37, 80, 68, 70]) })).toBe(true);
    expect(card(id).type).toBe("document");
    expect(state().past.length).toBe(past + 1);
    state().undo();
    expect(card(id).type).toBe("idee");
  });
});

describe("point 6 : une scène à la corbeille garde sa case et son chapitre après une relance", () => {
  beforeEach(() => fresh());

  it("le plan écrit cite encore les scènes de la corbeille", () => {
    state().setPlanTemplate("troisActes");
    const a = state().addPlanScene("A", "a_incident");
    state().addPlanScene("B", "a_incident");
    state().deleteCard(a);
    const meta = toProject(state()).meta as { plan?: { beats: Record<string, string[]> } };
    expect(meta.plan?.beats.a_incident).toContain(a);
    state().purgeTrash(a);
    const after = toProject(state()).meta as { plan?: { beats: Record<string, string[]> } };
    expect(after.plan?.beats.a_incident).not.toContain(a);
  });
});

describe("point 7 : un fil cliqué puis laissé ne modifie rien", () => {
  beforeEach(() => fresh());

  it("même étiquette : ni étape ni projet modifié", async () => {
    const a = state().addCard({ x: 0, y: 0 });
    const b = state().addCard({ x: 600, y: 0 });
    state().linkCards(a, b, "aime");
    await state().save();
    expect(state().status).toBe("enregistre");
    const past = state().past.length;
    state().renameLink(state().edges[0].id, "aime");
    expect(state().past.length).toBe(past);
    expect(state().status).toBe("enregistre");
    state().renameLink(state().edges[0].id, "déteste");
    expect(state().past.length).toBe(past + 1);
  });
});

describe("point 8 : la typographie ne touche pas une adresse ni du code", () => {
  it("? ! -- et ... restent tels quels dans une adresse", () => {
    expect(smartType("https://exemple.fr/page", "?", "fr")).toBeNull();
    expect(smartType("www.exemple.fr", "!", "fr")).toBeNull();
    expect(smartType("exemple.fr/a-", "-", "fr")).toBeNull();
    expect(smartType("http://exemple.fr/a.", ".", "fr")).toBeNull();
    expect(smartType("Voir `ls -", "-", "fr")).toBeNull();
    expect(smartType("jean@site.fr", "?", "fr")).toBeNull();
  });
  it("le texte ordinaire garde sa typographie", () => {
    expect(smartType("Vraiment", "?", "fr")).toEqual({ remove: 0, insert: `${NNBSP}?` });
    expect(smartType("-", "-", "fr")).toEqual({ remove: 1, insert: "—" });
    expect(smartType("Fin. Et", "!", "fr")).toEqual({ remove: 0, insert: `${NNBSP}!` });
  });
});

describe("points 9 et 10 : les mentions suivent les renommages et la corbeille, manuscrit compris", () => {
  it("scénario : renommer l'en-tête renomme les mentions de la scène", async () => {
    await fresh("scenario");
    const scene = state().addResearchCard({ title: "INT. PHARE - NUIT", html: "", type: "scene" });
    const note = state().addTitledCard("idee", "Note");
    state().updateCard(note, { html: `<p>Voir ${mentionHtml(scene, "INT. PHARE - NUIT")}</p>` });
    const sp = state().screenplay!;
    const elements = sp.elements.map((e) => (e.type === "sceneHeading" && e.cardId === scene ? { ...e, text: "EXT. PHARE - JOUR" } : e));
    state().setScreenplay({ ...sp, elements });
    expect(card(scene).title).toBe("EXT. PHARE - JOUR");
    expect(card(note).html).toContain("@EXT. PHARE - JOUR");
  });

  it("roman : renommer une carte renomme ses mentions dans le manuscrit, la corbeille les rend au texte", async () => {
    await fresh("roman");
    const ines = state().addTitledCard("personnage", "Inès");
    const scene = state().addTitledCard("scene", "Le phare");
    state().setManuscriptText(scene, `<p>Arrive ${mentionHtml(ines, "Inès")}.</p>`);
    state().updateCard(ines, { title: "Inès Morvan" });
    expect(state().manuscript[scene]).toContain(mentionHtml(ines, "Inès Morvan"));
    // Annuler le renommage : le manuscrit (hors historique) reprend le titre de l'étape.
    state().undo();
    expect(card(ines).title).toBe("Inès");
    expect(state().manuscript[scene]).toContain(mentionHtml(ines, "Inès"));
    state().deleteCard(ines);
    expect(state().manuscript[scene]).toBe("<p>Arrive @Inès.</p>");
  });
});

describe("point 11 : une scène lâchée dans une case fait une seule étape", () => {
  beforeEach(() => fresh());

  it("déplacement et rangement s'annulent ensemble", () => {
    state().setPlanTemplate("troisActes");
    const a = state().addPlanScene("A", "a_setup");
    state().addPlanScene("B", "a_incident");
    state().organizeCanvas();
    const target = state().frames.find((f) => f.data.beat === "a_incident")!;
    const box = frameBox(target);
    const from = { ...state().nodes.find((n) => n.id === a)!.position };
    const past = state().past.length;
    state().onNodesChange([{ type: "position", id: a, position: { x: box.x + 30, y: box.y + 110 }, dragging: false }]);
    expect(state().plan.beats.a_incident).toContain(a);
    expect(state().past.length).toBe(past + 1);
    state().undo();
    expect(state().plan.beats.a_setup).toContain(a);
    expect(state().plan.beats.a_incident ?? []).not.toContain(a);
    expect(state().nodes.find((n) => n.id === a)!.position).toEqual(from);
  });
});

describe("points 12 et 13 : filtre et mise en avant", () => {
  beforeEach(() => fresh());

  it("montrer une carte masquée par le filtre retire le filtre", () => {
    const lieu = state().addTitledCard("lieu", "Phare");
    state().addTitledCard("idee", "Idée");
    state().setFilterTypes(["lieu"]);
    state().revealCard(lieu);
    expect(state().filter).toEqual(NO_FILTER);
    expect(state().spotlightId).toBe(lieu);
  });

  it("la carte mise en avant part à la corbeille : plus rien d'estompé", () => {
    const a = state().addTitledCard("idee", "A");
    state().addTitledCard("idee", "B");
    state().revealCard(a);
    state().deleteCard(a);
    expect(state().spotlightId).toBeNull();
  });
});

describe("point 16 : une mention dans le texte du livre survit à la frappe", () => {
  let editor: Editor | undefined;
  afterEach(() => editor?.destroy());

  it("le schéma du livre garde le nœud de mention", () => {
    const blocks = [{ id: "s1scene000" }] as Parameters<typeof composeBook>[0];
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [...richTextExtensions({ link: false, prose: true }), MentionNode, SceneMark],
      content: composeBook(blocks, { s1scene000: `<p>Voici ${mentionHtml("ines000001", "Inès")} au phare.</p>` }),
    });
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, "!");
    expect(editor.getHTML()).toContain(mentionHtml("ines000001", "Inès"));
  });
});

describe("points 20 et 23 : rang des scènes et volume du livre", () => {
  const cards = (list: Partial<CardData>[]) => list.map((c, i) => ({ id: `c${i}`, type: "scene", title: "", html: "", ...c }) as CardData);

  it("« dès la scène N » ne compte pas les pages du livre", () => {
    const ines = { id: "p", type: "personnage", title: "Inès", html: "" } as CardData;
    const manuscript = { titre: "<p>Kerlaouen</p>", dedi: "<p>Pour Inès</p>", s1: "<p>La mer.</p>", s2: "<p>Inès arrive.</p>" };
    const seen = presenceIn(ines, manuscript, ["titre", "dedi", "s1", "s2"], new Set(["titre", "dedi"]));
    expect(seen.count).toBe(2);
    expect(seen.first).toBe("s2");
    expect(seen.scene).toBe(2);
  });

  it("le volume ne compte que les scènes qui ont une carte", () => {
    const manuscript = { c0: "<p>un deux trois</p>", orphelin: "<p>quatre cinq</p>", c1: "<p>six</p>" };
    expect(bookWords(manuscript, cards([{}, { type: "idee" }]))).toBe(3);
  });
});
