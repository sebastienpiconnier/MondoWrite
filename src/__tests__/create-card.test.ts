import { describe, expect, it } from "vitest";
import { createQuery } from "../components/createCard";
import type { CardData } from "../types";

const card = (title: string): CardData => ({ id: title, type: "personnage", title, html: "" });

describe("createQuery : « /Nom » dans le texte du manuscrit", () => {
  it("prend un nom d'un mot, en début de ligne ou après un espace", () => {
    expect(createQuery("/Marie", [])).toEqual({ name: "Marie", length: 6 });
    expect(createQuery("Il vit /Marie", [])).toEqual({ name: "Marie", length: 6 });
  });

  it("prend un nom de plusieurs mots, jusqu'à six", () => {
    expect(createQuery("Il vit le /Phare des vœux pieux", [])).toEqual({ name: "Phare des vœux pieux", length: 21 });
    expect(createQuery("/un deux trois quatre cinq six", [])?.name).toBe("un deux trois quatre cinq six");
    expect(createQuery("/un deux trois quatre cinq six sept", [])).toBeNull();
  });

  it("garde le menu quand on tape l'espace après le nom, sans l'inclure dans le nom", () => {
    expect(createQuery("Il vit /Phare ", [])).toEqual({ name: "Phare", length: 7 });
  });

  it("ne se déclenche pas dans « et/ou », « 1/2 » ou « / » seul, ni quand le nom commence par un espace", () => {
    expect(createQuery("et/ou", [])).toBeNull();
    expect(createQuery("1/2", [])).toBeNull();
    expect(createQuery("a / b", [])).toBeNull();
    expect(createQuery("/", [])).toBeNull();
    expect(createQuery("Il dit / Marie", [])).toBeNull();
  });

  it("ne propose rien quand une fiche porte déjà ce nom (sans tenir compte des accents ni de la casse)", () => {
    expect(createQuery("Il vit /marie", [card("Marie")])).toBeNull();
    expect(createQuery("Il vit /Phare des vœux", [card("Phare des vœux")])).toBeNull();
  });
});
