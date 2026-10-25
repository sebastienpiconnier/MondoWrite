import { describe, expect, it } from "vitest";
import { parse } from "../screenplay/parse";
import { screenplaySceneTexts, timeline } from "../timeline";
import type { CardData } from "../types";

const card = (id: string, type: CardData["type"], title: string): CardData => ({ id, type, title, html: "" }) as CardData;

describe("chronologie d'un scénario", () => {
  const els = parse(`INT. APPARTEMENT D'ETHAN - JOUR [[cosmos:s1]]

Ethan dort.

L'HOMME
Debout !

EXT. RUE - JOUR [[cosmos:s2]]

LA VOISINE
Bonjour, Ethan.
`).elements;
  const cards = [card("s1", "scene", "A"), card("s2", "scene", "B"), card("e", "personnage", "Ethan"), card("h", "personnage", "L'Homme"), card("v", "personnage", "La Voisine"), card("r", "lieu", "Rue")];

  it("une scène cite son décor, ses personnages qui parlent et l'action, pas les répliques", () => {
    const groups = timeline(cards, [], screenplaySceneTexts(els), ["s1", "s2"], "fr");
    const row = (id: string) => groups.flatMap((g) => g.rows).find((r) => r.card.id === id)!;
    expect(row("e").cells).toEqual(["cited", "none"]);
    expect(row("h").cells).toEqual(["cited", "none"]);
    expect(row("v").cells).toEqual(["none", "cited"]);
    expect(row("r").cells).toEqual(["none", "cited"]);
  });
});
