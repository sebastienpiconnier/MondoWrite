// Bible v2, lot 2 : la fiche personnage (accroche, arc en deux temps, personnage principal).
import { describe, expect, it } from "vitest";
import { PRINCIPAL, bandFields, isPrincipal, readFiche, sheetFields } from "../character";
import { THEME_KEYS, fieldToFill, placeAnswer } from "../assistant";
import { bibleDoc } from "../export/doc";
import { cardToFile, fileToCard } from "../storage/markdown";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import type { CardData } from "../types";

const person = (fiche?: Record<string, string>): CardData => ({ id: "p1", type: "personnage", title: "Inès", html: "", fiche });

describe("fiche personnage v2", () => {
  it("lit et réécrit les nouvelles clés", () => {
    const fiche = { accroche: "Elle classe la mémoire des autres.", debut: "Seule.", fin: "Elle raconte.", principal: PRINCIPAL };
    expect(readFiche(fiche, "personnage")).toEqual(fiche);
    const card = fileToCard(cardToFile(person(fiche)))!;
    expect(card.fiche).toEqual(fiche);
    expect(card.keep).toBeUndefined();
  });

  it("ignore une valeur de « principal » autre que « oui »", () => {
    expect(readFiche({ principal: "true", age: "34" }, "personnage")).toEqual({ age: "34" });
    expect(readFiche({ principal: "oui" }, "lieu")).toBeUndefined();
  });

  it("relit un ancien personnage sans ces clés, blessure comprise, sans rien changer", () => {
    const old = { objectif: "Savoir", besoin: "Parler", blessure: "La nuit du naufrage", arc: "Seule puis entourée" };
    expect(readFiche(old, "personnage")).toEqual(old);
    expect(isPrincipal(person(old))).toBe(false);
  });

  it("montre accroche, arc et principal hors de la liste de la fiche", () => {
    const band = bandFields(person());
    for (const key of ["accroche", "debut", "fin", "principal", "arcType", "arc", "objectif", "besoin", "blessure"]) expect(band.has(key)).toBe(true);
    expect(sheetFields("personnage")).toContain("voix");
    expect(band.has("voix")).toBe(false);
  });

  it("repère un personnage principal", () => {
    expect(isPrincipal(person({ principal: PRINCIPAL }))).toBe(true);
    expect(isPrincipal({ type: "lieu", fiche: { principal: PRINCIPAL } })).toBe(false);
  });

  it("n'écrit jamais « principal » dans la bible exportée, mais garde l'accroche", () => {
    const doc = bibleDoc({ title: "K", author: "", lang: "fr" }, [person({ accroche: "Une archiviste.", principal: PRINCIPAL })], [], {
      sections: { personnage: "Personnages" } as never,
      untitled: "Sans titre",
      linkedTo: "Relié à",
      fields: fr.character.fields,
    });
    const text = doc.chapters[0].blocks.map((b) => ("runs" in b ? b.runs.map((r) => r.text).join("") : "")).join("\n");
    expect(text).toContain("En une phrase : Une archiviste.");
    expect(text).not.toContain("Personnage principal");
  });

  it("range la réponse « En une phrase » dans l'accroche, telle qu'écrite", () => {
    expect(THEME_KEYS.essentiel).toContain("hook");
    expect(fieldToFill("hook", person())).toBe("accroche");
    expect(placeAnswer(person(), "hook", "Une archiviste qui fuit sa mémoire.")?.fiche).toEqual({ accroche: "Une archiviste qui fuit sa mémoire." });
    expect(fr.assistant.questions.hook).toBeTruthy();
    expect(en.assistant.questions.hook).toBeTruthy();
  });

  it("libelle la troisième case du moteur « Blessure, conflit intérieur »", () => {
    expect(fr.character.motor.labels.blessure).toBe("Blessure, conflit intérieur");
    expect(en.character.motor.labels.blessure).toBe("Wound, inner conflict");
  });
});
