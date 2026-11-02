// @vitest-environment happy-dom
// Versions d'une scène (1.13.0, docs/plan-versions-scene.md) : fichiers datés, en-tête, chemins sûrs ; garder,
// revenir (le texte actuel est d'abord gardé), roman et scénario ; .zip aller-retour ; différences mot à mot.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanTitle, isVersionName, parseVersionPath, readVersionFile, sortVersions, versionFile, versionName, versionPath } from "../versions";
import { diffText, markdownPlain, paragraphsOf, wordCount } from "../textDiff";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { sha256Hex } from "../examples";
import { parse as parseFountain } from "../screenplay/parse";

const state = () => useCosmos.getState();

describe("fichiers de version", () => {
  it("nom daté, unique à la même seconde, trié du plus récent au plus ancien", () => {
    const d = new Date(2026, 10, 2, 9, 41, 7);
    expect(versionName(d)).toBe("2026-11-02-094107.md");
    expect(versionName(d, ["2026-11-02-094107.md"])).toBe("2026-11-02-094107-2.md");
    expect(versionName(d, ["2026-11-02-094107.md", "2026-11-02-094107-2.md"])).toBe("2026-11-02-094107-3.md");
    const sorted = sortVersions([{ name: "2026-01-01-000000.md" }, { name: "2026-11-02-094107.md" }, { name: "2026-05-01-120000.md" }]);
    expect(sorted.map((v) => v.name)).toEqual(["2026-11-02-094107.md", "2026-05-01-120000.md", "2026-01-01-000000.md"]);
  });

  it("en-tête écrit puis relu : titre avec guillemets, date, mots, type", () => {
    const raw = versionFile({ title: 'Avant d’enlever le "rêve"', date: "2026-11-02T09:41:07+01:00", words: 12, kind: "scenario", text: "= Synopsis\n\nInès entre.\n" });
    expect(raw).toContain("kind: scenario");
    const v = readVersionFile("2026-11-02-094107.md", raw);
    expect(v).toEqual({ name: "2026-11-02-094107.md", title: 'Avant d’enlever le "rêve"', date: "2026-11-02T09:41:07+01:00", words: 12, kind: "scenario", text: "= Synopsis\n\nInès entre." });
    const roman = readVersionFile("2026-11-02-094107.md", versionFile({ title: "", date: "2026-11-02T09:41:07+01:00", words: 3, kind: "roman", text: "Un **mot**." }));
    expect(roman?.kind).toBe("roman");
    expect(roman?.title).toBe("");
    expect(cleanTitle("  deux\n lignes ")).toBe("deux lignes");
    expect(cleanTitle("x".repeat(300)).length).toBe(120);
  });

  it("fichier sans date ni en-tête : date tirée du nom, ou refusé", () => {
    expect(readVersionFile("2026-11-02-094107.md", "---\nwords: 2\n---\nDeux mots")?.date).toBe("2026-11-02T09:41:07");
    expect(readVersionFile("2026-11-02-094107.md", "pas d'en-tête")).toBeNull();
  });

  it("chemins piégés refusés", () => {
    expect(isVersionName("../cosmos.json")).toBe(false);
    expect(isVersionName("2026-11-02-094107.md")).toBe(true);
    expect(isVersionName(".2026-11-02-094107.md.icloud")).toBe(false);
    expect(versionPath("../x", "2026-11-02-094107.md")).toBeNull();
    expect(versionPath("k3x9a7bq2m", "notes.md")).toBeNull();
    expect(versionPath("k3x9a7bq2m", "2026-11-02-094107.md")).toBe("versions/k3x9a7bq2m/2026-11-02-094107.md");
    expect(parseVersionPath("versions/k3x9a7bq2m/2026-11-02-094107.md")).toEqual(["k3x9a7bq2m", "2026-11-02-094107.md"]);
    expect(parseVersionPath("versions/k3x9a7bq2m/../../cosmos.json")).toBeNull();
    expect(parseVersionPath("markdown/versions/2026-11-02/bible.md")).toBeNull();
  });
});

describe("différences mot à mot", () => {
  it("mots ajoutés et retirés, le reste identique", () => {
    const d = diffText("Le chat dort sur le toit.", "Le chien dort sur le toit rouge.");
    expect(d.removed).toBe(2);
    expect(d.added).toBe(3);
    expect(d.parts.filter((p) => p.kind === "del").map((p) => p.text.trim())).toEqual(["chat", "toit."]);
    expect(d.parts.filter((p) => p.kind === "add").map((p) => p.text.trim())).toEqual(["chien", "toit rouge."]);
    // Le texte d'arrivée se recolle à l'identique (morceaux identiques et ajoutés).
    expect(
      d.parts
        .filter((p) => p.kind !== "del")
        .map((p) => p.text)
        .join(""),
    ).toBe("Le chien dort sur le toit rouge.");
  });

  it("paragraphes ajoutés, retirés, inchangés", () => {
    const d = diffText("Un.\n\nDeux.\n\nTrois.", "Un.\n\nTrois.\n\nQuatre.");
    expect(d.parts.map((p) => [p.kind, p.text.trim(), !!p.break])).toEqual([
      ["same", "Un.", true],
      ["del", "Deux.", true],
      ["same", "Trois.", true],
      ["add", "Quatre.", true],
    ]);
    expect(diffText("Même texte.", "Même texte.")).toMatchObject({ added: 0, removed: 0 });
  });

  it("une longue scène se compare vite", () => {
    const words = (seed: number) => Array.from({ length: 4000 }, (_, i) => `mot${(i * seed) % 997}`);
    const before = Array.from({ length: 40 }, (_, p) => words(p + 1).slice(p * 100, p * 100 + 100).join(" ")).join("\n\n");
    const after = before.replace(/mot5 /g, "autre ").replace(/\n\n/, "\n\nUn paragraphe neuf.\n\n");
    const start = performance.now();
    const d = diffText(before, after);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(d.added).toBeGreaterThan(0);
    expect(wordCount(before)).toBe(4000);
  });

  it("Markdown lu sans ses marques", () => {
    expect(markdownPlain("# Titre\n\nUn **gras** et un *italique*, [@Inès](cosmos:k3x9a7bq2m).")).not.toMatch(/[*#[\]]/);
    expect(paragraphsOf("a\n\n\nb\n")).toEqual(["a", "b"]);
  });
});

async function newProject(kind: "roman" | "scenario") {
  localStorage.clear();
  useSettings.setState({ lang: "fr" });
  useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {} });
  await state().start();
  await state().createProject({ title: "Kerlaouen", kind });
}

describe("garder et revenir (roman)", () => {
  beforeEach(() => newProject("roman"));

  it("garde le texte, puis y revient en gardant d'abord l'actuel", async () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "Le phare" });
    expect(await state().keepVersion(id)).toBeNull(); // rien à garder
    state().setManuscriptText(id, "<p>Inès monte les <strong>marches</strong>.</p>");
    const first = await state().keepVersion(id, "Premier jet");
    expect(first).toBeTruthy();
    state().setManuscriptText(id, "<p>Inès descend.</p>");
    expect(await state().restoreVersion(id, first!, "Avant de revenir")).toBe(true);
    expect(state().manuscript[id]).toContain("<strong>marches</strong>");
    const files = await storage.readVersions(id);
    const list = sortVersions(Object.entries(files).map(([n, raw]) => readVersionFile(n, raw)!));
    expect(list.map((v) => v.title).sort()).toEqual(["Avant de revenir", "Premier jet"]);
    expect(list.find((v) => v.title === "Avant de revenir")?.text).toBe("Inès descend.");
    expect(list.find((v) => v.title === "Premier jet")?.words).toBe(4);
  });

  it("une version de scénario ne remplace jamais le texte d'un roman", async () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().setManuscriptText(id, "<p>Texte du roman.</p>");
    await storage.writeVersion(id, "2026-01-01-000000.md", versionFile({ title: "", date: "2026-01-01T00:00:00", words: 2, kind: "scenario", text: "Inès entre." }));
    expect(await state().restoreVersion(id, "2026-01-01-000000.md", "Avant")).toBe(false);
    expect(state().manuscript[id]).toContain("Texte du roman.");
  });

  it("la carte à la corbeille garde ses versions, et la remise les retrouve", async () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().setManuscriptText(id, "<p>Un texte.</p>");
    await state().keepVersion(id);
    state().deleteCard(id);
    expect(Object.keys(await storage.readVersions(id))).toHaveLength(1);
    state().restoreFromTrash(id);
    expect(Object.keys(await storage.readVersions(id))).toHaveLength(1);
  });

  it("openVersions : seulement pour une carte Scène", () => {
    const idea = state().addTitledCard("idee", "Note");
    state().openVersions(idea);
    expect(state().dialog).toBeNull();
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().openVersions(id, true);
    expect(state()).toMatchObject({ dialog: "versions", versionsFor: id, versionsKeep: true });
  });
});

describe("garder et revenir (scénario)", () => {
  beforeEach(() => newProject("scenario"));

  it("garde le synopsis et le corps, jamais l'en-tête", async () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "INT. PHARE - NUIT" });
    state().setCardSceneSynopsis(id, "Inès arrive.");
    state().setSceneText(id, parseFountain("Inès monte les marches.\n\nINÈS\nIl y a quelqu’un ?").elements);
    const name = await state().keepVersion(id, "Avant");
    const v = readVersionFile(name!, (await storage.readVersions(id))[name!])!;
    expect(v.kind).toBe("scenario");
    expect(v.text).toContain("= Inès arrive.");
    expect(v.text).toContain("INÈS");
    expect(v.text).not.toContain("PHARE");

    state().setSceneText(id, parseFountain("Tout a changé.").elements);
    expect(await state().restoreVersion(id, name!, "Avant de revenir")).toBe(true);
    const els = state().screenplay!.elements;
    const at = els.findIndex((e) => e.type === "sceneHeading" && e.cardId === id);
    expect(els[at].text).toBe("INT. PHARE - NUIT");
    const after = els.slice(at + 1).map((e) => e.text).join("\n");
    expect(after).toContain("Inès monte les marches.");
    expect(after).not.toContain("Tout a changé.");
    expect(Object.keys(await storage.readVersions(id))).toHaveLength(2);
  });
});

describe(".zip", () => {
  beforeEach(() => newProject("roman"));
  afterEach(() => vi.restoreAllMocks());

  it("emporte les versions et les reprend dans le nouveau projet", async () => {
    const id = state().addCard({ x: 0, y: 0 }, "scene");
    state().updateCard(id, { title: "Le phare" });
    state().setManuscriptText(id, "<p>Un texte gardé.</p>");
    const name = await state().keepVersion(id, "Gardée");
    await state().save();
    const file = await state().projectZip();
    expect(file).toBeTruthy();
    const data = file!.data;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(data as BodyInit, { status: 200, headers: { "content-length": String(data.length) } }));
    await state().openExample({
      id: "copie",
      title: "Copie",
      subtitle: "",
      kind: "roman",
      lang: "fr",
      url: "https://mondowrite.app/exemples/copie.zip",
      size: data.length,
      sha256: await sha256Hex(data),
      cover: "",
      minVersion: "",
    });
    expect(state().screen).toBe("project");
    const raw = (await storage.readVersions(id))[name!];
    expect(readVersionFile(name!, raw)?.title).toBe("Gardée");
  });
});
