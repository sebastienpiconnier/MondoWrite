// @vitest-environment happy-dom
// La couverture et la Bible suivent la forme du projet, lue dans la pastille Format : film, série,
// mini-série, ou format pas encore choisi (octobre 2026).

import { describe, expect, it } from "vitest";
import { FILM_TEXTS, SERIES_TEXTS, askableFields, chipsFor, formOf, isSeriesForm, otherTexts, pitchFields, readPitch, writingTexts } from "../pitch";
import { feasibilityText, pitchLabels } from "../feasibility";
import { isSeries } from "../review/checks";
import { parse } from "../screenplay/parse";
import { paginate } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { buildBiblePack, type PackSource } from "../export/biblePack";
import { defaultsFor } from "../bibleExport";
import { demoProject } from "../demo";
import { fromProject } from "../projectState";
import { typesFor } from "../types";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

describe("forme du projet", () => {
  it("lue dans le format, dans les deux langues, accents ou pas", () => {
    expect(formOf("roman", { format: "Long métrage" })).toBe("roman");
    for (const f of [...fr.pitch.suggestScenario.format, ...en.pitch.suggestScenario.format]) expect(formOf("scenario", { format: f })).not.toBe("libre");
    expect(formOf("scenario", { format: "Long-métrage, 110 min" })).toBe("film");
    expect(formOf("scenario", { format: "Court metrage" })).toBe("film");
    expect(formOf("scenario", { format: "Téléfilm" })).toBe("film");
    expect(formOf("scenario", { format: "Feature film" })).toBe("film");
    expect(formOf("scenario", { format: "Série, 8 × 52 min" })).toBe("serie");
    expect(formOf("scenario", { format: "TV series, 8 x 52 min" })).toBe("serie");
    expect(formOf("scenario", { format: "Mini-série" })).toBe("miniserie");
    expect(formOf("scenario", { format: "Limited series (miniseries)" })).toBe("miniserie");
  });

  it("sans format : une couverture de série d'avant reste une série, sinon rien n'est deviné", () => {
    expect(formOf("scenario", {})).toBe("libre");
    expect(formOf("scenario", { pourquoi: "Parce que." })).toBe("libre");
    expect(formOf("scenario", { arene: "Le phare." })).toBe("serie");
    expect(formOf("scenario", { forme: "Bouclée" })).toBe("serie");
    // Le format a le dernier mot : un film garde ses anciennes rubriques de série, à part.
    expect(formOf("scenario", { format: "Long métrage", arene: "Le phare." })).toBe("film");
  });

  it("rubriques d'écriture : un film n'a ni saison ni épisodes, une mini-série n'a pas de suite", () => {
    expect(writingTexts("serie")).toEqual(SERIES_TEXTS);
    expect(writingTexts("miniserie")).not.toContain("suite");
    expect(writingTexts("miniserie")).toContain("saison");
    expect(writingTexts("film")).toEqual(FILM_TEXTS);
    for (const k of ["arene", "mecanique", "episodeType", "saison", "finSaison", "suite", "avantPilote"]) expect(writingTexts("film")).not.toContain(k);
    expect(writingTexts("film")).toEqual(expect.arrayContaining(["noteRealisation", "traitement", "faisabilite", "pourquoi", "nestPas"]));
    expect(writingTexts("libre")).toEqual([]);
    expect(writingTexts("roman")).toEqual([]);
  });

  it("une rubrique remplie qui n'est pas celle du format est montrée à part, jamais perdue", () => {
    const pitch = { format: "Long métrage", arene: "Le phare.", pourquoi: "Parce que.", noteRealisation: "Caméra à l'épaule." };
    expect(otherTexts(pitch, "film")).toEqual(["arene"]);
    expect(otherTexts({ format: "Série", noteRealisation: "x", arene: "y" }, "serie")).toEqual(["noteRealisation"]);
    expect(otherTexts({ arene: "x" }, "roman")).toEqual([]);
  });

  it("pastilles Forme et Pilote pour une série seulement ; champs comptés selon la forme", () => {
    expect(chipsFor("scenario", "film")).not.toContain("forme");
    expect(chipsFor("scenario", "film")).not.toContain("pilote");
    expect(chipsFor("scenario", "libre")).not.toContain("forme");
    expect(chipsFor("scenario", "miniserie")).toEqual(expect.arrayContaining(["forme", "pilote"]));
    expect(chipsFor("scenario")).toContain("forme");
    expect(pitchFields("scenario", "film")).toContain("noteRealisation");
    expect(pitchFields("scenario", "film")).not.toContain("arene");
    expect(pitchFields("scenario", "serie")).not.toContain("noteRealisation");
    expect(pitchFields("roman")).not.toContain("faisabilite");
    expect(pitchFields("scenario", "libre")).not.toContain("pourquoi");
  });

  it("« Questionner » : les questions du film ; jamais le traitement ni la faisabilité", () => {
    expect(askableFields("scenario", "film")).toContain("noteRealisation");
    expect(askableFields("scenario", "film")).not.toContain("traitement");
    expect(askableFields("scenario", "film")).not.toContain("faisabilite");
    expect(askableFields("scenario", "film")).not.toContain("mecanique");
    for (const lang of [fr, en]) {
      const labels = pitchLabels(lang.pitch, "film");
      for (const k of askableFields("scenario", "film")) expect(labels.questions[k]).toBeTruthy();
      for (const k of FILM_TEXTS) expect(labels.fields[k] && labels.placeholders[k]).toBeTruthy();
      expect(pitchLabels(lang.pitch, "film").questions.pourquoi).not.toBe(lang.pitch.questions.pourquoi);
      expect(pitchLabels(lang.pitch, "miniserie").fields.saison).not.toBe(lang.pitch.fields.saison);
      expect(pitchLabels(lang.pitch, "serie").fields).toEqual(lang.pitch.fields);
    }
  });

  it("pas de carte Épisode dans un film, sauf s'il en a déjà", () => {
    expect(typesFor("scenario", false, true)).not.toContain("episode");
    expect(typesFor("scenario", true, true)).toContain("episode");
    expect(typesFor("scenario")).toContain("episode");
  });

  it("les nouvelles clés se relisent", () => {
    expect(readPitch({ noteRealisation: "a", traitement: "b", faisabilite: "c" })).toEqual({ noteRealisation: "a", traitement: "b", faisabilite: "c" });
  });

  it("« Vérifier » n'attend des épisodes que d'une série", () => {
    expect(isSeries({ format: "Long métrage", arene: "x" })).toBe(false);
    expect(isSeries({ format: "Mini-série" })).toBe(true);
    expect(isSeries({ arene: "x" })).toBe(true);
    expect(isSeriesForm("libre")).toBe(false);
  });
});

const script = [
  "INT. PHARE - NUIT",
  "",
  "Inès monte.",
  "",
  "INÈS",
  "Il y a quelqu'un ?",
  "",
  "EXT. GRÈVE - JOUR",
  "",
  "YANN",
  "Personne.",
  "",
  "INT. PHARE - PLUS TARD",
  "",
  "INÈS",
  "Alors qui ?",
  "",
].join("\n");

describe("faisabilité d'un film", () => {
  const sp = parse(script);
  const pagination = paginate(sp.elements, LAYOUTS.letter);

  it("tirée du scénario : scènes, décors, intérieur et extérieur, jour et nuit, rôles, décors principaux", () => {
    const text = feasibilityText(sp.elements, [], pagination, fr.pitch, "fr");
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^3 scènes, 1 page \(/);
    expect(lines[1]).toBe("2 décors\u00a0: 2 scènes en intérieur, 1 en extérieur");
    // « PLUS TARD » reprend le jour de la scène d'avant.
    expect(lines[2]).toBe("2 scènes de jour, 1 de nuit");
    expect(lines[3]).toBe("2 rôles parlants");
    expect(lines[4]).toMatch(/^Décors principaux\u00a0: Phare \(2\), Grève \(1\)$/i);
    expect(feasibilityText(sp.elements, [], pagination, en.pitch, "en")).toContain("2 speaking parts");
  });

  it("vide tant que le scénario n'a pas de scène", () => {
    expect(feasibilityText([], [], null, fr.pitch)).toBe("");
  });
});

describe("Bible d'un film", () => {
  const base = fromProject(demoProject());
  const source = (pitch: PackSource["pitch"]): PackSource => ({
    title: "Le phare",
    kind: "scenario",
    nodes: base.nodes,
    edges: base.edges,
    plan: base.plan,
    manuscript: {},
    pitch,
    screenplay: parse(script),
    goals: {},
  });
  const ctx = { t: fr, lang: "fr", author: "Camille", date: new Date(2026, 9, 30) };
  const all = (pack: ReturnType<typeof buildBiblePack>) => JSON.stringify(pack.sections);

  it("dossier de film : note de réalisation, faisabilité calculée, rien de la série, premières pages du scénario", () => {
    const pitch = { format: "Long métrage", noteRealisation: "Caméra à l'épaule.", arene: "Le phare.", mecanique: "Une tempête par épisode.", forme: "Bouclée" };
    const pack = buildBiblePack(source(pitch), defaultsFor("tiers", "scenario"), ctx);
    expect(pack.kind).toBe(fr.bibleExport.kinds.film);
    const text = all(pack);
    expect(text).toContain("Caméra à l'épaule.");
    expect(text).toContain(fr.pitch.fields.noteRealisation);
    expect(text).toContain("2 rôles parlants");
    expect(text).not.toContain("Une tempête par épisode.");
    expect(text).not.toContain("Bouclée");
    expect(pack.sections.some((s) => s.title === fr.bibleExport.firstPagesTitle)).toBe(true);
    expect(pack.sections.some((s) => s.title === fr.bibleExport.pilotTitle)).toBe(false);
  });

  it("la faisabilité écrite par l'auteur remplace les chiffres ; le traitement est imprimé s'il est rempli", () => {
    const pack = buildBiblePack(source({ format: "Court métrage", faisabilite: "Un seul décor, deux nuits.", traitement: "Inès monte au phare." }), defaultsFor("moi", "scenario"), ctx);
    const text = all(pack);
    expect(text).toContain("Un seul décor, deux nuits.");
    expect(text).not.toContain("rôles parlants");
    expect(text).toContain("Inès monte au phare.");
  });

  it("une série garde sa bible de série, sans faisabilité", () => {
    const pack = buildBiblePack(source({ format: "Série, 8 × 52 min", mecanique: "Une tempête par épisode." }), defaultsFor("tiers", "scenario"), ctx);
    expect(pack.kind).toBe(fr.bibleExport.kinds.series);
    expect(all(pack)).toContain("Une tempête par épisode.");
    expect(all(pack)).not.toContain("rôles parlants");
  });
});
