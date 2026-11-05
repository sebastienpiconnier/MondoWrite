// Outil des traducteurs (scripts/i18n.mjs) : étiquettes, inscription dans langs.ts, fichier produit.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonical, identifier, register, toSource } from "./i18n.mjs";

describe("npm run i18n", () => {
  it("étiquettes et noms d'export", () => {
    expect(canonical("pt_br")).toBe("pt-BR");
    expect(canonical("DE")).toBe("de");
    expect(identifier("pt-BR")).toBe("ptBR");
    expect(identifier("de")).toBe("de");
  });

  it("inscrit une langue aux lignes repères de langs.ts, une seule fois, dans l'ordre", () => {
    const langs = readFileSync(new URL("../src/i18n/langs.ts", import.meta.url), "utf8");
    const once = register(register(langs, "de"), "pt-BR");
    expect(once).toContain('import { de } from "./de";');
    expect(once).toContain('import { ptBR } from "./pt-BR";');
    expect(once.indexOf("  de,")).toBeLessThan(once.indexOf('  "pt-BR": ptBR,'));
    expect(once.indexOf('  "pt-BR": ptBR,')).toBeLessThan(once.indexOf("} as const satisfies"));
    expect(register(once, "de")).toBe(once);
  });

  it("écrit un objet de textes relisible", () => {
    const value = { meta: { name: "Deutsch" }, "a-b": ["x", "y"], text: "« guillemets »  et \"droits\"" };
    expect(new Function(`return ${toSource(value)}`)()).toEqual(value);
  });
});
