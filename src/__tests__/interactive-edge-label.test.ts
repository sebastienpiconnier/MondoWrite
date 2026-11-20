// @vitest-environment happy-dom
// Étiquette d'une flèche de choix sur le canevas : jamais le code d'une condition.

import { describe, expect, it } from "vitest";
import { ruleSummary } from "../components/ChoiceRules";
import type { Fact } from "../interactive/facts";

const words = { ifFact: "si {fact}", ifNot: "si pas : {fact}", ifMany: "sous conditions", gives: "+ {fact}", cond: { and: "et", or: "ou", not: "pas : {fact}" } };
const facts: Fact[] = [{ name: "nom_donne", label: "a donné son nom", kind: "bool", given: 1, needed: 1 }];
const line = (cond?: string, effects?: string[]) => ({ label: "Lever la lanterne", target: "le_nom", ...(cond ? { cond } : {}), ...(effects ? { effects } : {}) });

describe("étiquette d'une flèche de choix", () => {
  it("dit un fait simple avec son libellé", () => {
    expect(ruleSummary(line("nom_donne"), facts, words).before).toBe("si a donné son nom");
    expect(ruleSummary(line("not nom_donne"), facts, words).before).toBe("si pas : a donné son nom");
  });
  it("résume une condition à plusieurs termes, sans son code", () => {
    expect(ruleSummary(line("not nom_donne and ourdas and reconnu and flamme > 0"), facts, words).before).toBe("sous conditions");
    expect(ruleSummary(line("RANDOM(1, 6) > 3"), facts, words).before).toBe("sous conditions");
  });
  it("dit un compteur seul en clair", () => {
    expect(ruleSummary(line("flamme > 0"), facts, words).before).toBe("si flamme > 0");
  });
});
