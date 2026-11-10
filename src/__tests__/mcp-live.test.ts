// Assistant externe par MCP (#62) : lectures faites par l'app ouverte (« À faire », commentaires, statistiques,
// « Vérifier », versions, journal).

import { describe, expect, it } from "vitest";
import { fr } from "../i18n/fr";
import type { CardData } from "../types";
import { answerLive, isLiveTool, type LiveSource } from "../mcpLive";
import { versionFile } from "../versions";

const card = (c: Partial<CardData> & Pick<CardData, "id" | "type" | "title">): CardData => ({ html: "", ...c });

function source(extra: Partial<LiveSource> = {}): LiveSource {
  return {
    kind: "roman",
    lang: "fr",
    cards: [
      card({ id: "c1", type: "personnage", title: "Inès Morvan", fiche: { principal: "oui" } }),
      card({ id: "q1", type: "question", title: "Qui a éteint le phare ?" }),
      card({ id: "s1", type: "scene", title: "L’arrivée" }),
      card({ id: "s2", type: "scene", title: "La tempête" }),
    ],
    edges: [],
    manuscript: { s1: "<p>Inès monte. Inès regarde. Inès attend.</p><ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"false\"><p>Revoir la fin</p></li></ul>", s2: "<p>La mer gronde.</p>" },
    screenplay: null,
    comments: { s1: [{ id: "c123456", date: "2026-11-09T10:00:00+01:00", quote: "Inès monte", text: "Trop sec ?" }, { id: "c654321", date: "2026-11-08T10:00:00+01:00", quote: "attend", text: "Réglé", resolved: true }] },
    paper: "a4",
    pitch: {},
    journal: "# Journal de l'IA\n\n- 2026-11-09 · externe · L'arrivée · MCP Claude · 12 mots\n",
    order: ["s1", "s2"],
    scenes: [
      { n: 1, id: "s1", title: "L’arrivée" },
      { n: 2, id: "s2", title: "La tempête" },
    ],
    readVersions: async () => ({}),
    ...extra,
  };
}

const ask = (tool: string, src: LiveSource, args: Record<string, unknown> = {}) => answerLive({ id: "1", tool, args }, src, fr);

describe("lectures de l'assistant externe", () => {
  it("reconnaît ses outils", () => {
    expect(isLiveTool("todo_list")).toBe(true);
    expect(isLiveTool("write_scene")).toBe(false);
  });

  it("« À faire » : cases, questions et commentaires ouverts, par scène", async () => {
    const res = await ask("todo_list", source());
    expect(res.ok).toBe(true);
    expect(res.text).toContain("Revoir la fin");
    expect(res.text).toContain("Qui a éteint le phare ?");
    expect(res.text).toContain("scène 1 « L’arrivée »");
  });

  it("commentaires : ouverts seulement, ou aussi les résolus", async () => {
    const open = await ask("read_comments", source());
    expect(open.text).toContain("`c123456`");
    expect(open.text).not.toContain("c654321");
    const all = await ask("read_comments", source(), { resolved: true, scene: "1" });
    expect(all.text).toContain("c654321");
    expect((await ask("read_comments", source(), { scene: "9" })).ok).toBe(false);
  });

  it("statistiques et « Vérifier » d'un roman", async () => {
    const stats = await ask("project_stats", source());
    expect(stats.text).toContain("## Personnages");
    expect(stats.text).toContain("Inès Morvan");
    const review = await ask("review", source());
    expect(review.ok).toBe(true);
  });

  it("versions d'une scène : liste, puis texte", async () => {
    const raw = versionFile({ title: "Avant l'IA", date: "2026-11-09T10:00:00+01:00", words: 3, kind: "roman", text: "Inès monte vite." });
    const src = source({ readVersions: async () => ({ "2026-11-09-100000.md": raw, "piege.md": raw }) });
    const list = await ask("scene_versions", src, { scene: "1" });
    expect(list.text).toContain("1. `2026-11-09-100000.md`");
    expect(list.text).not.toContain("piege");
    expect((await ask("scene_versions", src, { scene: "1", version: "1" })).text).toContain("Inès monte vite.");
    expect((await ask("scene_versions", src, { scene: "1", version: "2" })).ok).toBe(false);
  });

  it("journal de l'IA", async () => {
    expect((await ask("read_journal", source())).text).toContain("MCP Claude");
    expect((await ask("read_journal", source({ journal: "" }))).text).toContain("vide");
  });
});
