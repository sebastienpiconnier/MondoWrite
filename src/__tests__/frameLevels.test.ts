// Hiérarchie des cadres : niveau lu dans la position, titre agrandi de loin.

import { describe, expect, it } from "vitest";
import { fitBoost, frameDepth, frameLevel, titleBoost, titleSize } from "../frameLevels";

const box = (id: string, x: number, y: number, width: number, height: number) => ({ id, x, y, width, height });

describe("niveau d'un cadre", () => {
  const act = box("acte", 0, 0, 2000, 1000);
  const beat = box("case", 40, 80, 900, 800);
  const chapter = box("chapitre", 80, 200, 400, 300);
  const apart = box("perso", 3000, 0, 400, 400);
  const frames = [act, beat, chapter, apart];

  it("compte les cadres qui le contiennent tout entier", () => {
    expect(frameDepth("acte", frames)).toBe(0);
    expect(frameDepth("case", frames)).toBe(1);
    expect(frameDepth("chapitre", frames)).toBe(2);
    expect(frameDepth("perso", frames)).toBe(0);
    expect(frameDepth("inconnu", frames)).toBe(0);
  });

  it("un cadre qui dépasse n'est pas dedans ; deux cadres identiques ne se contiennent pas l'un l'autre", () => {
    expect(frameDepth("b", [box("a", 0, 0, 100, 100), box("b", 50, 50, 100, 100)])).toBe(0);
    const twins = [box("a", 0, 0, 100, 100), box("b", 0, 0, 100, 100)];
    expect(frameDepth("a", twins)).toBe(0);
    expect(frameDepth("b", twins)).toBe(1);
  });

  it("trois niveaux de titre au plus", () => {
    expect([0, 1, 2, 5].map(frameLevel)).toEqual([0, 1, 2, 2]);
  });
});

describe("titre agrandi de loin", () => {
  it("rien tant que les cartes se lisent (au-dessus de 56 %)", () => {
    expect(titleBoost(1, 0)).toBe(1);
    expect(titleBoost(0.6, 0)).toBe(1);
    expect(titleBoost(0.55, 0)).toBe(1.25);
    expect(titleBoost(2, 2)).toBe(1);
  });

  it("grandit quand on recule, par crans, jusqu'au plafond du niveau", () => {
    expect(titleBoost(0.35, 0)).toBe(2);
    expect(titleBoost(0.1, 0)).toBe(4);
    expect(titleBoost(0.1, 1)).toBe(2.5);
    expect(titleBoost(0.1, 2)).toBe(1.5);
    expect(titleBoost(0.3, 0) * 4 % 1).toBe(0);
  });

  it("zoom absurde : taille normale", () => {
    expect(titleBoost(0, 0)).toBe(1);
    expect(titleBoost(Number.NaN, 1)).toBe(1);
  });
});

describe("titre qui tient dans son cadre", () => {
  it("le mot le plus long tient sur une ligne", () => {
    const base = titleSize(0, false);
    const boost = fitBoost("Événements", 300, base, 4);
    expect(boost).toBeLessThan(4);
    expect(10 * 0.62 * base * boost + base * boost).toBeLessThanOrEqual(300 - 24);
  });
  it("cadre large : l'agrandissement du zoom ; jamais moins de 1", () => {
    expect(fitBoost("Le crime", 2000, 30, 3)).toBe(3);
    expect(fitBoost("Anticonstitutionnellement", 120, 30, 3)).toBe(1);
  });
  it("une case de premier niveau a le plus grand titre", () => {
    expect(titleSize(0, true)).toBeGreaterThan(titleSize(0, false));
    expect(titleSize(0, false)).toBeGreaterThan(titleSize(1, true));
    expect(titleSize(1, false)).toBeGreaterThan(titleSize(2, false));
  });
});
