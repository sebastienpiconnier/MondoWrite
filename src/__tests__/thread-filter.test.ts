// Lire le récit fil par fil (#117) : scènes gardées pour une carte, et écart entre deux scènes gardées.

import { describe, expect, it } from "vitest";
import { canFollow, keptByThread, threadGaps, threadPresence } from "../threadFilter";
import { mentionHtml } from "../mentions";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string, html = "", fiche?: Record<string, string>): CardData => ({ id, type, title, html, ...(fiche ? { fiche } : {}) });

describe("scènes d'un fil", () => {
  const cards = [
    card("s1", "scene", "Arrivée", `<p>Avec ${mentionHtml("o1", "la clé")}.</p>`),
    card("s2", "scene", "Le journal", "", { pov: "p1" }),
    card("s3", "scene", "Tempête"),
    card("s4", "scene", "Le port"),
    card("p1", "personnage", "Inès Morvan"),
    card("i1", "intrigue", "Le naufrage"),
    card("o1", "objet", "la clé"),
    card("l1", "lieu", "Phare"),
  ];
  const links = [{ source: "i1", target: "s1" }, { source: "s4", target: "i1" }, { source: "p1", target: "l1" }];
  const texts = { s3: "<p>Le naufrage revient la hanter. Inès ferme le phare avec la clé.</p>", s4: `<p>Retour au ${mentionHtml("i1", "Le naufrage")}.</p>` };
  const order = ["s1", "s2", "s3", "s4"];

  it("un fil, dans un sens ou l'autre, relie la carte à la scène", () => {
    const p = threadPresence("i1", cards, links, texts, order);
    expect([...p.entries()]).toEqual([["s1", "linked"], ["s4", "linked"]]);
    expect(keptByThread(p, order, false)).toEqual(["s1", "s4"]);
  });

  it("« aussi celles qui la citent » ajoute les scènes qui la nomment sans fil", () => {
    const p = threadPresence("o1", cards, links, texts, order);
    expect([...p.entries()]).toEqual([["s1", "cited"], ["s3", "cited"]]);
    expect(keptByThread(p, order, false)).toEqual([]);
    expect(keptByThread(p, order, true)).toEqual(["s1", "s3"]);
  });

  it("le narrateur d'une scène y est relié ; une mention @ la cite", () => {
    expect(threadPresence("p1", cards, links, texts, order).get("s2")).toBe("linked");
    expect(threadPresence("p1", cards, links, texts, order).get("s3")).toBe("cited");
  });

  it("un fil entre deux cartes qui ne sont pas des scènes ne garde rien", () => {
    expect(keptByThread(threadPresence("l1", cards, links, {}, order), order, false)).toEqual([]);
  });

  it("une carte disparue ne garde rien", () => {
    expect(threadPresence("x", cards, links, texts, order).size).toBe(0);
  });

  it("seules les cartes qui se relient à des scènes se suivent", () => {
    expect(canFollow("intrigue")).toBe(true);
    expect(canFollow("personnage")).toBe(true);
    expect(canFollow("scene")).toBe(false);
    expect(canFollow("idee")).toBe(false);
  });
});

describe("écart entre deux scènes gardées", () => {
  const sizes: Record<string, number> = { a: 2, b: 3, c: 1, d: 4, e: 5 };
  it("compte les scènes sautées et leur longueur, au début comme au milieu", () => {
    const gaps = threadGaps(["a", "b", "c", "d", "e"], new Set(["b", "e"]), (id) => sizes[id]);
    expect([...gaps.entries()]).toEqual([["b", { scenes: 1, size: 2 }], ["e", { scenes: 2, size: 5 }]]);
  });
  it("rien entre deux scènes qui se suivent ; une longueur inconnue compte pour 0", () => {
    const gaps = threadGaps(["a", "b", "c"], new Set(["a", "b", "c"]), (id) => sizes[id]);
    expect(gaps.size).toBe(0);
    expect(threadGaps(["x", "a"], new Set(["a"]), (id) => sizes[id]).get("a")).toEqual({ scenes: 1, size: 0 });
  });
});
