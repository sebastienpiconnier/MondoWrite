// @vitest-environment happy-dom
// Page de titre du scénario (auteur, contact…) et découpage de la feuille en pages.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PROFILE } from "../profile";
import { META_FILE, SCREENPLAY_FILE, storage } from "../storage";
import { parse } from "../screenplay/parse";
import { serialize } from "../screenplay/serialize";
import { readTitleField, writeTitleField } from "../screenplay/titlePage";
import { layoutPages, type PageItem } from "../screenplay/editor/pages";
import { LAYOUTS } from "../screenplay/layout";
import { typesetTitlePage } from "../screenplay/export/typeset";

const state = () => useCosmos.getState();

describe("champs de la page de titre", () => {
  const page = { Title: "Le Phare des Absents", Authors: "Inès Morvan", Revision: "bleue" };

  it("lecture par champ, y compris sous une variante de clé", () => {
    expect(readTitleField(page, "title")).toBe("Le Phare des Absents");
    expect(readTitleField(page, "author")).toBe("Inès Morvan");
    expect(readTitleField(page, "contact")).toBe("");
  });

  it("écriture : ordre habituel d'une page de titre, clés inconnues gardées à la suite", () => {
    let next = writeTitleField(page, "contact", "12 rue du Port\n29200 Brest");
    next = writeTitleField(next, "credit", "Écrit par");
    expect(Object.keys(next)).toEqual(["Title", "Credit", "Authors", "Contact", "Revision"]);
    expect(serialize({ titlePage: next, elements: [] })).toBe(
      "Title: Le Phare des Absents\nCredit: Écrit par\nAuthors: Inès Morvan\nContact:\n    12 rue du Port\n    29200 Brest\nRevision: bleue\n",
    );
  });

  it("valeur nettoyée : espaces et lignes vides en trop retirés ; vide = champ supprimé", () => {
    expect(writeTitleField(page, "contact", "  12 rue du Port  \n\n 29200 Brest \n")).toMatchObject({ Contact: "12 rue du Port\n29200 Brest" });
    expect(writeTitleField(page, "author", "   ")).toEqual({ Title: "Le Phare des Absents", Revision: "bleue" });
  });

  it("rien ne change : même objet", () => {
    expect(writeTitleField(page, "title", "Le Phare des Absents ")).toBe(page);
    expect(writeTitleField(page, "copyright", "")).toBe(page);
  });

  it("le fichier écrit se relit à l'identique, et la page de garde du PDF montre le contact", () => {
    let titlePage = writeTitleField({ Title: "Kerlaouen" }, "author", "Inès Morvan");
    titlePage = writeTitleField(titlePage, "contact", "12 rue du Port\n29200 Brest\nines@exemple.fr");
    titlePage = writeTitleField(titlePage, "date", "7 octobre 2026");
    expect(parse(serialize({ titlePage, elements: [{ type: "action", text: "Action." }] })).titlePage).toEqual(titlePage);
    const lines = typesetTitlePage(titlePage, LAYOUTS.a4).map((l) => l.text);
    expect(lines).toEqual(["Kerlaouen", "Inès Morvan", "12 rue du Port", "29200 Brest", "ines@exemple.fr", "7 octobre 2026"]);
  });
});

describe("page de titre dans le projet", () => {
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr", author: "", profile: EMPTY_PROFILE });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "scenario" });
  });
  afterEach(() => useSettings.setState({ lang: "en", author: "", profile: EMPTY_PROFILE }));

  it("nom d'auteur : enregistré, avec la mention « Écrit par » posée la première fois", async () => {
    state().setTitlePageField("author", "Inès Morvan");
    expect(state().status).toBe("modifie");
    await state().save();
    expect((await storage.readAll())![SCREENPLAY_FILE]).toBe("Title: Kerlaouen\nCredit: Écrit par\nAuthor: Inès Morvan\n");

    // La mention se change ou s'efface ; elle n'est pas reposée ensuite.
    state().setTitlePageField("credit", "");
    state().setTitlePageField("author", "Inès M.");
    expect(state().screenplay!.titlePage).toEqual({ Title: "Kerlaouen", Author: "Inès M." });
  });

  it("adresse de contact sur plusieurs lignes", async () => {
    state().setTitlePageField("contact", "12 rue du Port\n29200 Brest");
    await state().save();
    expect((await storage.readAll())![SCREENPLAY_FILE]).toBe("Title: Kerlaouen\nContact:\n    12 rue du Port\n    29200 Brest\n");
  });

  it("le titre de la page de garde renomme le projet tant qu'ils étaient identiques", async () => {
    state().setTitlePageField("title", "Le Phare des Absents");
    expect(state().title).toBe("Le Phare des Absents");
    await state().save();
    expect(JSON.parse((await storage.readAll())![META_FILE]).title).toBe("Le Phare des Absents");

    // Dans l'autre sens aussi : renommer le projet renomme la page de garde.
    state().setTitle("Projet phare");
    expect(readTitleField(state().screenplay!.titlePage, "title")).toBe("Projet phare");

    // Un fichier venu d'ailleurs peut porter un autre titre que le projet : chacun garde alors le sien.
    state().setScreenplay({ ...state().screenplay!, titlePage: { Title: "LE PHARE DES ABSENTS" } });
    state().setTitlePageField("title", "LE PHARE");
    expect(state().title).toBe("Projet phare");
    state().setTitle("Autre nom de travail");
    expect(readTitleField(state().screenplay!.titlePage, "title")).toBe("LE PHARE");
  });

  it("le nom d'auteur est retenu sur l'appareil et proposé au scénario suivant", async () => {
    state().setTitlePageField("author", "Inès Morvan");
    expect(useSettings.getState().author).toBe("Inès Morvan");
    await state().closeProject();
    await state().createProject({ title: "Suivant", kind: "scenario" });
    expect(state().screenplay!.titlePage).toEqual({ Title: "Suivant", Credit: "Écrit par", Author: "Inès Morvan" });
  });

  it("rien ne change : même scénario rendu, projet pas marqué modifié", async () => {
    await state().save();
    const before = state().screenplay;
    expect(state().setTitlePageField("title", "Kerlaouen")).toBe(before);
    expect(state().status).toBe("enregistre");
  });

  it("projet roman : pas de page de titre", async () => {
    await state().closeProject();
    await state().createProject({ title: "Roman", kind: "roman" });
    expect(state().setTitlePageField("author", "Inès Morvan")).toBeNull();
  });
});

describe("découpage en pages", () => {
  const item = (height: number, margin = 1, keep = 0): PageItem => ({ height, margin, keep });

  it("gabarits : la page entière, en lignes (6 par pouce)", () => {
    expect(LAYOUTS.letter.pageLines).toBe(66);
    expect(LAYOUTS.a4.pageLines).toBeCloseTo(70.14);
    // Proportions réelles : 8,5 × 11 pouces et 210 × 297 mm.
    expect(((LAYOUTS.a4.pageLines / 6) / LAYOUTS.a4.width)).toBeCloseTo(297 / 210, 2);
    expect(LAYOUTS.letter.linesPerPage + 6).toBeLessThanOrEqual(LAYOUTS.letter.pageLines);
  });

  it("une suite de réplique qui ouvre une page y prend une ligne de plus (le nom et SUITE)", () => {
    const cont: PageItem = { height: 6, margin: 0, keep: 0, cont: true };
    expect(layoutPages([item(50), cont, item(2)], 55)).toEqual({
      breaks: [{ index: 1, rest: 5, page: 2 }],
      tail: 55 - (1 + 6 + 1 + 2),
      pages: 2,
    });
  });

  it("tout tient sur une page : pas de coupure, le bas de page reste", () => {
    expect(layoutPages([item(1), item(3), item(2)], 55)).toEqual({ breaks: [], tail: 47, pages: 1 });
    expect(layoutPages([], 55)).toEqual({ breaks: [], tail: 55, pages: 1 });
  });

  it("l'élément qui ne tient plus ouvre la page suivante, sans marge en haut de page", () => {
    // 50 lignes, puis 1 + 6 = 57 > 55 : coupure, il reste 5 lignes en bas de la première page.
    expect(layoutPages([item(50), item(6), item(2)], 55)).toEqual({
      breaks: [{ index: 1, rest: 5, page: 2 }],
      tail: 55 - (6 + 1 + 2),
      pages: 2,
    });
  });

  it("page de titre ou dédicace : le texte commence plus bas, la page garde sa hauteur", () => {
    // 9 lignes de marge en plus : 2 lignes de texte, il reste 55 - 9 - 2 = 44 lignes en bas de page.
    expect(layoutPages([item(2, 0)], 55, 9)).toEqual({ breaks: [], tail: 44, pages: 1 });
    // Le décalage ne vaut que pour la première page.
    expect(layoutPages([item(40, 0), item(10, 0), item(3, 0)], 55, 9)).toEqual({ breaks: [{ index: 1, rest: 6, page: 2 }], tail: 42, pages: 2 });
    // Un décalage négatif (marge plus petite) est ignoré.
    expect(layoutPages([item(2, 0)], 55, -3).tail).toBe(53);
  });

  it("une page exactement pleine ne déborde pas", () => {
    expect(layoutPages([item(50), item(4)], 55).breaks).toEqual([]);
    expect(layoutPages([item(50), item(4)], 55).tail).toBe(0);
  });

  it("un en-tête de scène ne reste pas seul en bas de page ; un personnage non plus", () => {
    // Il reste 3 lignes : ligne vide + en-tête + 2 lignes à garder ne tiennent pas.
    expect(layoutPages([item(52), item(1, 1, 2), item(4)], 55).breaks).toEqual([{ index: 1, rest: 3, page: 2 }]);
    expect(layoutPages([item(51), item(1, 1, 2), item(4)], 55).breaks.map((b) => b.index)).toEqual([2]);
    expect(layoutPages([item(53), item(1, 1, 1), item(2, 0)], 55).breaks).toEqual([{ index: 1, rest: 2, page: 2 }]);
  });

  it("hauteurs mesurées à l'écran : une petite imprécision ne crée pas de page", () => {
    expect(layoutPages([item(50.04), item(3.98)], 55).breaks).toEqual([]);
  });

  it("un paragraphe plus haut qu'une page : la suite repart sur une nouvelle page", () => {
    const result = layoutPages([item(80), item(1)], 55);
    expect(result.breaks).toEqual([{ index: 1, rest: 0, page: 2 }]);
  });

  it("long métrage : autant de pages que de tranches de 55 lignes, à peu près", () => {
    const scene = [item(1, 1, 2), item(3), item(1, 1, 1), item(2, 0), item(4)];
    const { pages } = layoutPages(Array.from({ length: 200 }, () => scene).flat(), 55);
    // 200 scènes de 15 lignes (marges comprises) : 3 000 lignes, soit 55 pages au moins.
    expect(pages).toBeGreaterThanOrEqual(55);
    expect(pages).toBeLessThanOrEqual(60);
  });
});
