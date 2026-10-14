// @vitest-environment happy-dom
// Plusieurs projets : accueil au lancement, création, ouverture, retour à la liste.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { META_FILE, SCREENPLAY_FILE, storage, type FileMap } from "../storage";

const state = () => useCosmos.getState();
const titles = () => state().projects.map((p) => p.title);
/** Fichiers d'un projet, lus par le stockage (le projet doit être sélectionné). */
const files = async (): Promise<FileMap> => (await storage.readAll()) ?? {};

beforeEach(() => {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({
    loaded: false,
    screen: "home",
    projects: [],
    openFailed: false,
    homeNotice: false,
    importNotice: null,
    sceneNumbers: false,
    focusMode: false,
    lastFiles: {},
    screenplay: null,
    savedScreenplay: null,
    nodes: [],
    edges: [],
    paperChosen: false,
    status: "enregistre",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useSettings.setState({ lang: "en" });
});

describe("au lancement", () => {
  it("aucun projet : l'accueil, liste vide, rien d'ouvert ni d'écrit", async () => {
    await state().start();
    expect(state()).toMatchObject({ loaded: true, screen: "home", projects: [] });
    expect(localStorage.length).toBe(0);
  });

  it("le projet d'avant l'écran d'accueil figure dans la liste et s'ouvre", async () => {
    localStorage.setItem(
      "cosmos:projet-demo",
      JSON.stringify({ [META_FILE]: JSON.stringify({ version: 1, title: "Mon ancien projet", layout: [], links: [] }) }),
    );
    await state().start();
    expect(state().projects).toHaveLength(1);
    expect(state().screen).toBe("home");

    await state().openProject(state().projects[0].id);
    expect(state()).toMatchObject({ screen: "project", title: "Mon ancien projet", status: "enregistre" });
  });
});

describe("créer", () => {
  it("un roman : projet vide enregistré, ouvert sur le canevas, inscrit dans la liste", async () => {
    await state().start();
    await state().createProject({ title: "Le Phare des Absents", kind: "roman" });

    expect(state()).toMatchObject({ screen: "project", view: "toile", title: "Le Phare des Absents", kind: "roman", status: "enregistre" });
    expect(state().nodes).toEqual([]);
    const written = await files();
    expect(JSON.parse(written[META_FILE])).toMatchObject({ title: "Le Phare des Absents", kind: "roman", layout: [], links: [] });
    expect(written).not.toHaveProperty(SCREENPLAY_FILE);

    await state().closeProject();
    expect(state().screen).toBe("home");
    expect(state().projects).toMatchObject([{ title: "Le Phare des Absents", kind: "roman" }]);
    expect(state().projects[0].openedAt).toBeGreaterThan(0);
  });

  it("un scénario : avec sa page de titre et son format de page (A4 en français)", async () => {
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "scenario" });
    const written = await files();
    expect(written[SCREENPLAY_FILE]).toBe("Title: Kerlaouen\n");
    expect(JSON.parse(written[META_FILE])).toMatchObject({ kind: "scenario", paper: "a4" });
  });

  it("essayer avec un exemple : un projet rempli, enregistré comme les autres", async () => {
    await state().start();
    await state().tryExample();
    expect(state().screen).toBe("project");
    expect(state().nodes.length).toBe(21);
    expect(state().status).toBe("enregistre");
    // Le conte est écrit dans le manuscrit, le plan a ses chapitres, les gravures sont dans medias/.
    expect(Object.keys(state().manuscript)).toHaveLength(7);
    expect(state().plan.chapters).toHaveLength(2);
    const portraits = state().nodes.filter((n) => n.data.image).map((n) => n.data.image!);
    expect(new Set(portraits).size).toBe(3);
    for (const name of portraits) expect(await storage.mediaUrl(name)).toMatch(/^data:image\/jpeg;base64,/);
    await state().closeProject();
    expect(state().projects).toHaveLength(1);
  });

  it("l'auteur annule le choix du dossier : rien ne change", async () => {
    await state().start();
    vi.spyOn(storage, "create").mockResolvedValue(false);
    await state().createProject({ title: "Annulé", kind: "roman" });
    expect(state().screen).toBe("home");
    expect(localStorage.length).toBe(0);
  });

  it("l'emplacement choisi contient déjà un projet : il est ouvert, pas écrasé", async () => {
    await state().start();
    await state().createProject({ title: "Premier", kind: "roman" });
    state().addCard({ x: 0, y: 0 });
    await state().closeProject();
    const id = state().projects[0].id;

    // Sur ordinateur, « créer » fait choisir un dossier : l'auteur reprend celui du premier projet.
    vi.spyOn(storage, "create").mockImplementation(async () => {
      storage.select(id);
      return true;
    });
    await state().createProject({ title: "Second", kind: "scenario" });
    expect(state()).toMatchObject({ title: "Premier", kind: "roman" });
    expect(state().nodes).toHaveLength(1);
    expect(JSON.parse((await files())[META_FILE]).title).toBe("Premier");
  });
});

describe("travailler sur plusieurs projets", () => {
  it("chaque projet garde ses cartes ; le dernier ouvert passe en tête de liste", async () => {
    await state().start();
    await state().createProject({ title: "Roman", kind: "roman" });
    const card = state().addCard({ x: 10, y: 10 }, "personnage");
    state().updateCard(card, { title: "Inès Morvan" });
    await state().closeProject(); // enregistre avant de revenir à l'accueil

    await state().createProject({ title: "Film", kind: "scenario" });
    expect(state().nodes).toEqual([]);
    await state().closeProject();
    expect(titles()).toEqual(["Film", "Roman"]);

    const roman = state().projects.find((p) => p.title === "Roman")!;
    await state().openProject(roman.id);
    expect(state()).toMatchObject({ screen: "project", title: "Roman", kind: "roman", screenplay: null });
    expect(state().nodes.map((n) => n.data.title)).toEqual(["Inès Morvan"]);

    await state().closeProject();
    expect(titles()).toEqual(["Roman", "Film"]);

    await state().openProject(state().projects[1].id);
    expect(state()).toMatchObject({ title: "Film", kind: "scenario" });
    expect(state().nodes).toEqual([]);
    expect(state().screenplay?.titlePage).toEqual({ Title: "Film" });
  });

  it("revenir à l'accueil n'enregistre que s'il y a quelque chose à enregistrer", async () => {
    await state().start();
    await state().createProject({ title: "Roman", kind: "roman" });
    const write = vi.spyOn(storage, "write");
    await state().closeProject();
    expect(write).not.toHaveBeenCalled();
  });

  it("enregistrement en échec : on reste dans le projet", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await state().start();
    await state().createProject({ title: "Roman", kind: "roman" });
    state().addCard({ x: 0, y: 0 });
    const write = vi.spyOn(storage, "write").mockRejectedValue(new Error("disque plein"));
    await state().closeProject();
    expect(state()).toMatchObject({ screen: "project", status: "erreur" });

    // « Projets » retente l'enregistrement ; tant qu'il échoue, on reste.
    await state().closeProject();
    expect(write).toHaveBeenCalledTimes(2);
    expect(state().screen).toBe("project");

    // « Revenir aux projets sans enregistrer » : on sort quand même, sans nouvelle écriture.
    await state().closeProject(true);
    expect(write).toHaveBeenCalledTimes(2);
    expect(state().screen).toBe("home");
  });

  it("enregistrement rétabli : « Projets » enregistre puis revient à l'accueil", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await state().start();
    await state().createProject({ title: "Roman", kind: "roman" });
    state().addCard({ x: 0, y: 0 });
    vi.spyOn(storage, "write").mockRejectedValueOnce(new Error("disque absent"));
    await state().save();
    expect(state().status).toBe("erreur");

    await state().closeProject();
    expect(state().screen).toBe("home");
    storage.select(state().projects[0].id);
    expect(Object.keys(await files()).filter((path) => path.startsWith("cartes/"))).toHaveLength(1);
  });
});

describe("importer un scénario Fountain", () => {
  const fountain = "Title: Kerlaouen\n\nINT. PHARE - NUIT\n\nLa lampe est froide.\n\nINÈS\nPersonne ?\n";

  it("nouveau projet scénario, ouvert sur le texte, avec ses cartes et ses fichiers", async () => {
    await state().start();
    vi.spyOn(storage, "pickFile").mockResolvedValue({ name: "kerlaouen.fountain", data: new TextEncoder().encode(fountain) });
    await state().importFile();

    expect(state()).toMatchObject({ screen: "project", view: "manuscrit", title: "Kerlaouen", kind: "scenario", status: "enregistre" });
    expect(state().nodes.map((n) => `${n.data.type}: ${n.data.title}`)).toEqual([
      "personnage: Inès",
      "lieu: Phare",
      "scene: INT. PHARE - NUIT",
    ]);
    const written = await files();
    const scene = state().nodes.find((n) => n.data.type === "scene")!;
    expect(written[SCREENPLAY_FILE]).toBe(fountain.replace("NUIT\n", `NUIT [[cosmos:${scene.id}]]\n`));
    expect(Object.keys(written).filter((path) => path.startsWith("cartes/"))).toHaveLength(3);
    expect(JSON.parse(written[META_FILE]).links).toHaveLength(1);

    await state().closeProject();
    expect(state().projects).toMatchObject([{ title: "Kerlaouen", kind: "scenario" }]);
  });

  it("l'auteur annule le choix du fichier : rien ne se passe", async () => {
    await state().start();
    vi.spyOn(storage, "pickFile").mockResolvedValue(null);
    const create = vi.spyOn(storage, "create");
    await state().importFile();
    expect(create).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ screen: "home", importNotice: null });
  });

  it("fichier sans scénario : un message, pas de projet", async () => {
    await state().start();
    vi.spyOn(storage, "pickFile").mockResolvedValue({ name: "vide.fountain", data: new TextEncoder().encode("\n\n") });
    await state().importFile();
    expect(state()).toMatchObject({ screen: "home", importNotice: "empty" });
    expect(localStorage.length).toBe(0);
  });

  it("dossier déjà occupé par un projet : il n'est ni écrasé ni ouvert à la place", async () => {
    await state().start();
    await state().createProject({ title: "Roman", kind: "roman" });
    await state().closeProject();
    const id = state().projects[0].id;
    vi.spyOn(storage, "pickFile").mockResolvedValue({ name: "kerlaouen.fountain", data: new TextEncoder().encode(fountain) });
    vi.spyOn(storage, "create").mockImplementation(async () => {
      storage.select(id);
      return true;
    });

    await state().importFile();

    expect(state()).toMatchObject({ screen: "home", importNotice: "taken" });
    storage.select(id);
    const written = await files();
    expect(JSON.parse(written[META_FILE]).title).toBe("Roman");
    expect(written).not.toHaveProperty(SCREENPLAY_FILE);
  });
});

describe("réglages du scénario", () => {
  it("numéros de scène : écrits seulement quand l'option est activée, et relus", async () => {
    await state().start();
    await state().createProject({ title: "Film", kind: "scenario" });
    expect(JSON.parse((await files())[META_FILE])).not.toHaveProperty("sceneNumbers");

    state().setSceneNumbers(true);
    expect(state().status).toBe("modifie");
    await state().closeProject();
    await state().openProject(state().projects[0].id);
    expect(state().sceneNumbers).toBe(true);
    expect(JSON.parse((await files())[META_FILE]).sceneNumbers).toBe(true);
  });

  it("le mode focus se termine en revenant à l'accueil", async () => {
    await state().start();
    await state().createProject({ title: "Film", kind: "scenario" });
    state().setFocusMode(true);
    await state().closeProject();
    expect(state().focusMode).toBe(false);
  });
});

describe("liste de l'accueil", () => {
  it("retirer un projet de la liste ne supprime pas ses fichiers", async () => {
    await state().start();
    await state().createProject({ title: "Roman", kind: "roman" });
    await state().closeProject();
    const id = state().projects[0].id;

    await state().unlistProject(id);
    expect(state().projects).toEqual([]);
    storage.select(id);
    expect(JSON.parse((await files())[META_FILE]).title).toBe("Roman");
  });

  it("projet introuvable (dossier vidé ou déplacé) : on reste à l'accueil avec un message", async () => {
    await state().start();
    await state().openProject("disparu");
    expect(state()).toMatchObject({ screen: "home", homeNotice: true, openFailed: false });
  });

  it("projet illisible : on reste à l'accueil avec un message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await state().start();
    vi.spyOn(storage, "readAll").mockRejectedValueOnce(new Error("forbidden path"));
    await state().openProject("interdit");
    expect(state()).toMatchObject({ screen: "home", openFailed: true });
  });
});
