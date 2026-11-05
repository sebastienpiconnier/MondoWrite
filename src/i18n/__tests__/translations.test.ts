// Langues de la communauté (langs.ts) et typographie des textes d'interface de chaque langue (typoRules.ts).

import { describe, expect, it } from "vitest";
import { fr, type Messages } from "../fr";
import { en } from "../en";
import { COMMUNITY_LANGS, DICTIONARIES, FREE_LISTS, LANGS, allStrings, langCoverage, complete, coverage, matchLang, untranslated } from "../langs";
import { NBSP, NNBSP, quoteMarks, typoRules, type HighPunct } from "../../typoRules";

describe("traduction partielle", () => {
  const partial = { meta: { name: "Deutsch" }, settings: { language: "Sprache" } };

  it("ce qui manque s'affiche en anglais", () => {
    const de = complete(en, partial);
    expect(de.meta.name).toBe("Deutsch");
    expect(de.settings.language).toBe("Sprache");
    expect(de.settings.theme).toBe(en.settings.theme);
    expect(allStrings(de).size).toBe(allStrings(en).size);
  });

  it("une chaîne vide, une liste de longueur différente ou une clé inconnue sont ignorées", () => {
    const list = en.screenplay.extensions;
    const de = complete(en, { meta: { name: "Deutsch" }, settings: { language: " " }, screenplay: { extensions: [list[0]] }, obsolete: "x" });
    expect(de.settings.language).toBe("Language");
    expect(de.screenplay.extensions).toEqual(list);
    expect("obsolete" in de).toBe(false);
  });

  it("une liste de même longueur est reprise élément par élément", () => {
    const list = en.screenplay.extensions.map((e, i) => (i === 0 ? { ...e, text: "(OFF)" } : {}));
    const de = complete(en, { meta: { name: "Deutsch" }, screenplay: { extensions: list } });
    expect(de.screenplay.extensions[0].text).toBe("(OFF)");
    expect(de.screenplay.extensions[1]).toEqual(en.screenplay.extensions[1]);
  });

  it("part traduite : une chaîne identique à l'anglais reste à traduire, sauf si elle est la même en français", () => {
    const total = allStrings(en).size;
    const frs = allStrings(fr);
    const neutral = [...allStrings(en)].filter(([path, text]) => frs.get(path) === text).length;
    expect(untranslated({ meta: { name: "Deutsch" } })).toHaveLength(total - neutral - 1);
    expect(untranslated(partial)).toHaveLength(total - neutral - 2);
    // Le français, lui, est tout traduit par rapport à l'anglais.
    expect(untranslated(fr)).toHaveLength(0);
    expect(coverage(fr)).toBe(1);
    expect(coverage(partial)).toBeLessThan(0.01);
  });

  it("le français et l'anglais sont complets", () => {
    expect(langCoverage("fr")).toBe(1);
    expect(langCoverage("en")).toBe(1);
  });

  it("une liste libre (suggestions) peut avoir une autre longueur, une liste rangée par position non", () => {
    const de = complete(en, { meta: { name: "Deutsch" }, pitch: { suggest: { temps: ["Präteritum", "Präsens", "Perfekt", "Futur", "Plusquamperfekt"] } }, charStats: { csvHeaders: ["Name"] } });
    expect(de.pitch.suggest.temps).toHaveLength(5);
    expect(de.charStats.csvHeaders).toEqual(en.charStats.csvHeaders);
    expect(untranslated({ meta: { name: "Deutsch" }, pitch: { suggest: { temps: ["Präsens"] } } }).some((p) => p.startsWith("pitch.suggest.temps"))).toBe(false);
  });

  it("chaque langue inscrite est complétée et nommée", () => {
    const fixed = [...allStrings(en).keys()].filter((p) => !FREE_LISTS.some((f) => p.startsWith(`${f}.`) || p.startsWith(`${f}[`)));
    for (const code of LANGS) {
      const d: Messages = DICTIONARIES[code];
      expect(d.meta.name.trim()).not.toBe("");
      const paths = allStrings(d);
      for (const p of fixed) expect(paths.has(p), `${code} ${p}`).toBe(true);
    }
  });
});

describe("langue du système", () => {
  it("variante exacte, puis langue de base", () => {
    const langs = ["fr", "en", "pt-BR"];
    expect(matchLang("pt-br", langs)).toBe("pt-BR");
    expect(matchLang("pt-PT", langs)).toBeNull();
    expect(matchLang("fr-CA", langs)).toBe("fr");
    expect(matchLang("EN_us", langs)).toBe("en");
    expect(matchLang(undefined, langs)).toBeNull();
  });
});

/**
 * Typographie des textes d'interface : chaque fichier de langue suit les règles de sa langue (typoRules.ts).
 * Exceptions : l'usage du scénario anglo-saxon garde son apostrophe droite, (CONT'D) ; « › » sépare les
 * étapes d'un chemin de menu (Réglages › Écriture), ce n'est pas un guillemet.
 */
const ALLOWED = /CONT'D/g;

/** `untranslatedFrom` : textes encore en anglais (copiés par `npm run i18n -- new`), qui ne sont pas vérifiés. */
function typographyErrors(dict: unknown, lang: string, untranslatedFrom?: Messages): string[] {
  const rules = typoRules(lang);
  const marks = quoteMarks(lang);
  const errors: string[] = [];
  const english = untranslatedFrom ? allStrings(untranslatedFrom) : null;
  for (const [path, raw] of allStrings(dict)) {
    if (english?.get(path) === raw) continue;
    const text = raw.replace(ALLOWED, "");
    const fail = (why: string) => errors.push(`${lang} ${path} : ${why} (${raw.slice(0, 80)})`);
    if (text.includes("'")) fail("apostrophe droite, écrire ’");
    if (text.includes('"')) fail(`guillemet droit, écrire ${rules.quotes[0]} ${rules.quotes[1]}`);
    if (text.includes("...")) fail("trois points, écrire …");
    for (const ch of "«»„“”‘‚") if (text.includes(ch) && !marks.has(ch)) fail(`guillemet ${ch} étranger à la langue`);
    for (const mark of [";", ":", "!", "?"] as HighPunct[]) {
      const space = rules.before[mark];
      const re = new RegExp(`(\\S?)([ ${NBSP}${NNBSP}]?)\\${mark}(?=\\s|$|[»)”“])`, "g");
      for (const m of text.matchAll(re)) {
        const [, prev, before] = m;
        if (!prev || /[\s(]/.test(prev)) continue; // signe cité seul : « : », (?)
        // Avant ; ! ? la fine insécable est l'usage, l'insécable ordinaire reste admise (texte de Perrault).
        const ok = space ? before === space || (space === NNBSP && before === NBSP) : before === "";
        if (!ok) fail(space ? `écrire l'espace ${space === NBSP ? "insécable" : "fine insécable"} avant ${mark}` : `pas d'espace avant ${mark}`);
      }
    }
    if (rules.quoteSpace) {
      const [open, close] = rules.quotes;
      if (new RegExp(`${open}(?!${rules.quoteSpace})`).test(text) || new RegExp(`(?<!${rules.quoteSpace})${close}`).test(text)) fail(`espace insécable dans ${open} ${close}`);
    }
  }
  return errors;
}

describe("typographie des textes de chaque langue", () => {
  it("français", () => expect(typographyErrors(fr, "fr")).toEqual([]));
  it("anglais", () => expect(typographyErrors(en, "en")).toEqual([]));
  for (const [code, file] of Object.entries(COMMUNITY_LANGS)) {
    it(code, () => expect(typographyErrors(file, code, en)).toEqual([]));
  }

  it("le contrôle repère les fautes courantes", () => {
    expect(typographyErrors({ a: "Il dit : oui" }, "fr")).toHaveLength(1);
    expect(typographyErrors({ a: `Vraiment${NNBSP}?` }, "fr")).toHaveLength(0);
    expect(typographyErrors({ a: "« oui »" }, "fr")).toHaveLength(1);
    expect(typographyErrors({ a: "Don't" }, "en")).toHaveLength(1);
    expect(typographyErrors({ a: `Wirklich${NNBSP}?` }, "de")).toHaveLength(1);
    expect(typographyErrors({ a: "Er sagt “ja”" }, "de")).toHaveLength(1);
    expect(typographyErrors({ a: "Er sagt „ja“" }, "de")).toHaveLength(0);
    expect(typographyErrors({ a: "Wait..." }, "en")).toHaveLength(1);
    // Un texte encore en anglais dans une traduction allemande n'est pas une faute d'allemand.
    expect(typographyErrors({ settings: { language: "Language" } }, "de", en)).toHaveLength(0);
  });
});
