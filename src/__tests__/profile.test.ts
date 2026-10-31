// @vitest-environment happy-dom
// Profil de l'auteur : saisi une fois, gardé sur l'appareil, repris par chaque nouveau projet.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { authorName, cleanProfile, contactLines, EMPTY_PROFILE, readProfile } from "../profile";
import { layoutProse } from "../export/prose";
import { toMarkdown } from "../export/text";

const state = () => useCosmos.getState();
const ines = cleanProfile({ firstName: " Inès ", lastName: "Morvan", email: "ines@exemple.fr", phone: "06 12 34 56 78", address: "12 rue du Port\r\n\n29200 Brest" });

describe("profil (fonctions pures)", () => {
  it("nettoie les champs et compose nom signé et coordonnées", () => {
    expect(ines).toMatchObject({ firstName: "Inès", address: "12 rue du Port\n29200 Brest" });
    expect(cleanProfile({ firstName: 3, email: null })).toEqual(EMPTY_PROFILE);
    expect(authorName(ines)).toBe("Inès Morvan");
    expect(contactLines(ines)).toEqual(["12 rue du Port", "29200 Brest", "06 12 34 56 78", "ines@exemple.fr"]);
    // Avec un nom de plume : il signe l'œuvre, le nom civil passe en tête des coordonnées.
    const pen = { ...ines, penName: "I. M. Kerlaouen" };
    expect(authorName(pen)).toBe("I. M. Kerlaouen");
    expect(contactLines(pen)[0]).toBe("Inès Morvan");
  });

  it("reprend l'ancien nom d'auteur de l'appareil comme nom de plume", () => {
    expect(readProfile(undefined, "Inès Morvan").penName).toBe("Inès Morvan");
    expect(readProfile({ firstName: "Inès" }, "Autre")).toMatchObject({ firstName: "Inès", penName: "" });
  });
});

describe("profil dans les projets", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useSettings.getState().setProfile(EMPTY_PROFILE);
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {}, past: [], future: [] });
    await state().start();
  });
  afterEach(() => useSettings.getState().setProfile(EMPTY_PROFILE));

  it("un nouveau scénario reçoit auteur et coordonnées sur sa page de titre", async () => {
    useSettings.getState().setProfile(ines);
    expect(useSettings.getState().author).toBe("Inès Morvan");
    await state().createProject({ title: "Kerlaouen", kind: "scenario" });
    expect(state().screenplay!.titlePage).toEqual({
      Title: "Kerlaouen",
      Credit: "Écrit par",
      Author: "Inès Morvan",
      Contact: "12 rue du Port\n29200 Brest\n06 12 34 56 78\nines@exemple.fr",
    });
  });

  it("le nom tapé sur la page de titre ne touche jamais au profil (1.7.3)", async () => {
    useSettings.getState().setProfile(ines);
    await state().createProject({ title: "Kerlaouen", kind: "scenario" });
    // Effacé lettre par lettre puis retapé, comme à la main : le profil ne bouge pas.
    for (const name of ["Inès Morva", "I", "", "J", "Jean Lune"]) state().setTitlePageField("author", name);
    expect(state().screenplay!.titlePage.Author).toBe("Jean Lune");
    expect(useSettings.getState().profile).toEqual(cleanProfile(ines));
    expect(useSettings.getState().author).toBe("Inès Morvan");
  });

  it("sans profil, la page de titre ne porte que le titre", async () => {
    await state().createProject({ title: "Kerlaouen", kind: "scenario" });
    expect(state().screenplay!.titlePage).toEqual({ Title: "Kerlaouen" });
  });

  it("modifier le profil vaut pour les projets suivants", async () => {
    useSettings.getState().setProfile(ines);
    useSettings.getState().setProfile({ ...ines, penName: "I. M. Kerlaouen", phone: "" });
    await state().createProject({ title: "Suivant", kind: "scenario" });
    expect(state().screenplay!.titlePage.Author).toBe("I. M. Kerlaouen");
    expect(state().screenplay!.titlePage.Contact).toBe("Inès Morvan\n12 rue du Port\n29200 Brest\nines@exemple.fr");
  });
});

describe("page de garde du manuscrit exporté", () => {
  const doc = { title: "Kerlaouen", author: "Inès Morvan", contact: contactLines(ines), lang: "fr", chapters: [] };
  it("PDF : coordonnées en haut à gauche, titre et auteur au tiers de la page", () => {
    const [cover] = layoutProse(doc, { cols: 60, rows: 46 });
    expect(cover.lines.slice(-4).map((l) => [l.row, l.segments[0].col, l.segments[0].text])).toEqual([
      [0, 0, "12 rue du Port"],
      [1, 0, "29200 Brest"],
      [2, 0, "06 12 34 56 78"],
      [3, 0, "ines@exemple.fr"],
    ]);
    expect(cover.lines[0].row).toBe(15);
  });
  it("Markdown : coordonnées sous le nom", () => {
    expect(toMarkdown(doc)).toContain("Inès Morvan\n\n12 rue du Port  \n29200 Brest");
  });
});
