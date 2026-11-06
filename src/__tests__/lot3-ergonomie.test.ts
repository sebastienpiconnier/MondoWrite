// @vitest-environment happy-dom
// Lot 3 · Ergonomie : page des projets (recherche, tri, filtre, reprendre là où j'en étais, #27) et palette de
// commandes (#26).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage, type ProjectEntry } from "../storage";
import { LIST_TOOLS_MIN, hasBothKinds, listProjects, readListPrefs } from "../projectList";
import { captureSpot, cleanSpot, nextSpot, pruneSpots, readSpot, setCaretSource } from "../resume";
import { COMMANDS, acceleratorKeys, commandById, foldCommand, matchCommands, paletteEntries } from "../commandList";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import appMenuSource from "../appMenu.ts?raw";

const entry = (id: string, title: string, openedAt: number, kind?: "roman" | "scenario"): ProjectEntry => ({ id, name: id, title, openedAt, kind });
const nameOf = (p: ProjectEntry) => p.title || p.name;

describe("liste des projets (#27)", () => {
  const list = [
    entry("a", "Le Phare", 30, "roman"),
    entry("b", "Élise et la mer", 10, "scenario"),
    entry("c", "zèbre", 20),
    entry("d", "Chapitre 10", 5, "roman"),
    entry("e", "Chapitre 2", 5, "roman"),
  ];

  it("cherche sans casse ni accents, dans le titre et le dossier, chaque mot", () => {
    expect(listProjects(list, "elise", { sort: "recent", kind: "all" }, "fr", nameOf).map((p) => p.id)).toEqual(["b"]);
    expect(listProjects(list, "PHARE le", { sort: "recent", kind: "all" }, "fr", nameOf).map((p) => p.id)).toEqual(["a"]);
    expect(listProjects(list, "c", { sort: "name", kind: "all" }, "fr", nameOf).map((p) => p.id)).toEqual(["e", "d", "c"]);
  });

  it("trie par nom (nombres compris), par ouverture, par type", () => {
    expect(listProjects(list, "", { sort: "name", kind: "all" }, "fr", nameOf).map((p) => p.id)).toEqual(["e", "d", "b", "a", "c"]);
    expect(listProjects(list, "", { sort: "recent", kind: "all" }, "fr", nameOf).map((p) => p.id)).toEqual(["a", "c", "b", "e", "d"]);
    // Romans d'abord (un projet sans type est un roman), puis les scénarios, chacun du plus récent au plus ancien.
    expect(listProjects(list, "", { sort: "kind", kind: "all" }, "fr", nameOf).map((p) => p.id)).toEqual(["a", "c", "e", "d", "b"]);
  });

  it("filtre roman ou scénario", () => {
    expect(listProjects(list, "", { sort: "recent", kind: "scenario" }, "fr", nameOf).map((p) => p.id)).toEqual(["b"]);
    expect(listProjects(list, "", { sort: "recent", kind: "roman" }, "fr", nameOf)).toHaveLength(4);
    expect(hasBothKinds(list)).toBe(true);
    expect(hasBothKinds([list[0], list[2]])).toBe(false);
  });

  it("réglages relus prudemment", () => {
    expect(readListPrefs({ sort: "name", kind: "scenario" })).toEqual({ sort: "name", kind: "scenario" });
    expect(readListPrefs({ sort: "taille", kind: "poème" })).toEqual({ sort: "recent", kind: "all" });
    expect(readListPrefs(null)).toEqual({ sort: "recent", kind: "all" });
    expect(LIST_TOOLS_MIN).toBeGreaterThan(1);
  });
});

describe("reprendre là où j'en étais (#27)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => setCaretSource(null));

  it("une position lue n'a que la bonne forme", () => {
    expect(cleanSpot({ view: "manuscrit", at: 5, scene: "k3x9a7bq2m", offset: 12, label: " La forêt " })).toEqual({ view: "manuscrit", at: 5, scene: "k3x9a7bq2m", offset: 12, label: "La forêt" });
    expect(cleanSpot({ view: "cuisine", at: 5 })).toBeNull();
    expect(cleanSpot({ view: "toile" })).toBeNull();
    // Rien qui ressemble à un chemin ni à du code.
    expect(cleanSpot({ view: "manuscrit", at: 1, scene: "../x" })).toEqual({ view: "manuscrit", at: 1 });
    expect(cleanSpot({ view: "manuscrit", at: 1, scene: "@12", el: 3, offset: -1 })).toEqual({ view: "manuscrit", at: 1, scene: "@12", el: 3 });
  });

  it("quitter le Manuscrit pour le Canevas garde la scène où l'on écrivait", () => {
    const before = nextSpot("manuscrit", { scene: "s1", offset: 40, label: "Ouverture" }, null, 1);
    const after = nextSpot("toile", null, before, 2);
    expect(after).toEqual({ view: "toile", at: 2, scene: "s1", offset: 40, label: "Ouverture" });
    expect(nextSpot("manuscrit", { scene: "s2" }, after, 3)).toEqual({ view: "manuscrit", at: 3, scene: "s2" });
  });

  it("ne garde que les plus récentes", () => {
    const all = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`p${i}`, { view: "toile" as const, at: i }]));
    const kept = pruneSpots(all, 30);
    expect(Object.keys(kept)).toHaveLength(30);
    expect(kept.p39).toBeDefined();
    expect(kept.p0).toBeUndefined();
  });

  it("relève le curseur de la vue ouverte, sur l'appareil seulement", () => {
    setCaretSource(() => ({ scene: "s9", offset: 7, label: "Le bal" }));
    captureSpot("projet-1", "manuscrit");
    expect(readSpot("projet-1")).toMatchObject({ view: "manuscrit", scene: "s9", offset: 7, label: "Le bal" });
    captureSpot(null, "toile");
    expect(readSpot("projet-1")?.view).toBe("manuscrit");
  });
});

describe("reprendre un projet depuis l'accueil", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], lastFiles: {}, screenplay: null, savedScreenplay: null, nodes: [], edges: [], status: "enregistre", manuscriptTarget: null, manuscriptCaret: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    setCaretSource(null);
    useSettings.setState({ lang: "en" });
  });

  it("rouvre la vue, la scène et la place du curseur", async () => {
    await useCosmos.getState().createProject({ title: "Le phare", kind: "roman" });
    const s = useCosmos.getState();
    const scene = s.addTitledCard("scene", "La tempête");
    await s.save();
    const id = storage.current?.();
    expect(id).toBeTruthy();
    s.setView("manuscrit");
    setCaretSource(() => ({ scene, offset: 9, label: "La tempête" }));
    await useCosmos.getState().closeProject();
    setCaretSource(null);
    expect(useCosmos.getState().screen).toBe("home");

    await useCosmos.getState().resumeProject(id!);
    const after = useCosmos.getState();
    expect(after.screen).toBe("project");
    expect(after.view).toBe("manuscrit");
    expect(after.manuscriptTarget).toBe(scene);
    expect(after.manuscriptCaret).toEqual({ el: undefined, offset: 9 });
  });

  it("une scène disparue : la vue seule", async () => {
    await useCosmos.getState().createProject({ title: "Sans scène", kind: "roman" });
    await useCosmos.getState().save();
    const id = storage.current?.()!;
    localStorage.setItem("mondowrite.resume", JSON.stringify({ [id]: { view: "manuscrit", at: Date.now(), scene: "disparue1" } }));
    await useCosmos.getState().closeProject();
    // closeProject relève la vue d'alors (Canevas) en gardant la scène : on remet la position voulue.
    localStorage.setItem("mondowrite.resume", JSON.stringify({ [id]: { view: "manuscrit", at: Date.now(), scene: "disparue1" } }));
    await useCosmos.getState().resumeProject(id);
    expect(useCosmos.getState().view).toBe("manuscrit");
    expect(useCosmos.getState().manuscriptTarget).toBeNull();
  });
});

describe("palette de commandes (#26)", () => {
  it("chaque commande a un identifiant unique et un nom dans chaque langue", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of [fr, en]) {
      for (const c of COMMANDS) expect(c.label(t, t.views).trim(), c.id).not.toBe("");
    }
  });

  it("les menus du Mac ne citent que des commandes de la liste", () => {
    const source = appMenuSource;
    const used = [...source.matchAll(/item\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(30);
    for (const id of used) expect(() => commandById(id)).not.toThrow();
    // Toute commande du menu y a sa place.
    for (const c of COMMANDS.filter((x) => x.menu !== false)) expect(used, c.id).toContain(c.id);
  });

  it("les mots en plus désignent des commandes qui existent", () => {
    for (const t of [fr, en]) for (const id of Object.keys(t.palette.keywords)) expect(() => commandById(id)).not.toThrow();
  });

  it("ne propose que ce qui est possible ici", () => {
    const home = paletteEntries(fr, { screen: "home", view: "toile", kind: "roman" }).map((e) => e.id);
    expect(home).toContain("import");
    expect(home).not.toContain("organize");
    expect(home).not.toContain("commands");
    const canvas = paletteEntries(fr, { screen: "project", view: "toile", kind: "roman" }).map((e) => e.id);
    expect(canvas).toContain("organize");
    expect(canvas).not.toContain("focus");
    expect(canvas).toContain("export-paperback");
    expect(canvas).not.toContain("export-script-pdf");
    const script = paletteEntries(fr, { screen: "project", view: "manuscrit", kind: "scenario" }).map((e) => e.id);
    expect(script).toContain("focus");
    expect(script).toContain("export-script-pdf");
  });

  it("trouve une action par son nom, un mot ou un synonyme", () => {
    const entries = paletteEntries(fr, { screen: "project", view: "manuscrit", kind: "roman" });
    expect(matchCommands("organ", paletteEntries(fr, { screen: "project", view: "toile", kind: "roman" }))[0].id).toBe("organize");
    expect(matchCommands("mode focus", entries)[0].id).toBe("focus");
    expect(matchCommands("ranger", paletteEntries(fr, { screen: "project", view: "toile", kind: "roman" })).map((e) => e.id)).toContain("organize");
    const pdf = matchCommands("exporter pdf", entries).map((e) => e.id);
    expect(pdf).toContain("export-paperback");
    expect(matchCommands("statistiques", entries)[0].id).toBe("stats");
    expect(matchCommands("zzz", entries)).toEqual([]);
    expect(matchCommands("", entries)).toHaveLength(entries.length);
    // Accents et points de suspension ne comptent pas.
    expect(foldCommand("Réglages…")).toBe("reglages");
  });

  it("affiche un raccourci comme le reste de l'app", () => {
    expect(acceleratorKeys("CmdOrCtrl+Shift+H")).toEqual(["Mod", "Shift", "H"]);
    expect(acceleratorKeys("CmdOrCtrl+=")).toEqual(["Mod", "+"]);
    expect(acceleratorKeys("CmdOrCtrl+,")).toEqual(["Mod", ","]);
  });
});
