// @vitest-environment happy-dom
// Statut d'une scène : `fiche.statut` (brouillon, revoir, fini), clés jamais traduites, relu et réécrit avec
// la carte ; hors de la liste des champs de la fiche (il a son propre sélecteur) ; en toutes lettres à l'export.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bandFields, ficheText, isSceneStatus, readFiche, sceneStatus } from "../character";
import { cardToFile, fileToCard } from "../storage/markdown";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const state = () => useCosmos.getState();

describe("statut (fonctions pures)", () => {
  it("trois clés, rien d'autre ; seulement pour une Scène", () => {
    expect(["brouillon", "revoir", "fini"].every(isSceneStatus)).toBe(true);
    expect(isSceneStatus("Terminée")).toBe(false);
    expect(readFiche({ statut: "fini", synopsis: "Arrivée." }, "scene")).toEqual({ statut: "fini", synopsis: "Arrivée." });
    expect(readFiche({ statut: "Terminée" }, "scene")).toBeUndefined();
    expect(sceneStatus({ type: "scene", fiche: { statut: "revoir" } })).toBe("revoir");
    expect(sceneStatus({ type: "idee", fiche: { statut: "revoir" } })).toBeNull();
    expect(bandFields({ type: "scene" }).has("statut")).toBe(true);
  });

  it("libellés dans les deux langues, et à l'export", () => {
    expect(Object.keys(fr.sceneStatus.values)).toEqual(Object.keys(en.sceneStatus.values));
    expect(ficheText("statut", "fini", fr.sceneStatus.values)).toBe("Terminée");
  });

  it("écrit et relu avec la carte", () => {
    const text = cardToFile({ id: "s1", type: "scene", title: "Arrivée", html: "", fiche: { statut: "revoir" } });
    expect(text).toContain('"statut":"revoir"');
    expect(fileToCard(text)?.fiche).toEqual({ statut: "revoir" });
  });
});

describe("dans le projet", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Phare", kind: "roman" });
  });
  afterEach(() => useSettings.setState({ lang: "en" }));

  it("changer le statut est annulable ; vide, il disparaît de la fiche", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().setFiche(id, "statut", "fini");
    expect(sceneStatus(state().nodes.find((n) => n.id === id)!.data)).toBe("fini");
    state().undo();
    expect(sceneStatus(state().nodes.find((n) => n.id === id)!.data)).toBeNull();
    state().setFiche(id, "statut", "revoir");
    state().setFiche(id, "statut", "");
    expect(state().nodes.find((n) => n.id === id)!.data.fiche?.statut).toBeUndefined();
  });
});
