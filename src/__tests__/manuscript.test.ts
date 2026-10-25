// @vitest-environment happy-dom
// Manuscrit d'un roman : un texte par scène, fichiers manuscrit/<id>.md, mots, cartes citées.

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos, planScenes } from "../store";
import { useSettings } from "../settings";
import { deserialize, serialize, storage } from "../storage";
import { EMPTY_PLAN, planOrder } from "../plan";
import { countWords, detectCards, isBlank, orphanTexts, totalWords } from "../manuscript";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string): CardData => ({ id, type, title, html: "" });

describe("compter les mots", () => {
  it("apostrophes et traits d'union ne coupent pas un mot ; la mise en forme ne compte pas", () => {
    expect(countWords("<p>L’île n’est pas loin.</p>")).toBe(4);
    expect(countWords("<p>Elle <strong>arrive</strong> à marée basse, peut-être.</p><p>Trop tard.</p>")).toBe(8);
    expect(countWords("<p>12 marches, 3 paliers</p>")).toBe(4);
  });

  it("rien d'écrit", () => {
    expect(countWords(undefined)).toBe(0);
    expect(countWords("<p></p>")).toBe(0);
    expect(isBlank("<p>  </p>")).toBe(true);
    expect(isBlank("<p>a</p>")).toBe(false);
    expect(totalWords({ a: "<p>un deux</p>", b: "<p>trois</p>", c: "<p>hors plan</p>" }, ["a", "b", "x"])).toBe(3);
  });
});

describe("cartes citées dans le texte", () => {
  const cards = [
    card("p1", "personnage", "Inès Morvan"),
    card("p2", "personnage", "Yann Le Goff"),
    card("p3", "personnage", "Al"),
    card("l1", "lieu", "Phare de Kerlaouen"),
    card("l2", "lieu", "Port"),
    card("t1", "theme", "Silence"),
    card("p4", "personnage", ""),
  ];
  const found = (html: string) => detectCards(html, cards).map((c) => c.id);

  it("par le titre entier ou par le prénom, sans casse ni accents", () => {
    expect(found("<p>Ines regarde le phare de kerlaouen.</p>")).toEqual(["p1", "l1"]);
    expect(found("<p>— Yann Le Goff ? demande-t-elle.</p>")).toEqual(["p2"]);
  });

  it("mot entier seulement ; un lieu n'est pas reconnu par son premier mot ; ni thème ni carte sans titre", () => {
    expect(found("<p>Le silence du portail, les inestimables alibis.</p>")).toEqual([]);
    expect(found("<p>Le phare s’allume.</p>")).toEqual([]);
    expect(found("<p>Retour au port.</p>")).toEqual(["l2"]);
    expect(found("")).toEqual([]);
  });

  it("un trait d'union lie deux mots : « la Mère » n'est pas citée dans « la Mère-grand »", () => {
    const family = [card("m", "personnage", "La Mère"), card("g", "personnage", "La Mère-grand")];
    const of = (html: string) => detectCards(html, family).map((c) => c.id);
    expect(of("<p>Elle va chez la Mère-grand.</p>")).toEqual(["g"]);
    expect(of("<p>La Mère cuit des galettes.</p>")).toEqual(["m"]);
    expect(found("<p>Le phare de Kerlaouen-Nord, Yann-Ines.</p>")).toEqual([]);
    expect(found("<p>— Inès ! dit-il.</p>")).toEqual(["p1"]);
  });
});

describe("fichiers du manuscrit", () => {
  const project = {
    meta: { version: 1 as const, title: "Kerlaouen", layout: [], links: [] },
    cards: [card("s1", "scene", "Arrivée")],
    screenplay: null,
    manuscript: { s1: "<p>Inès <strong>arrive</strong>.</p><p>Il pleut.</p>", s2: "<p></p>" },
  };

  it("un fichier Markdown par scène écrite, sans en-tête ; rien pour une scène vide", () => {
    const files = serialize(project);
    expect(files["manuscrit/s1.md"]).toBe("Inès **arrive**.\n\nIl pleut.\n");
    expect(files).not.toHaveProperty("manuscrit/s2.md");
  });

  it("relu à l'identique ; fins de ligne Windows acceptées ; nom de fichier piégé ignoré", () => {
    const files = serialize(project);
    expect(serialize(deserialize(files)!)).toEqual(files);
    const read = deserialize({ ...files, "manuscrit/s1.md": "Inès\r\n\r\nIl pleut.\r\n", "manuscrit/..%2Fx y.md": "Piège", "manuscrit/notes.txt": "non" });
    expect(read!.manuscript).toEqual({ s1: "<p>Inès</p>\n<p>Il pleut.</p>" });
  });

  it("le texte lu sur disque est nettoyé", () => {
    const read = deserialize({ ...serialize(project), "manuscrit/s1.md": "Texte <script>alert(1)</script><img src=x onerror=alert(1)>" });
    expect(read!.manuscript!.s1).not.toMatch(/script|img|onerror/);
  });

  it("un projet sans manuscrit se lit comme avant", () => {
    const { manuscript: _none, ...old } = project;
    expect(deserialize(serialize(old))!.manuscript).toEqual({});
  });
});

describe("manuscrit dans le projet", () => {
  const state = () => useCosmos.getState();
  let a = "";
  let b = "";

  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
    a = state().addTitledCard("scene", "Arrivée");
    b = state().addTitledCard("scene", "Le journal");
    await state().save();
  });

  it("écrire marque le projet modifié ; enregistré puis rouvert, le texte est là", async () => {
    state().setManuscriptText(a, "<p>Inès arrive au phare.</p>");
    expect(state().status).toBe("modifie");
    await state().save();
    expect((await storage.readAll())![`manuscrit/${a}.md`]).toBe("Inès arrive au phare.\n");
    await state().closeProject();
    await state().openProject(state().projects[0].id);
    expect(state().manuscript).toEqual({ [a]: "<p>Inès arrive au phare.</p>" });
  });

  it("même texte : rien ne change ; texte vidé : le fichier disparaît", async () => {
    state().setManuscriptText(a, "<p>Un.</p>");
    await state().save();
    state().setManuscriptText(a, "<p>Un.</p>");
    expect(state().status).toBe("enregistre");
    state().setManuscriptText(a, "<p></p>");
    expect(state().manuscript).toEqual({});
    await state().save();
    expect(await storage.readAll()).not.toHaveProperty(`manuscrit/${a}.md`);
  });

  it("l'ordre du manuscrit est celui du plan", () => {
    state().placeInPlan(b, "libre", 0);
    expect(planOrder(state().plan, planScenes(state().nodes))).toEqual([b, a]);
  });

  it("carte supprimée : le texte reste dans le projet, et la carte revient de la corbeille", async () => {
    state().setManuscriptText(a, "<p>Inès arrive au phare.</p>");
    const title = state().nodes.find((n) => n.id === a)!.data.title;
    state().deleteCard(a);
    await state().save();
    const files = (await storage.readAll())!;
    expect(files[`manuscrit/${a}.md`]).toBe("Inès arrive au phare.\n");
    expect(files[`corbeille/${a}.md`]).toContain("corbeille: {");
    expect(orphanTexts(state().manuscript, planScenes(state().nodes))).toEqual([a]);

    state().restoreScene(a);
    expect(state().nodes.find((n) => n.id === a)!.data).toMatchObject({ type: "scene", title });
    expect(state().trash).toEqual([]);
    expect(orphanTexts(state().manuscript, planScenes(state().nodes))).toEqual([]);
    // Sans effet pour une carte qui existe ou un texte inconnu.
    const count = state().nodes.length;
    state().restoreScene(a);
    state().restoreScene("inconnu");
    expect(state().nodes).toHaveLength(count);
  });

  it("un autre projet ne garde rien du manuscrit précédent", async () => {
    state().setManuscriptText(a, "<p>Inès arrive.</p>");
    await state().save();
    await state().closeProject();
    await state().createProject({ title: "Autre", kind: "roman" });
    expect(state().manuscript).toEqual({});
  });
});

describe("noms cités : jamais un article pris pour un prénom", () => {
  it("« The Mother » n'est pas citée par chaque « the »", () => {
    const mother = { id: "m", type: "personnage", title: "The Mother", html: "" } as CardData;
    const ines = { id: "i", type: "personnage", title: "Inès Morvan", html: "" } as CardData;
    expect(detectCards("<p>The wolf ran to the house.</p>", [mother])).toEqual([]);
    expect(detectCards("<p>The Mother waits.</p>", [mother])).toEqual([mother]);
    expect(detectCards("<p>Inès monte au phare.</p>", [ines])).toEqual([ines]);
  });
});
