// @vitest-environment happy-dom
// Mode Lecture, mise au point (#103, #104) : choix rejoués après une correction, choix fermés et leur raison.

import { describe, expect, it } from "vitest";
import { closedChoices, matchPick } from "../interactive/playTrail";
import { choicesHtml } from "../interactive/choices";
import type { Fact } from "../interactive/facts";

describe("choix rejoué après une correction", () => {
  const open = [
    { text: "Aller au puits", index: 0 },
    { text: "Rentrer", index: 1 },
    { text: "Rentrer", index: 2 },
  ];
  it("est retrouvé par son texte, au même rang s'il y en a deux pareils", () => {
    expect(matchPick(open, { scene: "a", text: "Aller au puits", rank: 3 })).toBe(0);
    expect(matchPick(open, { scene: "a", text: "Rentrer", rank: 2 })).toBe(2);
    expect(matchPick(open, { scene: "a", text: "Rentrer", rank: 7 })).toBe(1);
  });
  it("n'est jamais remplacé par un autre quand il a changé", () => {
    expect(matchPick(open, { scene: "a", text: "Descendre", rank: 0 })).toBeNull();
  });
});

describe("choix fermés", () => {
  const facts: Fact[] = [
    { name: "cle", label: "la clé", kind: "bool", given: 1, needed: 1 },
    { name: "flamme", label: "flamme", kind: "int", given: 1, needed: 1 },
  ];
  const words = { ifFact: "avec « {fact} »", ifNot: "sans « {fact} »", ifCond: "si {cond}", cond: { and: "et", or: "ou", not: "sans « {fact} »" } };
  const html = choicesHtml(
    [
      "* { cle } [Ouvrir le coffre] -> c",
      "* { not cle } [Forcer le coffre] -> c",
      "* { flamme > 0 and cle } [Allumer] -> c",
      "* [Partir] -> d",
      "* { cle } [Secret] -> c #hidden",
    ].join("\n"),
  );
  it("sont les choix à condition qu'Ink ne propose pas, avec leur raison, sans les renvois cachés", () => {
    expect(closedChoices(html, ["Forcer le coffre", "Partir"], facts, words, "Continuer")).toEqual([
      { label: "Ouvrir le coffre", reason: "avec « la clé »" },
      { label: "Allumer", reason: "si flamme > 0 et la clé" },
    ]);
  });
  it("ne montrent rien quand tout est ouvert", () => {
    expect(closedChoices(html, ["Ouvrir le coffre", "Allumer", "Partir"], facts, words, "Continuer")).toEqual([
      { label: "Forcer le coffre", reason: "sans « la clé »" },
    ]);
  });
});
