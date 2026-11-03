// @vitest-environment happy-dom
// Série écrite épisode par épisode (docs/plan-episodes.md, lot 1) : le store et le stockage navigateur.

import { beforeEach, describe, expect, it } from "vitest";
import { SCENE_AT, currentScript, scriptOffset, useCosmos } from "../store";
import { META_FILE, SCREENPLAY_FILE, cardPath, episodePath, type FileMap } from "../storage";
import { episodeIds, episodeOfCard, isSeason } from "../screenplay/season";

const KEY = "cosmos:projet-demo";
const disk = (): FileMap => JSON.parse(localStorage.getItem(KEY) ?? "{}");
const state = () => useCosmos.getState();
const cardFile = (id: string, type: string, title: string, fiche?: Record<string, string>) =>
  `---\nid: ${id}\ntype: ${type}\ntitle: ${JSON.stringify(title)}\n${fiche ? `fiche: ${JSON.stringify(fiche)}\n` : ""}---\n\n`;

// Écrit comme par un autre logiciel : relu sans changement, il doit rester tel quel à l'octet près.
const pilotFountain = "Title:   Le Phare\n\n\nINT. PHARE - NUIT [[cosmos:s1]]\n\nLa lampe est froide.\n";

function project(extra: FileMap = {}, meta: Record<string, unknown> = {}): FileMap {
  return {
    [META_FILE]: JSON.stringify({
      version: 1,
      title: "Le Phare",
      kind: "scenario",
      paper: "a4",
      layout: [
        { id: "e1", x: 0, y: 0 },
        { id: "e2", x: 300, y: 0 },
        { id: "s1", x: 0, y: 300 },
      ],
      links: [],
      ...meta,
    }),
    [cardPath("e1")]: cardFile("e1", "episode", "Le signal", { numero: "1" }),
    [cardPath("e2")]: cardFile("e2", "episode", "Tempête", { numero: "2" }),
    [cardPath("s1")]: cardFile("s1", "scene", "INT. PHARE - NUIT"),
    [SCREENPLAY_FILE]: pilotFountain,
    ...extra,
  };
}

const put = (files: FileMap) => localStorage.setItem(KEY, JSON.stringify(files));
const action = (text: string) => ({ type: "action" as const, text });

beforeEach(() => {
  localStorage.clear();
  useCosmos.setState({ loaded: false, lastFiles: {}, screenplay: null, savedScreenplay: null, currentEpisode: null, nodes: [], edges: [], trash: [], paperChosen: false });
});

describe("série écrite par épisode", () => {
  it("un scénario sans texte d'épisode reste un seul texte", async () => {
    put(project());
    await state().load();
    expect(isSeason(state().screenplay)).toBe(false);
    expect(state().currentEpisode).toBeNull();
    expect(currentScript(state())).toBe(state().screenplay);
  });

  it("le premier épisode ouvert reçoit le texte déjà écrit, le suivant un texte neuf", async () => {
    put(project());
    await state().load();
    // Le texte déjà écrit va au premier épisode de la série, même si l'on ouvre le deuxième.
    state().openEpisode("e2");
    expect(episodeIds(state().screenplay)).toEqual(["e1", "e2"]);
    expect(state().currentEpisode).toBe("e2");
    expect(currentScript(state())!.elements).toEqual([]);
    expect(currentScript(state())!.titlePage).toEqual({ Title: "Le Phare" });
    expect(episodeOfCard(state().screenplay, "s1")).toBe("e1");

    state().setScript({ ...currentScript(state())!, elements: [{ type: "sceneHeading", text: "EXT. PORT - JOUR" }, action("Les bateaux rentrent.")] });
    await state().save();
    const files = disk();
    // Le premier épisode n'a pas changé : son fichier reste tel qu'il était écrit.
    expect(files[SCREENPLAY_FILE]).toBe(pilotFountain);
    expect(files[episodePath("e2")]).toContain("Les bateaux rentrent.");
    expect(JSON.parse(files[META_FILE]).pilot).toBe("e1");
  });

  it("relit la saison, rouvre le premier épisode, et garde intact un épisode qu'on ne touche pas", async () => {
    put(project({ [episodePath("e2")]: "Title: Le Phare\n\n\nEXT. PORT - JOUR\n\nLes bateaux rentrent.\n" }, { pilot: "e1" }));
    await state().load();
    expect(episodeIds(state().screenplay)).toEqual(["e1", "e2"]);
    expect(state().currentEpisode).toBe("e1");
    expect(state().status).toBe("enregistre");
    // On écrit dans le premier épisode : seul son fichier change.
    const script = currentScript(state())!;
    state().setScript({ ...script, elements: [...script.elements, action("Inès monte l'escalier.")] });
    await state().save();
    expect(disk()[SCREENPLAY_FILE]).toContain("Inès monte l'escalier.");
    expect(disk()[episodePath("e2")]).toBe("Title: Le Phare\n\n\nEXT. PORT - JOUR\n\nLes bateaux rentrent.\n");
  });

  it("une scène renommée dans un autre épisode y reste, sans entrer dans l'épisode ouvert", async () => {
    put(project({}, {}));
    await state().load();
    state().openEpisode("e2");
    state().updateCard("s1", { title: "INT. PHARE, LANTERNE - NUIT" });
    expect(episodeOfCard(state().screenplay, "s1")).toBe("e1");
    expect(currentScript(state())!.elements.some((el) => el.cardId === "s1")).toBe(false);
    // Une nouvelle carte Scène titrée entre dans l'épisode ouvert.
    const id = state().addCard({ x: 0, y: 600 }, "scene");
    state().updateCard(id, { title: "EXT. PLAGE - AUBE" });
    expect(episodeOfCard(state().screenplay, id)).toBe("e2");
  });

  it("aller à une scène d'un autre épisode ouvre cet épisode", async () => {
    put(project());
    await state().load();
    state().openEpisode("e2");
    state().openInManuscript("s1");
    expect(state().currentEpisode).toBe("e1");
    state().openEpisode("e2");
    // Un rang du scénario entier mène aussi à son épisode.
    state().openInManuscript(`${SCENE_AT}1`);
    expect(state().currentEpisode).toBe("e1");
    expect(scriptOffset(state())).toBe(1);
  });

  it("une carte Épisode à la corbeille emporte son texte, qui revient avec elle", async () => {
    put(project());
    await state().load();
    state().openEpisode("e2");
    state().setScript({ ...currentScript(state())!, elements: [{ type: "sceneHeading", text: "EXT. PORT - JOUR" }, action("Les bateaux rentrent.")] });
    state().deleteCard("e2");
    expect(episodeIds(state().screenplay)).toEqual(["e1"]);
    // L'épisode ouvert est parti : la vue montre le premier.
    expect(currentScript(state())!.elements.some((el) => el.cardId === "s1")).toBe(true);
    await state().save();
    expect(disk()).not.toHaveProperty(episodePath("e2"));
    expect(disk()["corbeille/e2.md"]).toContain("Les bateaux rentrent.");
    state().restoreFromTrash("e2");
    expect(episodeIds(state().screenplay)).toEqual(["e1", "e2"]);
    state().openEpisode("e2");
    expect(currentScript(state())!.elements.map((el) => el.text)).toContain("Les bateaux rentrent.");
  });

  it("le premier épisode à la corbeille : le suivant prend scenario.fountain, rien n'est perdu", async () => {
    put(project({ [episodePath("e2")]: "EXT. PORT - JOUR\n\nLes bateaux rentrent.\n" }, { pilot: "e1" }));
    await state().load();
    state().deleteCard("e1");
    await state().save();
    expect(disk()[SCREENPLAY_FILE]).toContain("Les bateaux rentrent.");
    expect(disk()).not.toHaveProperty(episodePath("e2"));
    expect(JSON.parse(disk()[META_FILE]).pilot).toBe("e2");
    expect(disk()["corbeille/e1.md"]).toContain("La lampe est froide.");
  });

  it("annuler après avoir ouvert un épisode ne casse rien", async () => {
    put(project());
    await state().load();
    state().openEpisode("e2");
    state().undo();
    expect(isSeason(state().screenplay)).toBe(false);
    // L'épisode ouvert n'existe plus : la vue montre tout le scénario.
    expect(currentScript(state())).toBe(state().screenplay);
  });
});
