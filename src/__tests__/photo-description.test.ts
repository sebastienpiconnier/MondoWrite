// Décrire une photo à la demande : pour un personnage, l'IA propose l'âge apparent et l'apparence de sa
// fiche (et des notes) ; pour toute autre carte, des notes. Seul ce qui se voit, jamais qui est la personne.

import { describe, expect, it } from "vitest";
import { describeCharacterPrompt, describeImagePrompt, parseCharacterPhoto, PHOTO_FIELDS } from "../ai/tasks";
import { sheetFields } from "../character";
import type { CardData } from "../types";

const ines: CardData = { id: "a1", type: "personnage", title: "Inès Morvan", html: "<p>Gardienne remplaçante.</p>" };

describe("photo d'un personnage", () => {
  it("la consigne : seulement le visible, en JSON, jamais l'identité ni ce qui ne se voit pas", () => {
    const prompt = describeCharacterPrompt(ines, "fr");
    expect(prompt.system).toMatch(/only what is visible/);
    expect(prompt.system).toMatch(/Never say who the person is/);
    expect(prompt.system).toMatch(/never guess ethnicity, religion, health, disability or sexual orientation/);
    expect(prompt.system).toMatch(/Do not infer personality/);
    expect(prompt.system).toMatch(/in français/);
    expect(JSON.parse(prompt.user)).toEqual({ character: "Inès Morvan", notes: "Gardienne remplaçante." });
  });

  it("les champs proposés sont ceux de la fiche d'un personnage", () => {
    for (const key of PHOTO_FIELDS) expect(sheetFields("personnage")).toContain(key);
  });

  it("la réponse : seuls l'âge et l'apparence, nettoyés et bornés ; les notes à part", () => {
    const reply = 'Voici : ```json\n{"fields": {"age": "la **trentaine**", "apparence": "Cheveux courts, ciré jaune.", "metier": "gardienne", "genre": "femme"}, "notes": ["- Regard fixe", "Allure fatiguée", "", 4]}\n```';
    expect(parseCharacterPhoto(reply)).toEqual({ fields: { age: "la trentaine", apparence: "Cheveux courts, ciré jaune." }, notes: ["Regard fixe", "Allure fatiguée"] });
  });

  it("une réponse vide ou illisible ne propose rien", () => {
    expect(parseCharacterPhoto("Je ne peux pas voir l'image.")).toEqual({ fields: {}, notes: [] });
    expect(parseCharacterPhoto('{"fields": "rien", "notes": "non"}')).toEqual({ fields: {}, notes: [] });
    expect(parseCharacterPhoto(`{"fields": {"age": "${"x".repeat(200)}"}}`).fields.age!.length).toBeLessThanOrEqual(61);
  });
});

describe("photo d'une autre carte", () => {
  it("des notes sur ce que montre l'image, sans identifier personne", () => {
    const prompt = describeImagePrompt({ id: "i1", type: "image", title: "Le phare en 1920", html: "" }, "en");
    expect(prompt.system).toMatch(/note only what is visible/);
    expect(prompt.system).toMatch(/do not identify real people/);
    expect(prompt.system).toMatch(/in English/);
  });
});
