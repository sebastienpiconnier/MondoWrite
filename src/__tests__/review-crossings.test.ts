import { describe, expect, it } from "vitest";
import type { ScreenplayElement } from "../screenplay/model";
import type { CardData } from "../types";
import { castForMatrix, neverMeet, novelCast, screenplayCast, shared, sharedById, topDuo } from "../review/crossings";
import { filterElements, keptScenes } from "../review/filter";

const el = (type: ScreenplayElement["type"], text: string): ScreenplayElement => ({ type, text }) as ScreenplayElement;
const card = (id: string, type: CardData["type"], title: string, fiche?: Record<string, string>): CardData => ({ id, type, title, html: "", fiche }) as CardData;

const script: ScreenplayElement[] = [
  el("sceneHeading", "EXT. BOIS - JOUR"),
  el("action", "Le Loup guette."),
  el("character", "CHAPERON"),
  el("dialogue", "Bonjour."),
  el("sceneHeading", "INT. MAISON - NUIT"),
  el("character", "MÈRE-GRAND"),
  el("dialogue", "Tire la chevillette."),
  el("character", "LE LOUP"),
  el("dialogue", "Merci."),
  el("sceneHeading", "INT. MAISON - PLUS TARD"),
  el("character", "CHAPERON"),
  el("dialogue", "Que vous avez de grandes dents !"),
  el("character", "LE LOUP"),
  el("dialogue", "C’est pour te manger."),
  el("sceneHeading", "INT. CHEZ LA MÈRE - JOUR"),
  el("character", "LA MÈRE"),
  el("dialogue", "Va voir ta mère-grand."),
];
const cards = [card("w", "personnage", "Le Loup"), card("c", "personnage", "Chaperon"), card("g", "personnage", "Mère-grand")];

describe("qui croise qui, scénario", () => {
  const cast = screenplayCast(script, cards, "fr");
  const by = (name: string) => cast.people.find((p) => p.name === name)!;
  it("scènes où chacun parle ou est nommé", () => {
    expect(by("Le Loup").scenes).toEqual([1, 2, 3]);
    expect(by("Chaperon").scenes).toEqual([1, 3]);
    expect(by("LA MÈRE").scenes).toEqual([4]);
    expect(cast.scenes).toHaveLength(4);
  });
  it("paires, duo, jamais", () => {
    expect(shared(by("Le Loup"), by("Chaperon"))).toEqual([1, 3]);
    const top = topDuo(cast.people)!;
    expect([top.a.name, top.b.name].sort()).toEqual(["Chaperon", "Le Loup"]);
    const never = neverMeet(cast.people).map((p) => [p.a.name, p.b.name].sort().join("+"));
    expect(never).toContain("LA MÈRE+Le Loup");
    expect(never).not.toContain("Chaperon+Le Loup");
    expect(sharedById(cast.people, "w", "g")).toBe(1);
  });
  it("la matrice garde les plus présents", () => {
    expect(castForMatrix(cast.people, 2).map((p) => p.name)).toEqual(["Le Loup", "Chaperon"]);
  });
  it("le filtre à deux ne garde que leurs scènes communes", () => {
    expect(keptScenes(script, { name: "LE LOUP", with: "CHAPERON", mode: "scenes" })).toEqual([0, 9]);
    const seen = filterElements(script, { name: "LE LOUP", with: "CHAPERON", mode: "lines" });
    expect(seen[4]).toBe("hide");
    expect(seen[11]).toBe("show");
    expect(seen[13]).toBe("show");
  });
});

describe("qui croise qui, roman", () => {
  it("scènes dont le texte nomme le personnage", () => {
    const manuscript = { s1: "<p>Le Loup croise Chaperon.</p>", s2: "<p>Mère-grand dort.</p>" };
    const cast = novelCast(manuscript, ["s1", "s2", "s3"], [...cards, card("s1", "scene", "Le bois")]);
    expect(cast.people.find((p) => p.id === "c")!.scenes).toEqual([1]);
    expect(cast.scenes[0]).toEqual({ number: 1, title: "Le bois", cardId: "s1" });
    expect(sharedById(cast.people, "w", "c")).toBe(1);
  });
});
