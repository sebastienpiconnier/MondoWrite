// @vitest-environment happy-dom
// Un projet écrit par une version plus récente de MondoWrite : ce que celle-ci ne connaît pas est gardé et réécrit.

import { describe, expect, it } from "vitest";
import { cardToFile, fileToCard } from "../storage/markdown";
import { unknownMeta } from "../store";
import { readPitch } from "../pitch";

describe("compatibilité avec les versions futures", () => {
  it("une carte garde ses lignes inconnues, ses champs de fiche inconnus et son type inconnu", () => {
    const text = [
      "---",
      "id: k3x9a7bq2m",
      "type: confrerie",
      'title: "Les gardiens"',
      'fiche: {"age":"34 ans","devise":"Tenir la lumière","nombre":3}',
      'membres: ["a","b"]',
      "couleur: bleu",
      "---",
      "Une confrérie.",
      "",
    ].join("\n");
    const card = fileToCard(text)!;
    // Affichée comme une Idée, sans perdre ce qu'elle était.
    expect(card.type).toBe("idee");
    expect(card.keep).toEqual({ type: "confrerie", front: { membres: '["a","b"]', couleur: "bleu" }, fiche: { age: "34 ans", devise: "Tenir la lumière" } });
    const again = cardToFile(card);
    expect(again).toContain("type: confrerie");
    expect(again).toContain('membres: ["a","b"]');
    expect(again).toContain("couleur: bleu");
    expect(again).toContain('"devise":"Tenir la lumière"');
    // Relu, rien n'a bougé.
    expect(fileToCard(again)).toEqual(card);
  });

  it("une carte de cette version n'a rien à garder, et un type choisi remplace le type inconnu", () => {
    const card = { id: "p", type: "personnage" as const, title: "Inès", html: "", fiche: { age: "34 ans" } };
    expect(fileToCard(cardToFile(card))!.keep).toBeUndefined();
    const moved = { ...card, type: "personnage" as const, keep: { type: "confrerie" } };
    expect(cardToFile(moved)).toContain("type: personnage");
  });

  it("une carte Épisode (lot 6) garde sa fiche : numéro, synopsis, pivot", () => {
    const card = { id: "e1", type: "episode" as const, title: "Le signal", html: "", fiche: { numero: "1", synopsis: "Inès entend.", pivot: "p" } };
    const again = fileToCard(cardToFile(card))!;
    expect(again).toMatchObject(card);
    expect(again.keep).toBeUndefined();
  });

  it("les clés de la couverture du lot 6 sont relues (la 1.3.1 les garde aussi, comme clés inconnues)", () => {
    const pitch = { saison: "Le signal", finSaison: "En mer", nestPas: "Pas d’horreur", pourquoiMoi: "Mon grand-père" };
    expect(readPitch(pitch)).toEqual(pitch);
  });

  it("les clés inconnues de cosmos.json sont repérées pour être réécrites", () => {
    expect(unknownMeta({ version: 1, title: "K", layout: [], links: [], timeline2: { a: 1 }, glossary: [] })).toEqual({ timeline2: { a: 1 }, glossary: [] });
  });
});
