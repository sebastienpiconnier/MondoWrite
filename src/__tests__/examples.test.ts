// @vitest-environment happy-dom
// Grands exemples téléchargés depuis mondowrite.app : liste lue avec prudence, fichier vérifié, puis ouvert
// comme un projet importé.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { EXAMPLES_URL, ExampleError, MAX_BYTES, downloadExample, examplesFor, readExamples, sha256Hex, siteUrl, useExamples, type ExampleEntry } from "../examples";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { META_FILE, serialize } from "../storage";
import { demoProject } from "../demo";

const SHA = "a".repeat(64);
const raw = (over: Record<string, unknown> = {}) => ({ id: "baskerville-film-fr", title: "Le Chien des Baskerville", subtitle: "Long métrage", kind: "scenario", lang: "fr", file: "baskerville-film-fr.zip", size: 6_600_000, sha256: SHA, cover: "baskerville.jpg", minVersion: "1.6.0", ...over });

describe("liste des exemples", () => {
  it("adresses relatives à la liste, gardées seulement sur le site, en https", () => {
    expect(siteUrl("a.zip")).toBe("https://mondowrite.app/exemples/a.zip");
    expect(siteUrl("/autre/a.zip")).toBe("https://mondowrite.app/autre/a.zip");
    expect(siteUrl("https://evil.example/a.zip")).toBe("");
    expect(siteUrl("http://mondowrite.app/a.zip")).toBe("");
    expect(siteUrl("//evil.example/a.zip")).toBe("");
  });

  it("garde les entrées complètes et sûres, une fois chacune", () => {
    const list = readExamples({
      examples: [
        raw(),
        raw(),
        raw({ id: "ailleurs", file: "https://evil.example/x.zip" }),
        raw({ id: "pas-zip", file: "x.exe" }),
        raw({ id: "sans-empreinte", sha256: "123" }),
        raw({ id: "trop-gros", size: MAX_BYTES + 1 }),
        raw({ id: "type", kind: "bd" }),
        raw({ id: "Majuscules" }),
        raw({ id: "sans-image", cover: "https://evil.example/x.jpg", lang: "EN" }),
        "rien",
      ],
    });
    expect(list.map((e) => e.id)).toEqual(["baskerville-film-fr", "sans-image"]);
    expect(list[0]).toMatchObject({ url: "https://mondowrite.app/exemples/baskerville-film-fr.zip", cover: "https://mondowrite.app/exemples/baskerville.jpg", kind: "scenario" });
    expect(list[1]).toMatchObject({ cover: "", lang: "en" });
    expect(readExamples(null)).toEqual([]);
    expect(readExamples({ examples: "x" })).toEqual([]);
  });

  it("la langue de l'interface d'abord, sans ce que cette version ne sait pas ouvrir", () => {
    const list = readExamples({ examples: [raw({ id: "en-1", lang: "en" }), raw({ id: "fr-1" }), raw({ id: "futur", minVersion: "9.0.0" }), raw({ id: "sans-version", minVersion: "" })] });
    expect(examplesFor(list, "fr", "1.6.0").map((e) => e.id)).toEqual(["fr-1", "sans-version", "en-1"]);
    expect(examplesFor(list, "en", "1.6.0").map((e) => e.id)).toEqual(["en-1", "fr-1", "sans-version"]);
    expect(examplesFor(list, "fr", "9.1.0").map((e) => e.id)).toContain("futur");
  });

  it("empreinte SHA-256", async () => {
    expect(await sha256Hex(strToU8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

/** Un projet MondoWrite minimal, zippé dans un dossier racine comme les exemples du site. */
const projectZip = () => {
  const project = demoProject();
  const files = serialize({ ...project, meta: { ...project.meta, title: "Le phare" } });
  return zipSync({
    ...Object.fromEntries(Object.entries(files).map(([path, text]) => [`Le phare/${path}`, strToU8(text)])),
    "Le phare/../evil.md": strToU8("non"),
  });
};

const entryFor = async (data: Uint8Array, over: Partial<ExampleEntry> = {}): Promise<ExampleEntry> => ({
  id: "phare",
  title: "Le phare",
  subtitle: "",
  kind: "roman",
  lang: "fr",
  url: "https://mondowrite.app/exemples/phare.zip",
  size: data.length,
  sha256: await sha256Hex(data),
  cover: "",
  minVersion: "",
  ...over,
});

const answer = (data: Uint8Array) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(data as BodyInit, { status: 200, headers: { "content-length": String(data.length) } }));

describe("téléchargement d'un exemple", () => {
  afterEach(() => vi.restoreAllMocks());

  it("vérifié par son empreinte, avec la progression", async () => {
    const data = projectZip();
    answer(data);
    const shares: number[] = [];
    const got = await downloadExample(await entryFor(data), (s) => shares.push(s));
    expect(got).toEqual(data);
    expect(shares.at(-1)).toBe(1);
  });

  it("empreinte qui ne correspond pas, adresse hors du site, réseau : refusé", async () => {
    const data = projectZip();
    answer(data);
    await expect(downloadExample(await entryFor(data, { sha256: SHA }), () => {})).rejects.toMatchObject({ reason: "checksum" });
    await expect(downloadExample(await entryFor(data, { url: "https://evil.example/x.zip" }), () => {})).rejects.toBeInstanceOf(ExampleError);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("hors ligne"));
    await expect(downloadExample(await entryFor(data), () => {})).rejects.toMatchObject({ reason: "network" });
  });
});

describe("ouvrir un exemple", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useExamples.setState({ status: "idle", list: [], busy: null, error: null });
    useCosmos.setState({ screen: "home", openFailed: false, homeNotice: false, importNotice: null, nodes: [], edges: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it("devient un nouveau projet ouvert, sans les fichiers aux noms douteux", async () => {
    const data = projectZip();
    answer(data);
    await useCosmos.getState().openExample(await entryFor(data));
    const s = useCosmos.getState();
    expect(s.screen).toBe("project");
    expect(s.title).toBe("Le phare");
    expect(s.nodes.length).toBe(demoProject().cards.length);
    expect(useExamples.getState()).toMatchObject({ busy: null, error: null });
    const { storage } = await import("../storage");
    const files = (await storage.readAll()) ?? {};
    expect(files[META_FILE]).toBeTruthy();
    expect(Object.keys(files).some((k) => k.includes(".."))).toBe(false);
  });

  it("un téléchargement raté le dit sous l'exemple et n'ouvre rien", async () => {
    const data = projectZip();
    answer(data);
    await useCosmos.getState().openExample(await entryFor(data, { sha256: SHA }));
    expect(useCosmos.getState().screen).toBe("home");
    expect(useExamples.getState().error).toEqual({ id: "phare", reason: "checksum" });
  });

  it("la liste vient du site", () => {
    expect(EXAMPLES_URL.startsWith("https://mondowrite.app/")).toBe(true);
  });
});
