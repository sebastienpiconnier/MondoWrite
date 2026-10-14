// @vitest-environment happy-dom
// Roman : le corps d'une carte Scène est son manuscrit. Les notes qu'elle portait passent dans son synopsis
// (à l'ouverture, en devenant Scène, en revenant au roman) ; on écrit la scène dans la carte agrandie.

import { serialize } from "../screenplay/serialize";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { cardPath, storage } from "../storage";
import { cardToFile } from "../storage/markdown";
import { foldNovelNotes, mergeSynopsis, notesLine } from "../sceneNotes";
import { draftExcerpt, draftPlaceholder } from "../components/SceneDraft";
import { fr } from "../i18n/fr";

const state = () => useCosmos.getState();
const card = (id: string) => state().nodes.find((n) => n.id === id)!.data;

beforeEach(async () => {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
  await state().start();
  await state().createProject({ title: "Phare", kind: "roman" });
});
afterEach(() => useSettings.setState({ lang: "en" }));

describe("notes d'une scène → synopsis (fonctions pures)", () => {
  it("en une ligne, à la suite du synopsis existant, sans doublon", () => {
    expect(notesLine("<p>Elle arrive.</p><ul><li><p>vérifier la marée</p></li></ul>")).toBe("Elle arrive. vérifier la marée");
    expect(mergeSynopsis("Arrivée au phare.", "La tempête monte.")).toBe("Arrivée au phare. La tempête monte.");
    expect(mergeSynopsis(undefined, "La tempête monte.")).toBe("La tempête monte.");
    expect(mergeSynopsis("La tempête monte.", "La tempête monte.")).toBe("La tempête monte.");
  });

  it("seulement les Scènes ; même objet quand il n'y a rien à déplacer", () => {
    const idea = { id: "a", type: "idee" as const, title: "", html: "<p>Note</p>" };
    expect(foldNovelNotes(idea)).toBe(idea);
    const empty = { id: "b", type: "scene" as const, title: "", html: "" };
    expect(foldNovelNotes(empty)).toBe(empty);
    expect(foldNovelNotes({ id: "c", type: "scene", title: "", html: "<p>Nuit.</p>", fiche: { synopsis: "Arrivée." } })).toMatchObject({ html: "", fiche: { synopsis: "Arrivée. Nuit." } });
  });
});

describe("dans le projet", () => {
  it("une Idée qui devient Scène range ses notes dans son synopsis ; annuler les rend", () => {
    const id = state().addCard({ x: 0, y: 0 });
    state().updateCard(id, { html: "<p>Inès découvre le cahier.</p>" });
    state().updateCard(id, { type: "scene" });
    expect(card(id)).toMatchObject({ html: "", fiche: { synopsis: "Inès découvre le cahier." } });
    state().undo();
    expect(card(id)).toMatchObject({ type: "idee", html: "<p>Inès découvre le cahier.</p>" });
  });

  it("à l'ouverture d'un ancien roman, les notes des scènes passent dans le synopsis, le manuscrit ne bouge pas", async () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().setManuscriptText(id, "<p>Le phare est froid.</p>");
    await state().save();
    // Fichier écrit par une version d'avant : la scène a des notes dans son corps.
    const files = await storage.readAll();
    await storage.write({ ...files!, [cardPath(id)]: cardToFile({ ...card(id), html: "<p>Elle trouve le cahier.</p>" }) }, []);
    await state().closeProject();
    await state().openProject(state().projects[0].id);
    expect(card(id)).toMatchObject({ html: "", fiche: { synopsis: "Elle trouve le cahier." } });
    expect(state().manuscript[id]).toBe("<p>Le phare est froid.</p>");
  });

  it("retour au roman : les notes des scènes d'un scénario vont aussi dans leur synopsis", () => {
    state().setKind("scenario");
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { html: "<p>Orage.</p>" });
    expect(card(id).html).toBe("<p>Orage.</p>");
    state().setKind("roman");
    expect(card(id)).toMatchObject({ html: "", fiche: { synopsis: "Orage." } });
  });
});

describe("passage en scénario", () => {
  it("le synopsis d'une scène de roman devient la ligne « = … » sous son en-tête", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT", fiche: { synopsis: "Inès arrive." } });
    state().setKind("scenario");
    expect(serialize(state().screenplay!)).toContain("= Inès arrive.");
  });
});

describe("aperçu et filigrane", () => {
  it("l'aperçu coupe à un mot ; le synopsis sert de texte indicatif", () => {
    const long = `<p>${"mot ".repeat(200)}</p>`;
    const excerpt = draftExcerpt(long, 50);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(51);
    expect(draftExcerpt("<p>Court.</p>")).toBe("Court.");
    expect(draftPlaceholder({ id: "s", type: "scene", title: "", html: "", fiche: { synopsis: "Elle arrive." } })).toBe("Elle arrive.");
    expect(draftPlaceholder({ id: "s", type: "scene", title: "", html: "" })).toBe(fr.manuscript.placeholder);
  });
});
