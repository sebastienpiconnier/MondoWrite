// Aide en ligne : chaque chapitre visé par F1 existe dans le guide, dans les deux langues.

import { describe, expect, it } from "vitest";
import { GUIDE_SECTIONS, guideUrl } from "../help";
import guideFr from "../../docs/guide/guide.fr.html?raw";
import guideEn from "../../docs/guide/guide.en.html?raw";

describe("aide en ligne", () => {
  it("adresse dans la langue de l'interface, l'anglais pour toute autre", () => {
    expect(guideUrl("fr", "plan")).toBe("https://sebastienpiconnier.github.io/MondoWrite/fr/#plan");
    expect(guideUrl("en", "plan")).toBe("https://sebastienpiconnier.github.io/MondoWrite/en/#outline");
    expect(guideUrl("de")).toBe("https://sebastienpiconnier.github.io/MondoWrite/en/");
  });

  it("chaque ancre est un titre du guide", () => {
    for (const lang of ["fr", "en"] as const) {
      const html = lang === "fr" ? guideFr : guideEn;
      for (const section of Object.values(GUIDE_SECTIONS)) expect(html, `${lang}#${section[lang]}`).toContain(`<h2 id="${section[lang]}">`);
    }
  });
});
