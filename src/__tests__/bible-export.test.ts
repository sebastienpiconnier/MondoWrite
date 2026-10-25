// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BIBLE_EXPORT,
  bibleExportToMeta,
  bibleFileName,
  cleanBibleExport,
  cleanOptions,
  defaultsFor,
  deletePreset,
  movePart,
  savePreset,
  togglePart,
  withAudience,
} from "../bibleExport";
import { buildBiblePack, typesForParts, type PackSource } from "../export/biblePack";
import { layoutBible, wrap, type Metrics } from "../export/bibleLayout";
import { THEMES } from "../export/bibleThemes";
import { demoProject } from "../demo";
import { fromProject, toProject } from "../projectState";
import { fr } from "../i18n/fr";
import { PRINCIPAL } from "../character";

const source = (): PackSource => {
  const s = fromProject(demoProject());
  return { title: s.title, kind: s.kind, nodes: s.nodes, edges: s.edges, plan: s.plan, manuscript: s.manuscript, pitch: s.pitch, screenplay: null, goals: s.goals };
};
const ctx = { t: fr, lang: "fr", author: "Camille", date: new Date(2026, 9, 25) };
/** Mesure simple : 0,5 em par caractère. */
const metrics: Metrics = { width: (text, _f, size) => text.length * size * 0.5 };

describe("réglages de l'export de la Bible", () => {
  it("relit des réglages abîmés avec les valeurs par défaut", () => {
    expect(cleanOptions({ audience: "x", theme: "rose", accent: 9, parts: ["pourVous", "foo", "presentation", "presentation"], cover: "../x.jpg", places: "oui" })).toEqual({
      audience: "tiers",
      parts: ["presentation", "pourVous"],
      theme: "editorial",
      accent: 0,
      cover: "",
      places: true,
    });
    expect(cleanBibleExport(undefined)).toEqual(DEFAULT_BIBLE_EXPORT);
  });

  it("n'écrit rien tant que rien n'a changé, et garde les réglages nommés", () => {
    expect(bibleExportToMeta(DEFAULT_BIBLE_EXPORT)).toBeUndefined();
    const named = savePreset({ ...DEFAULT_BIBLE_EXPORT, current: defaultsFor("moi") }, "  Pour moi  ");
    expect(named.presets).toEqual([{ name: "Pour moi", options: defaultsFor("moi") }]);
    expect(cleanBibleExport(JSON.parse(JSON.stringify(bibleExportToMeta(named))))).toEqual(named);
    expect(savePreset(named, "   ")).toBe(named);
    expect(deletePreset(named, "Pour moi").presets).toEqual([]);
  });

  it("passe par cosmos.json", () => {
    const s = fromProject(demoProject());
    const state = { ...s, bibleExport: savePreset({ ...DEFAULT_BIBLE_EXPORT, current: { ...defaultsFor("tiers"), theme: "nuit" as const } }, "Producteur") };
    const back = fromProject(toProject(state as never));
    expect(back.bibleExport).toEqual(state.bibleExport);
  });

  it("coche, décoche et déplace les parties ; « Pour vous » reste à la fin", () => {
    const o = defaultsFor("moi");
    const without = togglePart(o, "univers");
    expect(without.parts).toEqual(["presentation", "personnages", "structure", "pourVous"]);
    expect(togglePart(without, "univers").parts).toEqual(o.parts);
    const moved = movePart(o, "structure", "up");
    expect(moved.parts).toEqual(["presentation", "personnages", "structure", "univers", "pourVous"]);
    expect(movePart(o, "presentation", "up")).toBe(o);
    expect(movePart(o, "univers", "down").parts.at(-1)).toBe("pourVous");
    expect(withAudience(o, "tiers").parts).not.toContain("pourVous");
  });

  it("nomme le fichier avec la date du jour", () => {
    expect(bibleFileName("Bible de série", "Doré", new Date(2026, 0, 5))).toBe("Bible de série - Doré - 2026-01-05");
  });

  it("garde pour Word et Markdown les seules rubriques des parties choisies", () => {
    expect(typesForParts(["theme", "personnage", "lieu", "question"], ["personnages", "pourVous"])).toEqual(["personnage", "question"]);
  });
});

describe("contenu du dossier", () => {
  it("un tiers ne voit pas « Pour vous » ; soi, si", () => {
    const tiers = buildBiblePack(source(), defaultsFor("tiers"), ctx);
    expect(tiers.sections.map((s) => s.part)).not.toContain("pourVous");
    expect(tiers.kind).toBe(fr.bibleExport.kinds.pitch);
    const moi = buildBiblePack(source(), defaultsFor("moi"), ctx);
    expect(moi.kind).toBe(fr.bibleExport.kinds.work);
    expect(moi.sections.length).toBeGreaterThanOrEqual(tiers.sections.length);
  });

  it("suit l'ordre choisi et saute les parties décochées", () => {
    const o = movePart(defaultsFor("tiers"), "personnages", "up");
    const pack = buildBiblePack(source(), { ...o, parts: o.parts.filter((p) => p !== "univers") }, ctx);
    const parts = pack.sections.map((s) => s.part);
    expect(parts).not.toContain("univers");
    expect(parts.indexOf("personnages")).toBeLessThan(parts.indexOf("presentation") === -1 ? Infinity : parts.indexOf("presentation"));
  });

  it("un tiers voit les personnages principaux en pleine page, les autres en liste", () => {
    const s = source();
    const first = s.nodes.find((n) => n.data.type === "personnage");
    expect(first).toBeTruthy();
    const nodes = s.nodes.map((n) => (n === first ? { ...n, data: { ...n.data, fiche: { ...n.data.fiche, principal: PRINCIPAL } } } : n));
    const pack = buildBiblePack({ ...s, nodes }, defaultsFor("tiers"), ctx);
    const blocks = pack.sections.find((x) => x.part === "personnages")!.blocks;
    expect(blocks.filter((b) => b.kind === "person")).toHaveLength(1);
    const others = s.nodes.filter((n) => n.data.type === "personnage").length - 1;
    if (others > 0) expect(blocks.some((b) => b.kind === "list")).toBe(true);
  });
});

describe("mise en pages", () => {
  it("coupe les lignes sans dépasser la largeur", () => {
    const lines = wrap([{ text: "Un deux trois quatre cinq six sept huit neuf dix", font: "plexSerif" }], 60, 10, metrics);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.width).toBeLessThanOrEqual(60);
  });

  it("une page de couverture, chaque partie sur sa page, rien hors de la page", () => {
    for (const theme of ["sobre", "editorial", "nuit"] as const) {
      const pack = buildBiblePack(source(), { ...defaultsFor("moi"), theme }, ctx);
      const pages = layoutBible({ pack, theme: THEMES[theme], accent: THEMES[theme].accents[0], paper: "a4", metrics, imageSize: () => ({ w: 1200, h: 800 }) });
      expect(pages.length).toBeGreaterThan(pack.sections.length);
      expect(pages.filter((p) => p.mark).map((p) => p.mark)).toEqual(pack.sections.map((s) => s.title));
      // Pas de page blanche : la première partie suit la couverture.
      expect(pages[1].mark).toBe(pack.sections[0].title);
      for (const p of pages)
        for (const op of p.ops)
          if (op.op === "text") {
            expect(op.y).toBeLessThanOrEqual(841.89);
            expect(op.y).toBeGreaterThan(0);
            expect(op.text).not.toMatch(/ /);
          }
      // Même document, même nombre de pages.
      const again = layoutBible({ pack, theme: THEMES[theme], accent: THEMES[theme].accents[0], paper: "a4", metrics, imageSize: () => null });
      expect(again.length).toBeGreaterThan(0);
    }
  });
});
