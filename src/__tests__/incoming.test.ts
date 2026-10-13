// @vitest-environment happy-dom
// Ce qui arrive sur le canevas (collé, déposé, menu « Nouvelle carte ») devient une carte adaptée :
// en-tête de scène, intertitre, fichier texte, adresse d'une image, adresse tapée dans une carte Lien.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../web", () => ({
  readPage: async () => {
    throw new Error("hors ligne");
  },
  fetchImage: async (url: string) => (url.includes("ok") ? { name: "page.jpg", data: new Uint8Array([1, 2, 3]) } : null),
}));
import { cardFromTextFile, clipFromText } from "../clip";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { cardToFile } from "../storage/markdown";
import { serialize } from "../screenplay/serialize";

const state = () => useCosmos.getState();
const card = (id: string | null) => state().nodes.find((n) => n.id === id)!.data;
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("texte collé : le type de carte reconnu", () => {
  it("un en-tête de scène fait une Scène, la suite devient son texte (pas une citation)", () => {
    expect(clipFromText("INT. PHARE, LANTERNE - NUIT\nInès allume la lampe.")).toEqual({ title: "INT. PHARE, LANTERNE - NUIT", markdown: "Inès allume la lampe.", type: "scene" });
    expect(clipFromText("EXT. FALAISE - JOUR")?.type).toBe("scene");
    expect(clipFromText("Intérieur du phare, il fait froid.")?.type).toBeUndefined();
  });

  it("un intertitre Markdown devient le titre, le reste reste cité", () => {
    expect(clipFromText("# Le phare d'Ar-Men\nConstruit en mer.")).toEqual({ title: "Le phare d'Ar-Men", markdown: "> Construit en mer." });
    expect(clipFromText("Un texte sans titre")).toEqual({ title: "", markdown: "> Un texte sans titre" });
  });

  it("l'adresse d'une image est signalée, requête comprise", () => {
    expect(clipFromText("https://upload.wikimedia.org/phare.jpg")).toMatchObject({ url: "https://upload.wikimedia.org/phare.jpg", image: true });
    expect(clipFromText("https://x.fr/photo.PNG?w=800#top")?.image).toBe(true);
    expect(clipFromText("https://x.fr/article")?.image).toBeUndefined();
  });
});

describe("fichier texte déposé", () => {
  it("une carte de MondoWrite garde son type, son titre et sa fiche", () => {
    const file = cardToFile({ id: "k3x9a7bq2m", type: "personnage", title: "Inès Morvan", html: "<p>Gardienne remplaçante.</p>", fiche: { age: "34 ans" } });
    expect(cardFromTextFile("k3x9a7bq2m.md", file)).toEqual({ type: "personnage", title: "Inès Morvan", markdown: "Gardienne remplaçante.", fiche: { age: "34 ans" } });
  });

  it("une note sans en-tête : titre du premier intertitre, sinon du nom du fichier", () => {
    expect(cardFromTextFile("note.md", "# Le phare\n\nDes notes.")).toEqual({ type: "idee", title: "Le phare", markdown: "Des notes." });
    expect(cardFromTextFile("idees_en-vrac.txt", "Une idée.\nUne autre.")).toEqual({ type: "idee", title: "idees en vrac", markdown: "Une idée.\nUne autre." });
    expect(cardFromTextFile("scene.txt", "INT. PHARE - NUIT\nLa lampe tourne.")).toEqual({ type: "scene", title: "INT. PHARE - NUIT", markdown: "La lampe tourne." });
  });

  it("une note Obsidian : `title` et `type` reconnus, un type inconnu donne une Idée ; un fichier vide, rien", () => {
    expect(cardFromTextFile("a.md", "---\ntitle: 'Le Goff'\ntype: personnage\ntags: [x]\n---\nPêcheur.")).toMatchObject({ type: "personnage", title: "Le Goff", markdown: "Pêcheur." });
    expect(cardFromTextFile("a.md", "---\ntype: recette\n---\nTexte")).toMatchObject({ type: "idee", title: "a" });
    expect(cardFromTextFile("vide.md", "  \n")).toBeNull();
  });
});

describe("dans le projet", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
  });
  afterEach(() => useSettings.setState({ lang: "en" }));

  it("un fichier texte devient une carte du bon type, fiche filtrée selon le type", async () => {
    await state().createProject({ title: "K", kind: "roman" });
    const id = state().addTextFile("ines.md", "---\ntitle: Inès\ntype: personnage\nfiche: {\"age\":\"34 ans\",\"inconnu\":\"x\"}\n---\nGardienne ==à reprendre==.", { x: 0, y: 0 });
    expect(card(id)).toMatchObject({ type: "personnage", title: "Inès", fiche: { age: "34 ans" } });
    expect(card(id).fiche).not.toHaveProperty("inconnu");
    expect(card(id).html).toContain("<mark>");
    // Une étape d'historique.
    state().undo();
    expect(state().nodes.some((n) => n.id === id)).toBe(false);
  });

  it("scénario : une Scène collée entre aussitôt dans le texte du scénario", async () => {
    await state().createProject({ title: "K", kind: "scenario" });
    const id = state().addResearchClip("INT. PHARE - NUIT\nLa lampe tourne.", { x: 0, y: 0 });
    expect(card(id)).toMatchObject({ type: "scene", title: "INT. PHARE - NUIT" });
    expect(serialize(state().screenplay!)).toContain(`INT. PHARE - NUIT [[cosmos:${id}]]`);
  });

  it("l'adresse d'une image : une carte Image si elle se télécharge, sinon un Lien", async () => {
    await state().createProject({ title: "K", kind: "roman" });
    const ok = state().addResearchClip("https://x.fr/ok/phare.jpg", { x: 0, y: 0 });
    await settle();
    expect(card(ok)).toMatchObject({ type: "image", fiche: { url: "https://x.fr/ok/phare.jpg" } });
    expect(card(ok).image).toMatch(/\.jpg$/);
    const ko = state().addResearchClip("https://x.fr/absente.jpg", { x: 600, y: 0 });
    await settle();
    expect(card(ko)).toMatchObject({ type: "lien", fiche: { url: "https://x.fr/absente.jpg" } });
    // Une image glissée depuis une page, sans extension : signalée par le dépôt.
    const drag = state().addResearchClip("https://x.fr/ok/img?id=3", { x: 1200, y: 0 }, true);
    await settle();
    expect(card(drag).type).toBe("image");
  });

  it("menu « Nouvelle carte », Lien : une adresse tapée dans le titre devient son lien", async () => {
    await state().createProject({ title: "K", kind: "roman" });
    const id = state().addCard({ x: 0, y: 0 }, "lien");
    state().updateCard(id, { title: "Pas une adresse" });
    expect(state().linkFromTitle(id)).toBe(false);
    state().updateCard(id, { title: "https://www.gallica.bnf.fr/ark" });
    expect(state().linkFromTitle(id)).toBe(true);
    expect(card(id)).toMatchObject({ type: "lien", title: "gallica.bnf.fr", fiche: { url: "https://www.gallica.bnf.fr/ark" } });
    // Déjà un lien : rien ne change.
    expect(state().linkFromTitle(id)).toBe(false);
  });
});
