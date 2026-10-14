// @vitest-environment happy-dom
// Scénario : une carte Scène créée sur le canevas entre dans le texte ; titre du projet.

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { META_FILE, SCREENPLAY_FILE, storage } from "../storage";
import { appendScene, releaseCard } from "../screenplay/link";
import { blocks } from "../screenplay/sequence";
import { parse } from "../screenplay/parse";
import { serialize } from "../screenplay/serialize";

const state = () => useCosmos.getState();
const fountain = () => serialize(state().screenplay!);
const order = () => blocks(state().screenplay!.elements).map((b) => b.text);

async function newProject(kind: "roman" | "scenario") {
  localStorage.clear();
  useSettings.setState({ lang: "en" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {} });
  await state().start();
  await state().createProject({ title: "Kerlaouen", kind });
}

describe("carte Scène créée sur le canevas (scénario)", () => {
  beforeEach(() => newProject("scenario"));

  it("dès qu'elle a un titre, elle est dans le scénario et le séquencier, à la suite des autres", () => {
    const first = state().addCard({ x: 0, y: 0 }, "scene");
    expect(order()).toEqual([]); // pas de titre, pas encore de scène

    // Le titre se tape lettre à lettre : une seule scène, qui suit la frappe.
    for (const title of ["I", "IN", "INT. PHARE - NUIT"]) state().updateCard(first, { title });
    expect(order()).toEqual(["INT. PHARE - NUIT"]);

    const second = state().addCard({ x: 0, y: 200 }, "scene");
    state().updateCard(second, { title: "EXT. PORT - JOUR" });
    expect(order()).toEqual(["INT. PHARE - NUIT", "EXT. PORT - JOUR"]);
    expect(fountain()).toBe(`Title: Kerlaouen\n\nINT. PHARE - NUIT [[cosmos:${first}]]\n\nEXT. PORT - JOUR [[cosmos:${second}]]\n`);
  });

  it("une carte transformée en Scène par le menu y entre aussi", () => {
    const id = state().addCard({ x: 0, y: 0 });
    state().updateCard(id, { title: "Inès trouve le journal" });
    expect(order()).toEqual([]);
    state().updateCard(id, { type: "scene" });
    expect(order()).toEqual(["Inès trouve le journal"]);
  });

  it("supprimer la carte d'une scène l'envoie à la corbeille avec son texte ; elle en revient", () => {
    const empty = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(empty, { title: "INT. PHARE - NUIT" });
    const written = state().addCard({ x: 0, y: 200 }, "scene");
    state().updateCard(written, { title: "EXT. PORT - JOUR" });
    const sp = state().screenplay!;
    state().setScreenplay({ ...sp, elements: [...sp.elements, { type: "action", text: "Hugo attend." }] });

    state().deleteCard(empty);
    expect(order()).toEqual(["EXT. PORT - JOUR"]);
    state().deleteCard(written);
    expect(fountain()).toBe("Title: Kerlaouen\n");
    expect(state().trash.map((c) => c.id)).toEqual([written, empty]);
    state().restoreFromTrash(written);
    expect(fountain()).toBe(`Title: Kerlaouen\n\nEXT. PORT - JOUR [[cosmos:${written}]]\n\nHugo attend.\n`);
    state().undo();
    expect(fountain()).toBe("Title: Kerlaouen\n");
  });

  it("des notes données à une scène reliée vont dans son synopsis, jamais dans son texte", () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    state().updateCard(id, { html: "<p>Elle trouve le journal.</p>" });
    expect(serialize(state().screenplay!)).toContain("= Elle trouve le journal.");
    expect(state().nodes.find((n) => n.id === id)!.data.html).toBe("");
  });
});

describe("carte Scène d'un roman", () => {
  it("pas de scénario : rien n'est créé", async () => {
    await newProject("roman");
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "Inès trouve le journal" });
    expect(state().screenplay).toBeNull();
    await state().save();
    expect(await storage.readAll()).not.toHaveProperty(SCREENPLAY_FILE);
  });
});

describe("titre du projet", () => {
  it("renommer : cosmos.json, la liste de l'accueil et la page de titre du scénario suivent", async () => {
    await newProject("scenario");
    state().setTitle("Le Phare des Absents");
    expect(state().status).toBe("modifie");
    await state().closeProject();
    expect(state().projects[0].title).toBe("Le Phare des Absents");
    const files = (await storage.readAll())!;
    expect(JSON.parse(files[META_FILE]).title).toBe("Le Phare des Absents");
    expect(files[SCREENPLAY_FILE]).toBe("Title: Le Phare des Absents\n");
  });

  it("une page de titre écrite à la main n'est pas touchée", async () => {
    await newProject("scenario");
    const sp = state().screenplay!;
    state().setScreenplay({ ...sp, titlePage: { Title: "KERLAOUEN, version longue" } });
    state().setTitle("Autre nom");
    expect(state().screenplay!.titlePage).toEqual({ Title: "KERLAOUEN, version longue" });
  });
});

describe("fonctions de lien", () => {
  const sp = parse("INT. A - JOUR [[cosmos:a]]\n\n[[à revoir]]\n\n# Acte II\n\nEXT. B - NUIT [[cosmos:b]]\n\nTexte.\n");

  it("appendScene : à la fin, une seule fois, jamais sans titre", () => {
    const next = appendScene(sp, { id: "c", title: "  INT. C - SOIR " });
    expect(serialize(next)).toContain("Texte.\n\nINT. C - SOIR [[cosmos:c]]\n");
    expect(appendScene(next, { id: "c", title: "INT. C - SOIR" })).toBe(next);
    expect(appendScene(sp, { id: "d", title: "   " })).toBe(sp);
  });

  it("releaseCard : une note seule ne compte pas comme du texte… mais elle n'est pas perdue non plus", () => {
    // La scène A ne contient qu'une note : la note a du texte, donc l'en-tête reste, sans son lien.
    expect(serialize(releaseCard(sp, "a"))).toContain("INT. A - JOUR\n\n[[à revoir]]\n\n# Acte II");
    expect(serialize(releaseCard(sp, "b"))).toContain("EXT. B - NUIT\n\nTexte.");
    expect(releaseCard(sp, "inconnue")).toBe(sp);
    const bare = parse("INT. A - JOUR [[cosmos:a]]\n\nEXT. B - NUIT [[cosmos:b]]\n");
    expect(serialize(releaseCard(bare, "a"))).toBe("EXT. B - NUIT [[cosmos:b]]\n");
    expect(serialize(releaseCard(bare, "b"))).toBe("INT. A - JOUR [[cosmos:a]]\n");
  });
});
