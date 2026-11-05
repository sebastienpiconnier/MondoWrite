// Premier test : valide la chaîne Vitest sur un module sans dépendance au navigateur.

import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLang, isLang, LANGS } from "../langs";

const withSystemLangs = (...languages: string[]) =>
  vi.stubGlobal("navigator", { languages, language: languages[0] });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isLang", () => {
  it("reconnaît les langues disponibles", () => {
    for (const lang of LANGS) expect(isLang(lang)).toBe(true);
  });

  it("refuse le reste", () => {
    expect(isLang("zz")).toBe(false);
    expect(isLang("FR")).toBe(false);
    expect(isLang(undefined)).toBe(false);
  });
});

describe("detectLang", () => {
  it("prend la langue du système si elle est disponible", () => {
    withSystemLangs("fr-CA", "en-US");
    expect(detectLang()).toBe("fr");
  });

  it("suit l'ordre de préférence du système", () => {
    withSystemLangs("zz-ZZ", "FR-fr", "en-US");
    expect(detectLang()).toBe("fr");
  });

  it("retombe sur l'anglais sinon", () => {
    withSystemLangs("zz-ZZ", "yy");
    expect(detectLang()).toBe("en");
  });
});
