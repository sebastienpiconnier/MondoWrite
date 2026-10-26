// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { askableFields, nextAsk, pitchFields, pitchFilled, readEpisodes, readPitch, SERIES_TEXTS } from "../pitch";
import { DEFAULT_BIBLE_EXPORT, cleanOptions, defaultsFor, exportStateFor, savePreset, withAudience } from "../bibleExport";
import { buildBiblePack, PILOT_PAGES, type PackBlock, type PackSource } from "../export/biblePack";
import { layoutBible, type Metrics } from "../export/bibleLayout";
import { THEMES } from "../export/bibleThemes";
import { importFountain } from "../screenplay/import";
import { fromProject } from "../projectState";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { CHARACTER_FIELDS } from "../character";

const FOUNTAIN = `Title: Les Veilleurs

# Teaser [[cosmos:beat:e_teaser]]

INT. PHARE - NUIT

INÈS
Tu entends ?

# Acte 1 [[cosmos:beat:e_act1]]

EXT. FALAISE - JOUR

YANN
Rien.

INT. PHARE - NUIT

INÈS
Encore.
`;

let n = 0;
function series(): PackSource {
  const project = importFountain(FOUNTAIN, { fileName: "veilleurs.fountain", locale: "fr", linkLabel: "se passe à", newId: () => `id${(n++).toString(36).padStart(8, "0")}` });
  const s = fromProject(project);
  const phare = s.nodes.find((x) => x.data.type === "lieu")!;
  // Une intrigue reliée à la première scène (fil), et des accroches pour le mémo.
  const scene = s.nodes.find((x) => x.data.type === "scene")!;
  const nodes = s.nodes.map((x) =>
    x.data.type === "personnage" ? { ...x, data: { ...x.data, fiche: { ...x.data.fiche, accroche: `${x.data.title} veille.`, enjeuExt: "Garder le phare", ecriture: "Phrases courtes" } } } : x,
  );
  nodes.push({ ...phare, id: "intrigue01", data: { ...phare.data, id: "intrigue01", type: "intrigue", title: "Le signal", fiche: {} } });
  const edges = [...s.edges, { id: "e-int", source: "intrigue01", target: scene.id }];
  return {
    title: s.title,
    kind: "scenario",
    nodes,
    edges,
    plan: s.plan,
    manuscript: {},
    pitch: readPitch({ logline: "Deux gardiens.", arene: "Un phare breton.", mecanique: "Une nuit, un signal.", episodes: "Le signal : Inès entend.\nLa relève", aFaire: "Le phare parle", pistes: "Saison 2 en mer", statut: "Premier jet" }),
    screenplay: project.screenplay,
    goals: {},
  };
}
const ctx = { t: fr, lang: "fr", author: "", date: new Date(2026, 9, 26) };
const metrics: Metrics = { width: (text, _f, size) => text.length * size * 0.5 };
const blocksOf = (pack: ReturnType<typeof buildBiblePack>, part: string) => pack.sections.filter((s) => s.part === part).flatMap((s) => s.blocks);
const texts = (blocks: PackBlock[]) => JSON.stringify(blocks);

describe("couverture d'une série", () => {
  it("lit les épisodes, une ligne chacun", () => {
    expect(readEpisodes("1. Le signal : Inès entend.\n- La relève\n\n")).toEqual([
      { title: "Le signal", synopsis: "Inès entend." },
      { title: "La relève", synopsis: "" },
    ]);
    expect(readEpisodes("Le phare : une nuit")).toEqual([{ title: "Le phare", synopsis: "une nuit" }]);
  });

  it("compte les champs selon le type de projet", () => {
    for (const k of SERIES_TEXTS) expect(pitchFields("roman")).not.toContain(k);
    expect(pitchFields("scenario")).not.toContain("pov");
    expect(pitchFilled({ arene: "x", logline: "y" }, "roman")).toBe(1);
    expect(pitchFilled({ arene: "x", logline: "y" }, "scenario")).toBe(2);
  });

  it("Questionner pose une question par champ vide, et reprend les questions passées", () => {
    expect(nextAsk({}, "roman", [])).toBe("tagline");
    expect(nextAsk({ tagline: "x" }, "roman", [])).toBe("logline");
    expect(nextAsk({}, "roman", ["tagline"])).toBe("logline");
    const all = askableFields("roman");
    expect(nextAsk({}, "roman", [...all.slice(1), all[0]])).toBe(all[1]);
    expect(nextAsk(Object.fromEntries(all.map((k) => [k, "x"])), "roman", [])).toBeNull();
    // Les épisodes sont des cartes (lot 6) : plus de champ de la couverture à remplir.
    expect(askableFields("scenario")).not.toContain("episodes");
    expect(askableFields("scenario")).toContain("mecanique");
    // Une question pour chaque champ, dans les deux langues.
    for (const k of askableFields("scenario")) {
      expect(fr.pitch.questions[k]).toBeTruthy();
      expect(en.pitch.questions[k]).toBeTruthy();
    }
  });

  it("garde enjeux et consigne d'écriture dans la fiche", () => {
    for (const k of ["enjeuExt", "enjeuRel", "enjeuInt", "ecriture"]) expect(CHARACTER_FIELDS).toContain(k);
  });
});

describe("bible de série", () => {
  it("Sobre et pilote par défaut pour un producteur, sans grille ni mémo, sans rien écrire", () => {
    expect(defaultsFor("tiers", "scenario")).toMatchObject({ theme: "sobre", pilot: true, grid: false, memo: false });
    expect(defaultsFor("tiers", "roman")).toMatchObject({ theme: "editorial", pilot: false });
    expect(defaultsFor("moi", "scenario")).toMatchObject({ theme: "sobre", grid: true, memo: true });
    expect(exportStateFor(DEFAULT_BIBLE_EXPORT, "scenario").current.theme).toBe("sobre");
    expect(withAudience(defaultsFor("tiers", "scenario"), "moi", "scenario")).toMatchObject({ grid: true, memo: true });
    const changed = savePreset(DEFAULT_BIBLE_EXPORT, "A");
    expect(exportStateFor(changed, "scenario")).toBe(changed);
    expect(withAudience(defaultsFor("moi", "scenario"), "tiers", "scenario").pilot).toBe(true);
  });

  it("met l'arène dans l'Univers, la mécanique, les épisodes et l'écriture dans la Structure", () => {
    const pack = buildBiblePack(series(), defaultsFor("tiers", "scenario"), ctx);
    expect(pack.kind).toBe(fr.bibleExport.kinds.series);
    expect(texts(blocksOf(pack, "univers"))).toContain("Un phare breton.");
    const structure = blocksOf(pack, "structure");
    expect(texts(structure)).toContain("Une nuit, un signal.");
    expect(structure.some((b) => b.kind === "list" && b.items[0]?.text === "Le signal" && b.items[0].mark === "1")).toBe(true);
    expect(structure.some((b) => b.kind === "h2" && b.text === fr.pitch.seriesTitle)).toBe(true);
    expect(texts(structure)).toContain("Saison 2 en mer");
    expect(texts(blocksOf(pack, "presentation"))).toContain("Premier jet");
  });

  it("grille des fils : l'intrigue est dans la case du teaser", () => {
    const off = buildBiblePack(series(), defaultsFor("tiers", "scenario"), ctx);
    expect(blocksOf(off, "structure").some((b) => b.kind === "grid")).toBe(false);
    const pack = buildBiblePack(series(), { ...defaultsFor("tiers", "scenario"), grid: true }, ctx);
    const grid = blocksOf(pack, "structure").find((b) => b.kind === "grid");
    expect(grid).toBeTruthy();
    if (grid?.kind !== "grid") return;
    expect(grid.cols).toEqual([fr.plan.beats.e_teaser.label, fr.plan.beats.e_act1.label]);
    expect(grid.rows).toEqual([{ label: "Le signal", cells: [true, false] }]);
  });

  it("mémo des personnages en option, enjeux en cases, consigne d'écriture pour soi seulement", () => {
    const tiers = blocksOf(buildBiblePack(series(), defaultsFor("tiers", "scenario"), ctx), "personnages");
    expect(tiers[0]).not.toEqual({ kind: "label", text: fr.bibleExport.memo });
    expect(tiers.some((b) => b.kind === "cells" && b.items.some((i) => i.value === "Garder le phare"))).toBe(true);
    expect(texts(tiers)).not.toContain("Phrases courtes");
    const withMemo = blocksOf(buildBiblePack(series(), { ...defaultsFor("tiers", "scenario"), memo: true }, ctx), "personnages");
    expect(withMemo[0]).toEqual({ kind: "label", text: fr.bibleExport.memo });
    const moi = blocksOf(buildBiblePack(series(), defaultsFor("moi", "scenario"), ctx), "personnages");
    expect(moi[0]).toEqual({ kind: "label", text: fr.bibleExport.memo });
    expect(texts(moi)).toContain("Phrases courtes");
  });

  it("un réglage enregistré garde ses choix", () => {
    const saved = cleanOptions({ ...defaultsFor("tiers", "scenario"), theme: "nuit", grid: true, memo: true });
    expect(saved).toMatchObject({ theme: "nuit", grid: true, memo: true });
    // Ancien réglage sans grille ni mémo : valeurs de départ de son public.
    expect(cleanOptions({ audience: "moi" })).toMatchObject({ grid: true, memo: true });
  });

  it("annonce le pilote en annexe, seulement si on le joint", () => {
    const withPilot = buildBiblePack(series(), defaultsFor("tiers", "scenario"), ctx);
    expect(withPilot.pilotPages).toBe(PILOT_PAGES);
    expect(withPilot.sections.at(-1)?.title).toBe(fr.bibleExport.pilotTitle);
    const without = buildBiblePack(series(), { ...defaultsFor("tiers", "scenario"), pilot: false }, ctx);
    expect(without.pilotPages).toBe(0);
    const novel = buildBiblePack({ ...series(), kind: "roman" }, { ...defaultsFor("tiers"), pilot: true }, ctx);
    expect(novel.pilotPages).toBe(0);
  });

  it("met la grille en page sans sortir de la page", () => {
    const pack = buildBiblePack(series(), { ...defaultsFor("tiers", "scenario"), grid: true }, ctx);
    const pages = layoutBible({ pack, theme: THEMES.nuit, accent: THEMES.nuit.accents[0], paper: "a4", metrics, imageSize: () => null });
    for (const p of pages) for (const op of p.ops) if (op.op === "rect" || op.op === "text") expect(op.x).toBeLessThanOrEqual(595.28);
    expect(pages.some((p) => p.mark === fr.bibleExport.pilotTitle)).toBe(true);
  });
});

describe("couverture, versions futures", () => {
  it("garde les clés inconnues de la couverture pour les réécrire", () => {
    const p = readPitch({ logline: "x", nouveauChamp: "texte", vide: " ", "../x": "non", nombre: 3 });
    expect(p).toEqual({ logline: "x", nouveauChamp: "texte" });
    expect(pitchFilled(p, "roman")).toBe(1);
  });
});
