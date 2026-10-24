// Complétion : personnages, extensions, préfixes, décors, moments.

import { describe, expect, it } from "vitest";
import { parse } from "../parse";
import { suggest, titleCase, type SuggestData } from "../editor/autocomplete";
import { fr } from "../../i18n/fr";
import { en } from "../../i18n/en";

const source = [
  "INT. PHARE, LANTERNE - NUIT",
  "",
  "INÈS",
  "Un.",
  "",
  "HUGO (H.C.)",
  "Deux.",
  "",
  "INÈS",
  "Trois.",
  "",
  "EXT. PORT - JOUR",
  "",
  "INT. PHARE, LANTERNE - AUBE",
  "",
  ".Inès trouve le journal de bord",
  "",
].join("\n");

const data = (overrides: Partial<SuggestData> = {}): SuggestData => ({
  characterCards: ["Inès Morvan", "Hugo Le Bris", "Le gardien"],
  locationCards: ["Phare de Kerlaouen", "Port"],
  elements: parse(source).elements,
  currentIndex: -1,
  locale: "fr",
  moments: fr.screenplay.moments,
  extensions: fr.screenplay.extensions,
  labels: fr.screenplay.suggest,
  ...overrides,
});

const labels = (type: string, text: string, d = data()) => suggest(type, text, d).items.map((item) => item.label);

describe("personnage", () => {
  it("taper HU propose HUGO, présélectionné, puis ses extensions", () => {
    const result = suggest("character", "HU", data());
    expect(result.items.map((i) => i.label)).toEqual(["HUGO", "HUGO LE BRIS"]);
    expect(result.items[0]).toMatchObject({ text: "HUGO", hint: "personnage" });
    expect(result.active).toBe(0);
  });

  it("un seul nom possible : ses extensions suivent", () => {
    expect(labels("character", "HUGO L")).toEqual(["HUGO LE BRIS", "HUGO LE BRIS (V.O.)", "HUGO LE BRIS (H.C.)", "HUGO LE BRIS (SUITE)"]);
  });

  it("nom complet : seulement ses variantes, rien de présélectionné (Entrée passe au dialogue)", () => {
    const result = suggest("character", "HUGO", data());
    expect(result.items.map((i) => i.label)).toEqual(["HUGO LE BRIS", "HUGO (V.O.)", "HUGO (H.C.)", "HUGO (SUITE)"]);
    expect(result.active).toBe(-1);
  });

  it("rien de tapé : tous les noms, les plus utilisés d'abord, sans présélection", () => {
    const result = suggest("character", "", data());
    expect(result.items.map((i) => i.label)).toEqual(["INÈS", "HUGO", "HUGO LE BRIS", "INÈS MORVAN", "LE GARDIEN"]);
    expect(result.active).toBe(-1);
  });

  it("sans casse ni accents, et sans proposer un article seul", () => {
    expect(labels("character", "ine")[0]).toBe("INÈS");
    expect(labels("character", "LE")).toEqual(["LE GARDIEN", "LE GARDIEN (V.O.)", "LE GARDIEN (H.C.)", "LE GARDIEN (SUITE)"]);
  });

  it("le nom en cours d'écriture ne se propose pas lui-même", () => {
    const elements = [...parse(source).elements, { type: "character" as const, text: "ZO" }];
    expect(labels("character", "ZO", data({ elements, currentIndex: elements.length - 1 }))).toEqual(["Créer la fiche de Zo"]);
  });

  it("personnage sans carte : propose de la créer, sans la présélectionner", () => {
    const result = suggest("character", "LÉA", data());
    expect(result.items).toEqual([
      { key: "create", label: "Créer la fiche de Léa", hint: "nouvelle carte", create: { type: "personnage", title: "Léa" } },
    ]);
    expect(result.active).toBe(-1);
    // INÈS a déjà sa carte (« Inès Morvan »).
    expect(labels("character", "INÈS")).not.toContain("Créer la fiche de Inès");
  });

  it("extension en cours de frappe", () => {
    const result = suggest("character", "HUGO (", data());
    expect(result.items.map((i) => i.text)).toEqual(["HUGO (V.O.)", "HUGO (H.C.)", "HUGO (SUITE)"]);
    expect(result.active).toBe(0);
    expect(labels("character", "HUGO (h")).toEqual(["HUGO (H.C.)"]);
    expect(labels("character", "HUGO (H.C.)")).toEqual([]);
  });

  it("extensions anglaises", () => {
    const english = data({ extensions: en.screenplay.extensions, labels: en.screenplay.suggest, locale: "en" });
    expect(labels("character", "HUGO (", english)).toEqual(["HUGO (V.O.)", "HUGO (O.S.)", "HUGO (CONT'D)"]);
  });
});

describe("en-tête de scène", () => {
  it("préfixes", () => {
    expect(suggest("sceneHeading", "", data())).toMatchObject({ active: -1 });
    expect(labels("sceneHeading", "")).toEqual(["INT.", "EXT.", "INT./EXT."]);
    const result = suggest("sceneHeading", "e", data());
    expect(result.items).toEqual([{ key: "prefix:EXT.", label: "EXT.", hint: "extérieur", text: "EXT. " }]);
    expect(result.active).toBe(0);
    expect(labels("sceneHeading", "INT")).toEqual(["INT.", "INT./EXT."]);
  });

  it("un en-tête libre ne propose rien", () => {
    expect(labels("sceneHeading", "Inès trouve le journal")).toEqual([]);
    expect(labels("sceneHeading", "PHARE")).toEqual([]);
  });

  it("décors : ceux du scénario d'abord (les plus utilisés), puis les cartes", () => {
    const result = suggest("sceneHeading", "INT. ", data());
    expect(result.items.map((i) => i.label)).toEqual(["PHARE, LANTERNE", "PORT", "PHARE DE KERLAOUEN"]);
    expect(result.active).toBe(-1);
  });

  it("décor en cours de frappe : complète et prépare le moment", () => {
    const result = suggest("sceneHeading", "EXT. pha", data());
    expect(result.items.map((i) => i.text)).toEqual(["EXT. PHARE, LANTERNE - ", "EXT. PHARE DE KERLAOUEN - "]);
    expect(result.active).toBe(0);
    // Au milieu du nom aussi.
    expect(labels("sceneHeading", "INT. LANT")).toEqual(["PHARE, LANTERNE"]);
  });

  it("décor déjà complet : rien de présélectionné", () => {
    expect(suggest("sceneHeading", "EXT. PORT", data()).active).toBe(-1);
  });

  it("moments, selon la langue", () => {
    expect(labels("sceneHeading", "EXT. PORT - ")).toEqual(fr.screenplay.moments);
    const result = suggest("sceneHeading", "EXT. PORT - n", data());
    expect(result.items).toEqual([{ key: "moment:NUIT", label: "NUIT", hint: "moment", text: "EXT. PORT - NUIT" }]);
    expect(result.active).toBe(0);
    expect(labels("sceneHeading", "EXT. PORT - NUIT")).toEqual([]);
    expect(labels("sceneHeading", "EXT. PORT - d", data({ moments: en.screenplay.moments }))).toEqual(["DAY", "DAWN", "DUSK"]);
  });

  it("décor sans carte : propose de la créer après le tiret", () => {
    const result = suggest("sceneHeading", "INT. MAIRIE, ARCHIVES - ", data());
    expect(result.items[result.items.length - 1]).toEqual({
      key: "create",
      label: "Créer le décor Mairie, Archives",
      hint: "nouvelle carte",
      create: { type: "lieu", title: "Mairie, Archives" },
    });
    expect(result.active).toBe(-1);
    expect(labels("sceneHeading", "INT. MAIRIE - JOUR")).toEqual(["Créer le décor Mairie"]);
  });
});

describe("autres éléments", () => {
  it("aucune suggestion", () => {
    for (const type of ["action", "dialogue", "parenthetical", "transition"]) {
      expect(suggest(type, "HU", data()).items, type).toEqual([]);
    }
  });
});

describe("titre d'une carte créée", () => {
  it("majuscules initiales, accents et apostrophes compris", () => {
    expect(titleCase("LE GARDIEN", "fr")).toBe("Le Gardien");
    expect(titleCase("ÉLODIE D’ARC", "fr")).toBe("Élodie d’Arc");
    expect(titleCase("MARIE-CLAIRE", "fr")).toBe("Marie-Claire");
    expect(titleCase("GRANDMOTHER'S HOUSE", "en", true)).toBe("Grandmother's House");
    expect(titleCase("SEAN O'BRIEN", "en")).toBe("Sean O'Brien");
  });
});

describe("titleCase", () => {
  it("garde les petits mots d'un lieu en minuscules, sauf en tête", () => {
    expect(titleCase("MAISON DE LA MÈRE", "fr", true)).toBe("Maison de la Mère");
    expect(titleCase("LA FORÊT", "fr", true)).toBe("La Forêt");
    expect(titleCase("CHEMIN DE L'ÉCOLE", "fr", true)).toBe("Chemin de l'École");
    expect(titleCase("HOUSE OF THE RISING SUN", "en", true)).toBe("House of the Rising Sun");
    expect(titleCase("SAINT-MALO", "fr", true)).toBe("Saint-Malo");
  });
  it("ne garde que les particules d'un nom de personne", () => {
    expect(titleCase("HUGO LE BRIS", "fr")).toBe("Hugo Le Bris");
    expect(titleCase("JEAN DE FLORETTE", "fr")).toBe("Jean de Florette");
    expect(titleCase("O'BRIEN", "en")).toBe("O'Brien");
    expect(titleCase("LE GARDIEN", "fr")).toBe("Le Gardien");
  });
});
