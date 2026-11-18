// @vitest-environment happy-dom
// Exemple de roman interactif « Le Puits » : fichiers propres (sans marque de l'IA), fins marquées, histoire vérifiée.

import { describe, expect, it } from "vitest";
import { deserialize } from "../storage";
import { openProject } from "../projectState";
import { puitsExample } from "../interactive/example";
import { interactiveScenes } from "../interactive/scenes";
import { verifyStory, endingCounts } from "../interactive/verify";
import { readFactLabels } from "../interactive/facts";
import { projectSections } from "../interactive/projectSections";
import { Compiler } from "inkjs/full";
import { projectToInk } from "../interactive/ink";
import { sceneSlugs } from "../interactive/choices";
import { STORY_TOUR_STEPS, nextStep } from "../tour";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

describe.each(["fr", "en"])("exemple « Le Puits » (%s)", async (lang) => {
  const example = await puitsExample(lang);

  it("est un roman interactif sans marque de l'IA ni fichier en trop", () => {
    const paths = Object.keys(example.files);
    expect(paths).toContain("cosmos.json");
    expect(paths.every((p) => p === "cosmos.json" || /^(cartes|manuscrit)\/[^/]+\.md$/.test(p))).toBe(true);
    for (const text of Object.values(example.files)) {
      expect(text).not.toContain("data-ia");
      expect(text).not.toMatch(/^(ia|iaImages):/m);
    }
    const meta = JSON.parse(example.files["cosmos.json"]);
    expect(meta.interactive).toBe(true);
    expect(meta.choiceMap).toBeUndefined();
  });

  it("s'ouvre, et toutes ses sections se lisent du départ aux fins", () => {
    const project = deserialize(example.files);
    expect(project).not.toBeNull();
    const { state } = openProject(project!);
    const scenes = interactiveScenes(state.nodes, state.plan);
    expect(scenes.length).toBeGreaterThan(20);
    const sections = projectSections({ nodes: state.nodes, plan: state.plan, manuscript: state.manuscript, metaKeep: state.metaKeep });
    const found = verifyStory(scenes, state.manuscript, readFactLabels(state.metaKeep), sections);
    // L'exemple montre un livre prêt : ni section inaccessible, ni choix cassé, ni fait jamais donné.
    expect(found.filter((f) => ["unreachableScene", "brokenChoice", "lockedScene", "noEnding", "factNeverGiven"].includes(f.rule))).toEqual([]);
    // Et se joue : l'Ink composé se compile sans erreur.
    const ink = projectToInk(scenes, sceneSlugs(scenes), state.manuscript, readFactLabels(state.metaKeep));
    const compiler = new Compiler(ink.ink);
    compiler.Compile();
    expect(compiler.errors).toEqual([]);
    const counts = endingCounts(scenes, state.manuscript);
    expect(counts.good).toBe(1);
    expect(counts.bad).toBe(3);
  });

  it("cite seulement des images qu'il livre", async () => {
    const { puitsMedia } = await import("../interactive/exampleMedia");
    const shipped = new Set(puitsMedia().map(([name]) => name));
    const cited = new Set<string>();
    for (const text of Object.values(example.files)) for (const m of text.matchAll(/(?:\.\.\/medias\/|^image: |"visuel": ")([\w-]+\.jpg)/gm)) cited.add(m[1]);
    expect(cited.size).toBe(10);
    for (const name of cited) expect(shipped.has(name)).toBe(true);
  });

  it("est tout entier dans sa langue", () => {
    const meta = JSON.parse(example.files["cosmos.json"]);
    expect(meta.title).toBe(lang === "fr" ? "Le puits" : "The Well");
    const texts = Object.values(example.files).join("\n");
    // Faits et destinations des choix dans la langue de l'exemple.
    expect(texts.includes("-> taking_the_lantern")).toBe(lang === "en");
    expect(texts.includes("~ lanterne = true")).toBe(lang === "fr");
  });

  it("a sa visite, dans les deux langues", () => {
    expect(STORY_TOUR_STEPS.map((s) => s.view)[0]).toBe("toile");
    expect(nextStep(STORY_TOUR_STEPS.length - 1, STORY_TOUR_STEPS.length)).toBeNull();
    for (const step of STORY_TOUR_STEPS) {
      expect(fr.interactive.tour.steps[step.key].body.length).toBeGreaterThan(80);
      expect(en.interactive.tour.steps[step.key].body.length).toBeGreaterThan(80);
    }
  });
});
