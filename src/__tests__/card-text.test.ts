// @vitest-environment happy-dom
// Le texte d'une carte ne se perd jamais : collé sur une carte, carte qui devient Scène ou qui cesse de l'être,
// et copier-coller de cartes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { htmlParagraphs, notesAreSceneText, sceneBodyHtml, sceneToNotes, textElements, textToHtml, withoutLeadingSynopsis } from "../cardText";
import { copyBounds, copyText, isCardCopy, pasteCopy, type CardCopy } from "../cardClipboard";
import { headingOf, sceneBody } from "../screenplay/sceneText";

const state = () => useCosmos.getState();
const card = (id: string) => state().nodes.find((n) => n.id === id)!.data;
const LONG = "<p>Inès monte l’escalier du phare.</p><p>La lampe tourne au-dessus d’elle.</p>";

async function project(kind: "roman" | "scenario") {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [], cardCopy: null });
  await state().start();
  await state().createProject({ title: "Phare", kind });
}
afterEach(() => useSettings.setState({ lang: "en" }));

describe("fonctions pures", () => {
  it("texte collé : un paragraphe par ligne, échappé ; Markdown reconnu", () => {
    expect(textToHtml("Un <b>\n\nDeux")).toBe("<p>Un &lt;b&gt;</p><p>Deux</p>");
    expect(textToHtml("**gras**")).toContain("<strong>gras</strong>");
    expect(textToHtml("   ")).toBe("");
  });
  it("une ligne courte reste un synopsis, plusieurs paragraphes ou un long passage sont le texte de la scène", () => {
    expect(notesAreSceneText("<p>Inès arrive.</p>")).toBe(false);
    expect(notesAreSceneText(LONG)).toBe(true);
    expect(notesAreSceneText(`<p>${"mot ".repeat(100)}</p>`)).toBe(true);
    expect(notesAreSceneText("")).toBe(false);
  });
  it("une Scène qui devient Idée : synopsis en italique puis texte", () => {
    expect(sceneToNotes("", "Arrivée.", "<p>Texte.</p>")).toBe("<p><em>Arrivée.</em></p><p>Texte.</p>");
    expect(withoutLeadingSynopsis("<p><em>Arrivée.</em></p><p>Texte.</p>", "Arrivée.")).toBe("<p>Texte.</p>");
    expect(withoutLeadingSynopsis("<p>Autre.</p>", "Arrivée.")).toBe("<p>Autre.</p>");
  });
  it("scénario : notes en éléments Fountain et retour", () => {
    expect(htmlParagraphs("<p>A</p><ul><li><p>B</p></li></ul>")).toEqual(["A", "B"]);
    const els = textElements("<p>Inès entre.</p><p>INÈS</p><p>Il y a quelqu’un ?</p>");
    expect(els.map((e) => e.type)).toEqual(["action", "character", "dialogue"]);
    expect(sceneBodyHtml(els)).toBe("<p>Inès entre.</p><p><strong>INÈS</strong></p><p>Il y a quelqu’un ?</p>");
  });
  it("copie de cartes : texte lisible, disposition gardée, identifiants neufs, fils entre elles", () => {
    const copy: CardCopy = {
      cards: [
        { data: { id: "a", type: "personnage", title: "Inès", html: "<p>Gardienne.</p>" }, x: 100, y: 100 },
        { data: { id: "b", type: "lieu", title: "Phare", html: "" }, x: 400, y: 160 },
      ],
      links: [{ source: "a", target: "b", label: "habite" }],
      text: "",
    };
    copy.text = copyText(copy.cards);
    expect(copy.text).toBe("Inès\n\nGardienne.\n\nPhare");
    expect(isCardCopy(copy, "Inès\r\n\r\nGardienne.\n\nPhare ")).toBe(true);
    expect(isCardCopy(copy, "autre chose")).toBe(false);
    expect(copyBounds(copy.cards)).toEqual({ x: 100, y: 100, width: 540, height: 210 });
    let n = 0;
    const pasted = pasteCopy(copy, { x: 0, y: 0 }, () => `n${++n}`);
    expect(pasted.cards.map((c) => [c.data.id, c.x, c.y])).toEqual([["n1", 0, 0], ["n2", 300, 60]]);
    expect(pasted.links).toEqual([{ source: "n1", target: "n2", label: "habite" }]);
  });
});

describe("roman", () => {
  beforeEach(() => project("roman"));

  it("un long texte dans une Idée qui devient Scène devient le texte de la scène, pas son synopsis", () => {
    const id = state().addCard({ x: 0, y: 0 });
    state().updateCard(id, { html: LONG });
    state().updateCard(id, { type: "scene" });
    expect(card(id).html).toBe("");
    expect(card(id).fiche?.synopsis).toBeUndefined();
    expect(state().manuscript[id]).toBe(LONG);
  });

  it("une Scène qui devient Idée garde son synopsis et son texte dans ses notes ; retour sans doublon", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().setFiche(id, "synopsis", "Arrivée au phare.");
    state().setManuscriptText(id, LONG);
    state().updateCard(id, { type: "idee" });
    expect(card(id).html).toBe(`<p><em>Arrivée au phare.</em></p>${LONG}`);
    expect(state().manuscript[id]).toBeUndefined();
    state().updateCard(id, { type: "scene" });
    expect(state().manuscript[id]).toBe(LONG);
    expect(card(id).html).toBe("");
  });

  it("texte collé sur une carte : à la fin de ses notes, ou du texte de la scène ; jamais une nouvelle carte", () => {
    const idea = state().addCard({ x: 0, y: 0 });
    state().updateCard(idea, { html: "<p>Début.</p>" });
    const scene = state().addCard({ x: 400, y: 0 }, "scene");
    const count = state().nodes.length;
    state().pasteIntoCard(idea, "Suite.");
    state().pasteIntoCard(scene, "Elle monte.\nLa lampe tourne.");
    expect(state().nodes.length).toBe(count);
    expect(card(idea).html).toBe("<p>Début.</p><p>Suite.</p>");
    expect(state().manuscript[scene]).toBe("<p>Elle monte.</p><p>La lampe tourne.</p>");
  });

  it("copier-coller et dupliquer : cartes neuves, texte de la scène, fils ; une étape d'annulation", () => {
    const a = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(a, { title: "Arrivée" });
    state().setManuscriptText(a, LONG);
    const b = state().addCard({ x: 400, y: 0 }, "personnage");
    state().linkCards(a, b, "");
    expect(state().copyCards([a, b])).toContain("Arrivée");
    const made = state().pasteCards({ x: 0, y: 600 });
    expect(made).toHaveLength(2);
    expect(made.some((id) => id === a || id === b)).toBe(false);
    expect(state().manuscript[made[0]]).toBe(LONG);
    expect(state().edges.some((e) => e.source === made[0] && e.target === made[1])).toBe(true);
    state().undo();
    expect(state().nodes.some((n) => made.includes(n.id))).toBe(false);
    const dup = state().duplicateCards([b]);
    expect(card(dup[0])).toMatchObject({ type: "personnage" });
    // Dupliquer ne remplace pas la copie en cours.
    expect(state().cardCopy?.cards).toHaveLength(2);
  });
});

describe("scénario", () => {
  beforeEach(() => project("scenario"));

  it("une Scène qui devient Idée garde son texte ; le scénario aussi", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    const sp = state().screenplay!;
    const at = headingOf(sp.elements, id);
    state().setSceneText(id, textElements("<p>Inès entre.</p>"));
    expect(sceneBody(state().screenplay!.elements, at)).toHaveLength(1);
    state().updateCard(id, { type: "idee" });
    expect(card(id).html).toContain("Inès entre.");
  });

  it("un long texte collé sur une Scène entre dans son corps", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    state().pasteIntoCard(id, "Inès entre.\n\nINÈS\nIl y a quelqu’un ?");
    const body = sceneBody(state().screenplay!.elements, headingOf(state().screenplay!.elements, id));
    expect(body.map((e) => e.type)).toEqual(["action", "character", "dialogue"]);
  });
});
