// Gabarits de l'auteur imbriqués (#111) : niveaux des cases, Fountain, fichiers, canevas.
import { describe, expect, it } from "vitest";
import { beatParents, cleanLevels, hasSubBeats, leafBeats, readCustom, withKeys, type CustomTemplate, type Plan } from "../plan";
import { applyCustom, customOf, screenplayPlan } from "../screenplay/template";
import { withEpisodeTemplate } from "../screenplay/series";
import { parseTemplateText, templateToMarkdown } from "../templateFile";
import { organize } from "../organize";
import type { Screenplay, ScreenplayElement } from "../screenplay/model";

const nested: CustomTemplate = {
  name: "Trois actes détaillés",
  beats: [
    { key: "u1", label: "Acte I" },
    { key: "u2", label: "Mise en place", level: 2 },
    { key: "u3", label: "Le monde ordinaire", level: 3 },
    { key: "u4", label: "L'appel", level: 3 },
    { key: "u5", label: "Premier seuil", level: 2 },
    { key: "u6", label: "Acte II" },
  ],
};

describe("niveaux des cases", () => {
  it("remet les niveaux en ordre : au plus un de plus que la case d'avant, trois au plus", () => {
    expect(cleanLevels([{ level: 2 }, { level: 3 }, { level: 9 }, { level: 1 }]).map((b) => b.level ?? 1)).toEqual([1, 2, 3, 1]);
    // Un gabarit plat garde la même forme qu'avant : aucune clé level.
    expect(cleanLevels([{ label: "a" }, { label: "b", level: 1 }])).toEqual([{ label: "a" }, { label: "b" }]);
  });
  it("ensembles, cases du bas et parents", () => {
    expect(hasSubBeats(nested, "u1")).toBe(true);
    expect(hasSubBeats(nested, "u3")).toBe(false);
    expect(hasSubBeats(nested, "u5")).toBe(false);
    expect(leafBeats("perso", nested)).toEqual(["u3", "u4", "u5", "u6"]);
    expect(beatParents(nested, "u4").map((b) => b.label)).toEqual(["Acte I", "Mise en place"]);
  });
  it("relit les niveaux de cosmos.json et les garde quand l'auteur enregistre", () => {
    const read = readCustom({ name: "x", beats: [{ key: "u1", label: "A" }, { key: "u2", label: "B", level: 3 }] });
    expect(read?.beats.map((b) => b.level ?? 1)).toEqual([1, 2]);
    expect(withKeys([{ label: "A" }, { label: "B", level: 2 }], []).map((b) => [b.key, b.level ?? 1])).toEqual([["u1", 1], ["u2", 2]]);
  });
});

const sp = (elements: ScreenplayElement[]): Screenplay => ({ titlePage: {}, elements }) as unknown as Screenplay;
const heading = (text: string, cardId: string): ScreenplayElement => ({ type: "sceneHeading", text, cardId }) as ScreenplayElement;

describe("gabarit imbriqué dans un scénario", () => {
  it("le niveau devient la profondeur de la section, et se relit", () => {
    const out = applyCustom(sp([heading("INT. PHARE - NUIT", "c1")]), nested);
    const sections = out.elements.filter((el) => el.type === "section") as { depth?: number }[];
    expect(sections.map((el) => el.depth)).toEqual([1, 2, 3, 3, 2, 1]);
    expect(customOf(out.elements)?.beats.map((b) => b.level ?? 1)).toEqual([1, 2, 3, 3, 2, 1]);
  });
  it("une sous-case ajoutée prend sa place sous son ensemble, les scènes restent dans leur case", () => {
    const flat: CustomTemplate = { name: "", beats: [{ key: "u1", label: "Acte I" }, { key: "u6", label: "Acte II" }] };
    const first = applyCustom(sp([heading("INT. A - JOUR", "c1")]), flat);
    // La scène est dans « Acte I ». On ajoute une sous-case sous « Acte I ».
    const next = applyCustom(first, { name: "", beats: [{ key: "u1", label: "Acte I" }, { key: "u2", label: "Mise en place", level: 2 }, { key: "u6", label: "Acte II" }] });
    const order = next.elements.map((el) => (el.type === "section" ? el.text.replace(/ \[\[.*/, "") : el.type));
    expect(order).toEqual(["Acte I", "sceneHeading", "Mise en place", "Acte II"]);
    expect(screenplayPlan(next.elements).beats.u1).toEqual(["c1"]);
    // Même objet quand rien ne change.
    expect(applyCustom(next, { name: "", beats: customOf(next.elements)!.beats })).toBe(next);
  });
  it("dans un épisode, les niveaux descendent sous l'épisode (###, ####, #####)", () => {
    const series = sp([
      { type: "section", depth: 2, text: "Pilote [[cosmos:episode:e1]]" } as ScreenplayElement,
      heading("INT. A - JOUR", "c1"),
    ]);
    const out = withEpisodeTemplate(series, "e1", (script) => applyCustom(script, nested));
    const depths = out.elements.filter((el) => el.type === "section" && /beat/.test(el.text)).map((el) => (el as { depth?: number }).depth);
    expect(depths).toEqual([3, 4, 5, 5, 4, 3]);
  });
});

describe("gabarit imbriqué dans un fichier", () => {
  it("export Markdown et relecture", () => {
    const md = templateToMarkdown({ name: nested.name, beats: nested.beats });
    expect(md).toContain("## Acte I");
    expect(md).toContain("#### Le monde ordinaire");
    expect(parseTemplateText(md)?.beats.map((b) => b.level ?? 1)).toEqual([1, 2, 3, 3, 2, 1]);
  });
  it("liste en retrait", () => {
    const tpl = parseTemplateText("# Mon gabarit\n\n- Acte I\n  - Mise en place\n    - L'appel\n- Acte II\n");
    expect(tpl?.beats.map((b) => [b.label, b.level ?? 1])).toEqual([["Acte I", 1], ["Mise en place", 2], ["L'appel", 3], ["Acte II", 1]]);
  });
});

describe("gabarit imbriqué sur le canevas", () => {
  it("« Organiser » met les cadres des sous-cases dans celui de leur ensemble", () => {
    const labels = {
      groups: { idee: "Idées", personnage: "Personnages", lieu: "Lieux", scene: "Scènes", intrigue: "Intrigues", theme: "Thèmes", question: "Questions", image: "Images", lien: "Liens", document: "Documents", episode: "Épisodes", groupe: "Groupes", objet: "Objets", evenement: "Événements", regle: "Règles", secret: "Secrets" },
      beat: (k: string) => nested.beats.find((b) => b.key === k)?.label ?? k,
      chapter: (n: number) => `Chapitre ${n}`,
      continued: (l: string) => l,
      unplaced: "À placer",
      story: "Scènes",
      pages: "Pages",
    };
    let n = 0;
    const plan: Plan = { template: "perso", custom: nested, beats: { u3: ["s1"], u6: ["s2"] } };
    const cards = [
      { id: "s1", type: "scene" as const, width: 240, height: 120 },
      { id: "s2", type: "scene" as const, width: 240, height: 120 },
    ];
    const r = organize({ cards, plan, sceneIds: ["s1", "s2"], labels, origin: { x: 0, y: 0 }, newId: () => `f${++n}` });
    const box = (title: string) => r.frames.find((f) => f.title === title)!;
    const inside = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
    expect(inside(box("Mise en place"), box("Acte I"))).toBe(true);
    expect(inside(box("Le monde ordinaire"), box("Mise en place"))).toBe(true);
    expect(inside(box("Acte II"), box("Acte I"))).toBe(false);
  });
});
