// Un sélecteur du store doit rendre le même objet tant que rien ne change : sinon React redessine en boucle
// (« getSnapshot should be cached ») et la fenêtre reste vide. Cas réel : roman en gabarit libre (1.7.0 à 1.7.2).

import { describe, expect, it } from "vitest";
import { beatKeys, caseRank } from "../components/FrameLabels";

type S = Parameters<typeof beatKeys>[0];
const state = (plan: object, kind = "roman") => ({ kind, plan, screenplay: { titlePage: {}, elements: [] } }) as unknown as S;

describe("beatKeys rend un tableau stable", () => {
  it("roman, gabarit libre", () => {
    const s = state({ template: "libre", beats: {} });
    expect(beatKeys(s)).toBe(beatKeys(s));
    expect(beatKeys(s)).toEqual([]);
  });
  it("roman, gabarit livré et « Mes gabarits »", () => {
    const livre = state({ template: "troisActes", beats: {} });
    expect(beatKeys(livre)).toBe(beatKeys(livre));
    const custom = { name: "Mien", beats: [{ key: "u1", label: "Début", hint: "" }] };
    const perso = state({ template: "perso", beats: {}, custom });
    expect(beatKeys(perso)).toBe(beatKeys(perso));
    expect(beatKeys(perso)).toEqual(["u1"]);
  });
  it("scénario sans gabarit", () => {
    const s = state({ template: "libre", beats: {} }, "scenario");
    expect(beatKeys(s)).toBe(beatKeys(s));
  });
});

// Lot 17 ter : le rang d'une case est devenu un objet ; recréé à chaque appel pour un roman, « Organiser »
// faisait boucler React sur le canevas du projet d'exemple.
describe("caseRank rend un objet stable", () => {
  it("roman, gabarit livré", () => {
    const s = state({ template: "troisActes", beats: {} });
    const key = beatKeys(s)[1];
    expect(caseRank(s, key)).toBe(caseRank(s, key));
    expect(caseRank(s, key)).toMatchObject({ n: 2 });
  });
});
