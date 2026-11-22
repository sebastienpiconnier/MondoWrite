import { describe, expect, it } from "vitest";
import { pendingBatches, readImageSpecs, statusAnswer, withSceneImage, type ImageContext, type ImageJob } from "../assistantImages";
import { imagePrompt, properNames } from "../ai/imageGen";
import { readMcp, DEFAULT_MCP } from "../mcp";

const cards = [
  { id: "c1", title: "Ophelia Grange", type: "personnage", image: "ophelia.png" },
  { id: "c2", title: "La grotte", type: "lieu", image: "grotte.png" },
  { id: "c3", title: "Ezra Pike", type: "personnage" },
  { id: "s1", title: "La séance", type: "scene" },
];
const ctx = (over: Partial<ImageContext> = {}): ImageContext => ({
  kind: "roman",
  hasCover: false,
  findCard: (w) => cards.find((c) => c.title === w || c.id === w) ?? null,
  findScene: (w) => (w === "5" || w === "La séance" ? { id: "s1", title: "La séance" } : null),
  ...over,
});

describe("images demandées par l'assistant : relecture", () => {
  it("une image de carte : image principale par défaut, références gardées si elles ont une image", () => {
    const r = readImageSpecs("generate_image", { prompt: "Une vieille femme en châle noir", target: "card", card: "Ophelia Grange", alt: "Portrait", references: ["La grotte", "Ezra Pike"] }, ctx());
    expect("specs" in r && r.specs[0]).toMatchObject({ target: { kind: "card", id: "c1", slot: "portrait" }, refs: ["c2"], quality: null, replace: false });
  });

  it("une cible introuvable ou une référence inconnue est refusée avant tout envoi", () => {
    expect(readImageSpecs("generate_image", { prompt: "x", target: "card", card: "Personne" }, ctx())).toHaveProperty("error");
    expect(readImageSpecs("generate_image", { prompt: "x", target: "card", card: "Ophelia Grange", references: ["Inconnu"] }, ctx())).toHaveProperty("error");
    expect(readImageSpecs("generate_image", { prompt: "", target: "cover" }, ctx())).toHaveProperty("error");
    expect(readImageSpecs("generate_image", { prompt: "x", target: "ailleurs" }, ctx())).toHaveProperty("error");
  });

  it("une couverture déjà illustrée n'est jamais remplacée sans `replace`", () => {
    expect(readImageSpecs("generate_image", { prompt: "Falaise", target: "cover" }, ctx({ hasCover: true }))).toHaveProperty("error");
    expect(readImageSpecs("generate_image", { prompt: "Falaise", target: "cover", replace: true }, ctx({ hasCover: true }))).toHaveProperty("specs");
  });

  it("image de scène : roman seulement, en tête par défaut ; une scène se vise par target = scene", () => {
    const ok = readImageSpecs("generate_image", { prompt: "La séance", target: "scene", scene: "5" }, ctx());
    expect("specs" in ok && ok.specs[0].target).toEqual({ kind: "scene", id: "s1", title: "La séance", position: "top" });
    expect(readImageSpecs("generate_image", { prompt: "x", target: "scene", scene: "5" }, ctx({ kind: "scenario" }))).toHaveProperty("error");
    expect(readImageSpecs("generate_image", { prompt: "x", target: "card", card: "La séance" }, ctx())).toHaveProperty("error");
  });

  it("par lots : au plus 12 images, une seule couverture, l'erreur dit quelle image", () => {
    const many = Array.from({ length: 13 }, () => ({ prompt: "x", target: "card", card: "La grotte" }));
    expect(readImageSpecs("generate_images", { images: many }, ctx())).toHaveProperty("error");
    expect(readImageSpecs("generate_images", { images: [{ prompt: "a", target: "cover" }, { prompt: "b", target: "cover" }] }, ctx())).toHaveProperty("error");
    const bad = readImageSpecs("generate_images", { images: [{ prompt: "a", target: "cover" }, { prompt: "b", target: "card", card: "?" }] }, ctx());
    expect("error" in bad && bad.error).toMatch(/^Image 2/);
    const good = readImageSpecs("generate_images", { images: [{ prompt: "a", target: "card", card: "c1", quality: "sunburst" }, { prompt: "b", target: "card", card: "La grotte", slot: "gallery" }] }, ctx());
    expect("specs" in good && good.specs.map((s) => [s.quality, s.target.kind === "card" && s.target.slot])).toEqual([
      ["sunburst", "portrait"],
      [null, "gallery"],
    ]);
  });
});

describe("tâches et état", () => {
  const job = (id: string, batch: string, status: ImageJob["status"], project = "p"): ImageJob => ({ id, batch, project, client: "Claude", target: { kind: "cover" }, prompt: "x", alt: "", refs: [], quality: null, replace: false, status, at: 0 });

  it("les demandes en attente sont groupées, la plus ancienne d'abord", () => {
    const jobs = [job("a", "b1", "confirm"), job("b", "b2", "confirm"), job("c", "b1", "confirm"), job("d", "b3", "done")];
    expect(pendingBatches(jobs).map((b) => b.map((j) => j.id))).toEqual([["a", "c"], ["b"]]);
  });

  it("image_status ne parle que du projet demandé, par tâche ou par demande", () => {
    const jobs = [job("a", "b1", "confirm"), job("b", "b1", "refused"), job("z", "b9", "done", "autre")];
    expect(statusAnswer(jobs, "p", "").text.split("\n")).toHaveLength(2);
    expect(statusAnswer(jobs, "p", "b1").text).toMatch(/attente[\s\S]*refusée/);
    expect(statusAnswer(jobs, "p", "z").ok).toBe(false);
  });
});

describe("image posée dans une scène", () => {
  it("en tête (place « chapitre ») ou à la fin, toujours avant le bloc de choix", () => {
    expect(withSceneImage("<p>Texte</p>", "a.png", "Une grotte", "top")).toBe('<img data-media="a.png" alt="Une grotte" data-place="chapter"><p>Texte</p>');
    expect(withSceneImage("<p>Texte</p>", "a.png", 'Le "cercle"', "end")).toBe('<p>Texte</p><img data-media="a.png" alt="Le &quot;cercle&quot;">');
    const html = '<p>Texte</p><pre data-choices="true"><code>* [Partir] -> fin</code></pre>';
    expect(withSceneImage(html, "a.png", "x", "end")).toBe('<p>Texte</p><img data-media="a.png" alt="x"><pre data-choices="true"><code>* [Partir] -> fin</code></pre>');
  });
});

describe("consigne et réglage", () => {
  it("des références de lieu se disent après les personnages, sans interdire le décor", () => {
    const names = properNames([]);
    const with2 = imagePrompt("scene", "Une séance", names, { cast: [{ description: "vieille femme", reference: true }], settingRefs: 1 });
    expect(with2).toContain("Reference image 2 shows the place");
    expect(with2).not.toContain("not for the setting");
    const peopleOnly = imagePrompt("scene", "Une séance", names, { cast: [{ description: "vieille femme", reference: true }] });
    expect(peopleOnly).toContain("not for the setting");
  });

  it("les images de l'assistant sont coupées par défaut", () => {
    expect(DEFAULT_MCP.images).toBe(false);
    expect(readMcp({ enabled: true, projects: {}, images: "oui" }).images).toBe(false);
    expect(readMcp({ enabled: true, projects: {}, images: true }).images).toBe(true);
  });
});
