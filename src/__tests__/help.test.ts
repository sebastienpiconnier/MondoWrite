// Aide en ligne : chaque chapitre visé par F1 existe dans le guide, dans chaque langue du guide.

import { describe, expect, it } from "vitest";
import { GUIDE_LANGS, GUIDE_SECTIONS, guideUrl } from "../help";
import guideFr from "../../docs/guide/guide.fr.html?raw";
import guideEn from "../../docs/guide/guide.en.html?raw";
import guideEs from "../../docs/guide/guide.es.html?raw";

describe("aide en ligne", () => {
  it("adresse dans la langue de l'interface, l'anglais pour toute autre", () => {
    expect(guideUrl("fr", "plan")).toBe("https://sebastienpiconnier.github.io/MondoWrite/fr/#plan");
    expect(guideUrl("en", "plan")).toBe("https://sebastienpiconnier.github.io/MondoWrite/en/#outline");
    expect(guideUrl("es", "plan")).toBe("https://sebastienpiconnier.github.io/MondoWrite/es/#esquema");
    expect(guideUrl("de")).toBe("https://sebastienpiconnier.github.io/MondoWrite/en/");
  });

  it("chaque ancre est un titre du guide", () => {
    const guides = { fr: guideFr, en: guideEn, es: guideEs };
    for (const lang of GUIDE_LANGS) {
      const html = guides[lang];
      for (const section of Object.values(GUIDE_SECTIONS)) expect(html, `${lang}#${section[lang]}`).toMatch(new RegExp(`<h[23] id="${section[lang]}">`));
    }
  });
});
