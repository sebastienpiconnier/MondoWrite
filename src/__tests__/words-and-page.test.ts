// @vitest-environment happy-dom
// Fréquence des mots et répétitions proches (#21) ; police et interligne de la page (#24).

import { describe, expect, it } from "vitest";
import { FREQUENT_MIN_COUNT, foldWord, frequentWords, nearRepeats, properNouns, stemWord, stopwordsFor, wordsOf } from "../review/words";
import { checkManuscript } from "../review/checks";
import { initSettings, LINE_HEIGHTS, PAGE_FONTS, useSettings } from "../settings";
import type { CardData } from "../types";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

describe("mots", () => {
  it("découpe les mots, retire l'élision, garde les traits d'union", () => {
    expect(wordsOf("L’ombre d'Inès, porte-fenêtre.").map((w) => w.word)).toEqual(["ombre", "Inès", "porte-fenêtre"]);
    expect(wordsOf("l’ombre")[0].at).toBe(2);
  });

  it("mots outils de la langue, l'anglais à défaut", () => {
    expect(stopwordsFor("fr-CA").has("avec")).toBe(true);
    expect(stopwordsFor("de").has("the")).toBe(true);
    expect(stopwordsFor("en").has("car")).toBe(false);
    expect(foldWord("Été", "fr")).toBe("ete");
    expect(stemWord("mains")).toBe("main");
    expect(stemWord("tous")).toBe("tous");
  });

  it("noms propres : titres des cartes et mots à capitale hors début de phrase", () => {
    const names = properNouns(["Elle voit Morvan. Puis elle part avec Morvan, sans Morvan."], ["Inès Le Goff"], "fr");
    expect(names.has("morvan")).toBe(true);
    expect(names.has("ines")).toBe(true);
    expect(names.has("puis")).toBe(false);
  });

  it("répétition proche : deux fois le même mot dans un paragraphe, pas d'un paragraphe à l'autre", () => {
    const text = "Elle regarde la vague. La vague est grise.\nAu loin, la vague.";
    const reps = nearRepeats(text, "fr", new Set());
    expect(reps).toHaveLength(1);
    expect(reps[0]).toMatchObject({ word: "vague", gap: 1 });
    expect(text.slice(reps[0].first, reps[0].second + 5)).toBe("vague. La vague");
    // Un mot de trois lettres ne compte pas ; un pluriel compte avec son singulier.
    expect(nearRepeats("La mer, la mer.", "fr", new Set())).toEqual([]);
    expect(nearRepeats("Un regard, puis deux regards.", "fr", new Set())[0]).toMatchObject({ word: "regards", gap: 2 });
    expect(nearRepeats("Morvan parle. Morvan se tait.", "fr", new Set(["morvan"]))).toEqual([]);
  });

  it("mots les plus employés, seulement sur un texte assez long", () => {
    const filler = Array.from({ length: 1600 }, (_, i) => `mot${i}`).join(" ");
    const text = `${filler} ${"silence ".repeat(FREQUENT_MIN_COUNT + 4)} ${"regards regard ".repeat(5)} avec avec avec avec avec avec avec avec avec`;
    const out = frequentWords([text], "fr", new Set());
    expect(out.words.map((w) => w.word)).toEqual(["silence", "regard"]);
    expect(out.words[0].count).toBe(FREQUENT_MIN_COUNT + 4);
    expect(frequentWords(["silence ".repeat(50)], "fr", new Set()).words).toEqual([]);
  });

  it("dans « Vérifier » : un point par répétition, un seul pour les mots les plus employés", () => {
    const card = (id: string, title: string, type: CardData["type"] = "scene") => ({ id, type, title, html: "" }) as CardData;
    const long = Array.from({ length: 1600 }, (_, i) => `mot${i}`).join(" ");
    const manuscript = { a: `<p>Inès ouvre la fenêtre. La fenêtre grince.</p>`, b: `<p>${long} ${"brume ".repeat(12)}</p>` };
    const findings = checkManuscript(manuscript, ["a", "b"], [card("a", "Un"), card("b", "Deux"), card("i", "Inès", "personnage")], "fr");
    const repeat = findings.find((f) => f.rule === "nearRepeat" && f.sceneId === "a");
    expect(repeat?.needle).toBe("fenêtre. La fenêtre");
    const frequent = findings.filter((f) => f.rule === "frequentWords");
    expect(frequent).toHaveLength(1);
    expect(frequent[0].names?.[0]).toBe("brume");
  });

  it("textes dans les deux langues", () => {
    for (const t of [fr, en]) {
      expect(t.review.rules.nearRepeat).toBeTruthy();
      expect(t.review.items.frequentWords).toContain("{total}");
    }
  });
});

describe("page du manuscrit", () => {
  it("police et interligne relus avec prudence, posés en variables CSS", () => {
    localStorage.setItem("cosmos:reglages", JSON.stringify({ writing: { pageFont: "comic", lineSpacing: 7 } }));
    initSettings();
    const w = useSettings.getState().writing;
    useSettings.setState({ writing: { ...w, pageFont: "plex", lineSpacing: "normal" } });
    expect(document.documentElement.style.getPropertyValue("--page-leading")).toBe("1.6");
    useSettings.setState({ writing: { ...useSettings.getState().writing, pageFont: "garamond", lineSpacing: "double" } });
    expect(document.documentElement.style.getPropertyValue("--page-font")).toContain("EB Garamond");
    expect(document.documentElement.style.getPropertyValue("--page-leading")).toBe(String(LINE_HEIGHTS.double));
    expect(JSON.parse(localStorage.getItem("cosmos:reglages")!).writing).toMatchObject({ pageFont: "garamond", lineSpacing: "double" });
  });

  it("une police inconnue redevient celle par défaut", async () => {
    localStorage.setItem("cosmos:reglages", JSON.stringify({ writing: { pageFont: "comic", lineSpacing: "triple" } }));
    const { readWritingForTest } = await import("../settings");
    expect(readWritingForTest({ pageFont: "comic", lineSpacing: "triple" })).toMatchObject({ pageFont: "plex", lineSpacing: "normal" });
    expect(PAGE_FONTS.every((f) => fr.settings.pageFonts[f] && en.settings.pageFonts[f])).toBe(true);
  });
});
