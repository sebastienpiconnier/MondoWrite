// Règles typographiques de chaque langue (typoRules.ts) et typographie à la frappe (typography.ts).

import { describe, expect, it } from "vitest";
import { NBSP, NNBSP, TYPO_LANGS, TYPO_RULES, csvSeparator, punct, quote, typoCode, typoOptions } from "../typoRules";
import { isTypographySetting, smartType, typographyMode } from "../typography";
import { defaultPaper } from "../screenplay/layout";
import { language } from "../ai/tasks";
import { momentOf } from "../review/places";

describe("table des règles", () => {
  it("chaque langue a deux paires de guillemets, un tiret et une apostrophe", () => {
    for (const code of TYPO_LANGS) {
      const r = TYPO_RULES[code];
      expect(code).toBe(code.toLowerCase());
      expect(r.quotes).toHaveLength(2);
      expect(r.inner).toHaveLength(2);
      expect(["—", "–"]).toContain(r.dash);
      expect(["’", "‘"]).toContain(r.wordStartQuote);
    }
  });

  it("variante exacte, puis langue de base, puis anglais", () => {
    expect(typoCode("pt-BR")).toBe("pt-br");
    expect(typoCode("pt_PT")).toBe("pt");
    expect(typoCode("de-AT")).toBe("de");
    expect(typoCode("FR-ca")).toBe("fr");
    expect(typoCode("ja")).toBe("en");
  });

  it("guillemets, deux-points et séparateur CSV de la langue", () => {
    expect(quote("Le phare", "fr")).toBe(`«${NBSP}Le phare${NBSP}»`);
    expect(quote("Leuchtturm", "de")).toBe("„Leuchtturm“");
    expect(quote("Faro", "es")).toBe("«Faro»");
    expect(quote("Lighthouse", "en")).toBe("“Lighthouse”");
    expect(quote("Lighthouse", "en-GB")).toBe("‘Lighthouse’");
    expect(quote("Fyr", "da")).toBe("»Fyr«");
    expect(punct(":", "fr")).toBe(`${NBSP}:`);
    expect(punct("?", "fr")).toBe(`${NNBSP}?`);
    expect(punct(":", "de")).toBe(":");
    expect(csvSeparator("fr")).toBe(";");
    expect(csvSeparator("de")).toBe(";");
    expect(csvSeparator("en")).toBe(",");
  });

  it("le menu nomme chaque langue dans celle de l'interface, avec ses guillemets", () => {
    const options = typoOptions("fr");
    expect(options).toHaveLength(TYPO_LANGS.length);
    expect(options.find((o) => o.code === "de")).toMatchObject({ language: "Allemand", quotes: "„…“" });
    expect(typoOptions("en").find((o) => o.code === "fr")!.language).toBe("French");
  });

  it("réglage : auto suit l'interface, une langue connue est acceptée", () => {
    expect(typographyMode("auto", "fr")).toBe("fr");
    expect(typographyMode("auto", "pt-BR")).toBe("pt-br");
    expect(typographyMode("de", "fr")).toBe("de");
    expect(typographyMode("off", "fr")).toBe("off");
    expect(isTypographySetting("de")).toBe(true);
    expect(isTypographySetting("fr")).toBe(true);
    expect(isTypographySetting("xx")).toBe(false);
  });
});

describe("frappe selon la langue", () => {
  it("allemand : „ “, demi-cadratin, rien avant ? !", () => {
    expect(smartType("Er sagt ", '"', "de")).toEqual({ remove: 0, insert: "„" });
    expect(smartType("Er sagt „ja", '"', "de")).toEqual({ remove: 0, insert: "“" });
    expect(smartType("Wirklich ", "?", "de")).toBeNull();
    expect(smartType("-", "-", "de")).toEqual({ remove: 1, insert: "–" });
    expect(smartType("geht", "'", "de")).toEqual({ remove: 0, insert: "’" });
  });

  it("espagnol et italien : « » sans espaces", () => {
    expect(smartType("Dijo ", '"', "es")).toEqual({ remove: 0, insert: "«" });
    expect(smartType("Dijo «sí", '"', "es")).toEqual({ remove: 0, insert: "»" });
    expect(smartType("Disse «sì ", '"', "it")).toEqual({ remove: 0, insert: "»" });
    expect(smartType("-", "-", "es")).toEqual({ remove: 1, insert: "—" });
  });

  it("suédois : même guillemet des deux côtés, par parité", () => {
    expect(smartType("Hon sa ", '"', "sv")).toEqual({ remove: 0, insert: "”" });
    expect(smartType("Hon sa ”ja", '"', "sv")).toEqual({ remove: 0, insert: "”" });
    expect(smartType("Hon sa ”ja” och ", '"', "sv")).toEqual({ remove: 0, insert: "”" });
  });

  it("danois : » « (sens inverse)", () => {
    expect(smartType("Hun sagde ", '"', "da")).toEqual({ remove: 0, insert: "»" });
    expect(smartType("Hun sagde »ja", '"', "da")).toEqual({ remove: 0, insert: "«" });
  });

  it("anglais britannique : ' donne ‘ ’, \" les doubles “ ”", () => {
    expect(smartType("She said ", "'", "en-gb")).toEqual({ remove: 0, insert: "‘" });
    expect(smartType("She said ‘yes", "'", "en-gb")).toEqual({ remove: 0, insert: "’" });
    expect(smartType("She said ", '"', "en-gb")).toEqual({ remove: 0, insert: "“" });
    expect(smartType("-", "-", "en-gb")).toEqual({ remove: 1, insert: "–" });
  });

  it("français : inchangé (« », insécables)", () => {
    expect(smartType("Il dit ", '"', "fr")).toEqual({ remove: 0, insert: `«${NBSP}` });
    expect(smartType(`Il dit «${NBSP}oui `, '"', "fr")).toEqual({ remove: 1, insert: `${NBSP}»` });
    expect(smartType(`Il dit «${NBSP}oui${NBSP}»`, "!", "fr")).toEqual({ remove: 0, insert: `${NNBSP}!` });
    expect(smartType("Vraiment ", "?", "fr")).toEqual({ remove: 1, insert: `${NNBSP}?` });
  });

  it("une adresse ne bouge dans aucune langue", () => {
    for (const code of TYPO_LANGS) expect(smartType("https://site.de/a-", "-", code)).toBeNull();
  });
});

describe("ce qui dépend de la langue ailleurs", () => {
  it("papier : Letter en anglais d'Amérique, A4 ailleurs", () => {
    expect(defaultPaper("en")).toBe("letter");
    expect(defaultPaper("fr")).toBe("a4");
    expect(defaultPaper("de")).toBe("a4");
    expect(defaultPaper("en-GB")).toBe("a4");
  });

  it("moments d'un en-tête espagnol : DÍA, NOCHE, MÁS TARDE", () => {
    expect(momentOf("DÍA")).toBe("day");
    expect(momentOf("NOCHE")).toBe("night");
    expect(momentOf("TARDE")).toBe("day");
    expect(momentOf("MÁS TARDE")).toBe("other");
    expect(momentOf("PLUS TARD")).toBe("other");
  });

  it("consignes de l'IA : la langue nommée en anglais", () => {
    expect(language("fr")).toBe("français");
    expect(language("de")).toBe("German");
    expect(language("pt-BR")).toBe("Brazilian Portuguese");
  });
});
