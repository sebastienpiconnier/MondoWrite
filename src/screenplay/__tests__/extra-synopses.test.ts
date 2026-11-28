import { describe, expect, it } from "vitest";
import { parse } from "../parse";
import { serialize } from "../serialize";
import { synopsesToNotes } from "../extraSynopses";

// Export d'un logiciel qui écrit une ligne « = » par étape : une sous l'en-tête, puis une avant chaque bloc d'action.
const SOURCE = `Title: Le Phare

= Une série au large.

#Prologue

= L'avant-propos de l'acte.

INT. PHARE - NUIT #1#

= Inès monte à la lanterne.

= Elle trouve le cahier.

La lampe est froide.

= Le cahier parle d'elle.

Elle lit à voix haute.

EXT. QUAI - JOUR

Yann attend.

= Il voit la lumière.

Il court.
`;

describe("synopsis en trop changés en notes (#169)", () => {
  const { elements, converted } = synopsesToNotes(parse(SOURCE).elements);
  const kinds = elements.map((el) => `${el.type}:${el.text}`);

  it("garde le premier synopsis sous l'en-tête, change les autres en notes à leur place", () => {
    expect(converted).toBe(3);
    const phare = kinds.indexOf("sceneHeading:INT. PHARE - NUIT");
    expect(kinds.slice(phare + 1, phare + 6)).toEqual([
      "synopsis:Inès monte à la lanterne.",
      "note:Elle trouve le cahier.",
      "action:La lampe est froide.",
      "note:Le cahier parle d'elle.",
      "action:Elle lit à voix haute.",
    ]);
    expect(kinds).toContain("note:Il voit la lumière.");
  });

  it("laisse le synopsis d'une section et ce qui précède la première scène", () => {
    expect(kinds).toContain("synopsis:L'avant-propos de l'acte.");
    expect(kinds).toContain("synopsis:Une série au large.");
  });

  it("s'écrit en Fountain comme des notes, relues telles quelles", () => {
    const text = serialize({ titlePage: {}, elements });
    expect(text).toContain("[[Elle trouve le cahier.]]");
    expect(parse(text).elements.filter((el) => el.type === "note").map((el) => el.text)).toEqual([
      "Elle trouve le cahier.",
      "Le cahier parle d'elle.",
      "Il voit la lumière.",
    ]);
  });

  it("rend le même tableau quand rien ne change", () => {
    const plain = parse("INT. PHARE - NUIT\n\n= Un seul synopsis.\n\nLa lampe.\n").elements;
    const result = synopsesToNotes(plain);
    expect(result.converted).toBe(0);
    expect(result.elements).toBe(plain);
  });
});
