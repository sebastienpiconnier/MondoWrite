import { describe, expect, it } from "vitest";
import { spellOnInPages } from "../writingAids";
import { LT_NONE, ltLive } from "../languagetool/api";

describe("correcteur du système et LanguageTool", () => {
  it("le texte des scènes n'est corrigé par le système qu'avec « Partout »", () => {
    expect(spellOnInPages("all")).toBe(true);
    expect(spellOnInPages("notes")).toBe(false);
    expect(spellOnInPages("off")).toBe(false);
  });
  it("s'arrête dans les pages quand LanguageTool vérifie pendant la frappe", () => {
    expect(spellOnInPages("all", true)).toBe(false);
  });
  it("l'API publique (à la demande) ne coupe pas le correcteur du système", () => {
    expect(ltLive({ ...LT_NONE, server: "public", live: true })).toBe(false);
  });
});
