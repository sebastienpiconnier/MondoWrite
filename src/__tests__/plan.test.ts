// @vitest-environment happy-dom
// Plan d'un roman : gabarits, rangement des scènes dans les cases, enregistrement dans cosmos.json.

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos, planScenes } from "../store";
import { useSettings } from "../settings";
import { META_FILE, storage } from "../storage";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import {
  EMPTY_PLAN,
  PLAN_TEMPLATES,
  PLAN_TEMPLATE_KEYS,
  BEAT_TARGETS,
  NOVEL_TEMPLATES,
  arrange,
  isEmptyPlan,
  placeScene,
  planOrder,
  prunePlan,
  readPlan,
  setTemplate,
  stepScene,
  type Plan,
} from "../plan";

const scenes = ["s1", "s2", "s3", "s4"];
const three = (beats: Plan["beats"]): Plan => ({ template: "troisActes", beats });

describe("gabarits", () => {
  it("gabarits du roman, des clés de case uniques d'un gabarit à l'autre, une position attendue pour chaque case", () => {
    expect(NOVEL_TEMPLATES).toEqual(["libre", "troisActes", "saveTheCat", "voyageHeros", "cercleHarmon", "freytag", "hauge", "septPoints", "kishotenketsu", "romance", "polar"]);
    for (const [template, keys] of Object.entries(PLAN_TEMPLATES)) {
      if (template === "libre" || template === "perso") continue;
      for (const key of keys) {
        const at = BEAT_TARGETS[key as keyof typeof BEAT_TARGETS];
        expect(at !== undefined && at >= 0 && at < 1, key).toBe(true);
      }
      expect(BEAT_TARGETS[keys[0] as keyof typeof BEAT_TARGETS]).toBe(0);
      // Dans l'ordre du récit : chaque case commence après la précédente.
      const at = keys.map((k) => BEAT_TARGETS[k as keyof typeof BEAT_TARGETS]!);
      expect(at.every((v, i) => i === 0 || v > at[i - 1]), template).toBe(true);
    }
    const all = Object.values(PLAN_TEMPLATES).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(PLAN_TEMPLATES.saveTheCat).toHaveLength(15);
    expect(PLAN_TEMPLATES.voyageHeros).toHaveLength(12);
  });

  it("chaque case a son libellé et son indication, en français et en anglais", () => {
    for (const key of Object.values(PLAN_TEMPLATES).flat()) {
      for (const beats of [fr.plan.beats, en.plan.beats]) {
        expect(beats[key].label).toBeTruthy();
        expect(beats[key].hint).toBeTruthy();
      }
    }
    for (const key of PLAN_TEMPLATE_KEYS) expect(fr.plan.templates[key] && en.plan.templates[key]).toBeTruthy();
  });
});

describe("lecture du plan", () => {
  it("rien de rangé : toutes les scènes sont à placer, dans l'ordre reçu", () => {
    expect(arrange(three({}), scenes)).toMatchObject({ unplaced: scenes });
    expect(arrange(three({}), scenes).beats.map((b) => b.key)).toEqual([...PLAN_TEMPLATES.troisActes]);
  });

  it("plan libre : une seule liste, les scènes pas encore rangées à la suite", () => {
    expect(arrange({ template: "libre", beats: { libre: ["s3", "s1"] } }, scenes)).toEqual({
      beats: [{ key: "libre", ids: ["s3", "s1", "s2", "s4"] }],
      unplaced: [],
    });
  });

  it("une scène n'apparaît qu'une fois ; une carte disparue ou qui n'est plus une scène, jamais", () => {
    const plan = three({ a_setup: ["s2", "zz", "s2"], a_climax: ["s2", "s4"] });
    const { beats, unplaced } = arrange(plan, scenes);
    expect(beats.find((b) => b.key === "a_setup")!.ids).toEqual(["s2"]);
    expect(beats.find((b) => b.key === "a_climax")!.ids).toEqual(["s4"]);
    expect(unplaced).toEqual(["s1", "s3"]);
  });

  it("ordre du récit : les cases, puis les scènes à placer", () => {
    expect(planOrder(three({ a_climax: ["s4"], a_setup: ["s2"] }), scenes)).toEqual(["s2", "s4", "s1", "s3"]);
  });
});

describe("ranger une scène", () => {
  it("dans une case, à la fin ou à une position", () => {
    let plan = placeScene(three({}), scenes, "s1", "a_setup");
    plan = placeScene(plan, scenes, "s2", "a_setup");
    plan = placeScene(plan, scenes, "s3", "a_setup", 0);
    expect(plan.beats).toEqual({ a_setup: ["s3", "s1", "s2"] });
  });

  it("d'une case à l'autre : elle quitte la première, la case vide disparaît", () => {
    const plan = placeScene(three({ a_setup: ["s1"], a_climax: ["s2"] }), scenes, "s1", "a_climax", 0);
    expect(plan.beats).toEqual({ a_climax: ["s1", "s2"] });
  });

  it("dans la même case : avant la scène visée", () => {
    const plan = three({ a_setup: ["s1", "s2", "s3"] });
    expect(placeScene(plan, scenes, "s1", "a_setup", 2).beats.a_setup).toEqual(["s2", "s1", "s3"]);
    expect(placeScene(plan, scenes, "s3", "a_setup", 0).beats.a_setup).toEqual(["s3", "s1", "s2"]);
    expect(placeScene(plan, scenes, "s1", "a_setup").beats.a_setup).toEqual(["s2", "s3", "s1"]);
  });

  it("la sortir du plan", () => {
    expect(placeScene(three({ a_setup: ["s1", "s2"] }), scenes, "s1", null).beats).toEqual({ a_setup: ["s2"] });
  });

  it("rien ne change : même objet", () => {
    const plan = three({ a_setup: ["s1", "s2"] });
    expect(placeScene(plan, scenes, "s1", "a_setup", 0)).toBe(plan);
    expect(placeScene(plan, scenes, "s1", "a_setup", 1)).toBe(plan);
    expect(placeScene(plan, scenes, "s3", null)).toBe(plan);
    expect(placeScene(plan, scenes, "zz", "a_setup")).toBe(plan);
    expect(placeScene(plan, scenes, "s1", "c_opening")).toBe(plan);
    expect(placeScene({ template: "libre", beats: {} }, scenes, "s1", null)).toEqual({ template: "libre", beats: {} });
  });

  it("plan libre : le premier déplacement fixe l'ordre de toutes les scènes", () => {
    expect(stepScene(EMPTY_PLAN, scenes, "s3", "up").beats).toEqual({ libre: ["s1", "s3", "s2", "s4"] });
  });
});

describe("monter et descendre", () => {
  const plan = three({ a_setup: ["s1", "s2"], a_midpoint: ["s3"] });

  it("dans la case", () => {
    expect(stepScene(plan, scenes, "s2", "up").beats.a_setup).toEqual(["s2", "s1"]);
    expect(stepScene(plan, scenes, "s1", "down").beats.a_setup).toEqual(["s2", "s1"]);
  });

  it("au bord : dans la case voisine, même vide", () => {
    expect(stepScene(plan, scenes, "s2", "down").beats).toEqual({ a_setup: ["s1"], a_incident: ["s2"], a_midpoint: ["s3"] });
    expect(stepScene(plan, scenes, "s3", "up").beats).toEqual({ a_setup: ["s1", "s2"], a_confrontation: ["s3"] });
  });

  it("aux extrémités, ou pour une scène à placer : rien", () => {
    expect(stepScene(plan, scenes, "s1", "up")).toBe(plan);
    expect(stepScene(three({ a_resolution: ["s1"] }), scenes, "s1", "down").beats).toEqual({ a_resolution: ["s1"] });
    expect(stepScene(plan, scenes, "s4", "up")).toBe(plan);
  });
});

describe("changer de gabarit et enregistrer", () => {
  it("le rangement de l'ancien gabarit reste, et revient si l'on y retourne", () => {
    const plan = three({ a_setup: ["s1"] });
    const cat = placeScene(setTemplate(plan, "saveTheCat"), scenes, "s1", "c_opening");
    expect(arrange(cat, scenes).unplaced).toEqual(["s2", "s3", "s4"]);
    expect(cat.beats).toEqual({ a_setup: ["s1"], c_opening: ["s1"] });
    expect(arrange(setTemplate(cat, "troisActes"), scenes).beats[0].ids).toEqual(["s1"]);
    expect(setTemplate(plan, "troisActes")).toBe(plan);
  });

  it("fichier : formes inattendues ignorées", () => {
    expect(readPlan(undefined)).toBe(EMPTY_PLAN);
    expect(readPlan("x")).toBe(EMPTY_PLAN);
    expect(readPlan({ template: "inconnu", beats: [] })).toBe(EMPTY_PLAN);
    expect(readPlan({ template: "saveTheCat", beats: { c_opening: ["s1", 3, "s1", ""], c_theme: "s2", c_setup: [] } })).toEqual({
      template: "saveTheCat",
      beats: { c_opening: ["s1"] },
    });
  });

  it("plan vide : rien à écrire ; cartes disparues retirées à l'écriture", () => {
    expect(isEmptyPlan(EMPTY_PLAN)).toBe(true);
    expect(isEmptyPlan({ template: "troisActes", beats: {} })).toBe(false);
    const plan = three({ a_setup: ["s1", "zz"], a_climax: ["zz"] });
    expect(prunePlan(plan, new Set(scenes)).beats).toEqual({ a_setup: ["s1"] });
    const clean = three({ a_setup: ["s1"] });
    expect(prunePlan(clean, new Set(scenes))).toBe(clean);
  });
});

describe("plan dans le projet", () => {
  const state = () => useCosmos.getState();
  const meta = async () => JSON.parse((await storage.readAll())![META_FILE]);
  let a = "";
  let b = "";

  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
    a = state().addTitledCard("scene", "Inès arrive au phare");
    b = state().addTitledCard("scene", "Le journal de bord");
  });

  it("un projet sans plan n'écrit pas de champ plan", async () => {
    await state().save();
    expect(await meta()).not.toHaveProperty("plan");
  });

  it("gabarit et rangement enregistrés, puis relus", async () => {
    state().setPlanTemplate("troisActes");
    state().placeInPlan(b, "a_setup");
    state().placeInPlan(a, "a_incident");
    expect(state().status).toBe("modifie");
    await state().save();
    expect((await meta()).plan).toEqual({ template: "troisActes", beats: { a_setup: [b], a_incident: [a] } });

    await state().closeProject();
    await state().openProject(state().projects[0].id);
    expect(state().plan).toEqual({ template: "troisActes", beats: { a_setup: [b], a_incident: [a] } });
    expect(planOrder(state().plan, planScenes(state().nodes))).toEqual([b, a]);
  });

  it("créer une scène depuis une case : la carte existe sur le canevas, rangée", () => {
    state().setPlanTemplate("troisActes");
    const id = state().addPlanScene("La tempête", "a_climax");
    expect(state().nodes.find((n) => n.id === id)!.data).toMatchObject({ type: "scene", title: "La tempête" });
    expect(state().plan.beats).toEqual({ a_climax: [id] });
    state().undo();
    expect(state().nodes.some((n) => n.id === id)).toBe(false);
    expect(state().plan.beats).toEqual({});
  });

  it("annuler et rétablir un rangement", () => {
    state().setPlanTemplate("troisActes");
    state().placeInPlan(a, "a_setup");
    expect(state().stepInPlan(a, "down")).toBe(true);
    expect(state().plan.beats).toEqual({ a_incident: [a] });
    state().undo();
    expect(state().plan.beats).toEqual({ a_setup: [a] });
    state().redo();
    expect(state().plan.beats).toEqual({ a_incident: [a] });
    // Un geste sans effet ne crée pas d'étape et ne marque pas le projet modifié.
    const past = state().past.length;
    state().placeInPlan(a, "a_incident", 0);
    expect(state().stepInPlan(b, "up")).toBe(false);
    expect(state().past.length).toBe(past);
  });

  it("carte supprimée ou qui change de type : elle quitte le plan affiché et le fichier", async () => {
    state().setPlanTemplate("troisActes");
    state().placeInPlan(a, "a_setup");
    state().placeInPlan(b, "a_setup");
    state().updateCard(a, { type: "idee" });
    expect(arrange(state().plan, planScenes(state().nodes)).beats[0].ids).toEqual([b]);
    state().deleteCard(b);
    await state().save();
    // La carte devenue Idée garde sa place si elle redevient une scène ; la carte à la corbeille aussi (lot 1.7.4 :
    // remise après une relance, elle retrouve sa case) ; supprimée pour de bon, elle est oubliée.
    expect((await meta()).plan).toEqual({ template: "troisActes", beats: { a_setup: [a, b] } });
    state().purgeTrash(b);
    await state().save();
    expect((await meta()).plan).toEqual({ template: "troisActes", beats: { a_setup: [a] } });
  });

  it("un projet scénario garde son plan de roman sans s'en servir", async () => {
    state().setPlanTemplate("voyageHeros");
    state().placeInPlan(a, "h_call");
    state().setKind("scenario");
    await state().save();
    expect((await meta()).plan).toEqual({ template: "voyageHeros", beats: { h_call: [a] } });
  });
});
