// Gabarits du séquencier : les cases sont des sections Fountain, marquées par une note.

import { describe, expect, it } from "vitest";
import { parse } from "../screenplay/parse";
import { serialize } from "../screenplay/serialize";
import { blocks } from "../screenplay/sequence";
import { PLAN_TEMPLATES } from "../plan";
import {
  SCREENPLAY_TEMPLATES,
  applyTemplate,
  beatOf,
  currentTemplate,
  isScreenplayTemplate,
  moveToSection,
  sectionLabel,
  sectionOf,
} from "../screenplay/template";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const source = [
  "Title: Kerlaouen",
  "",
  "Noir.",
  "",
  "INT. PHARE - NUIT [[cosmos:s1]]",
  "",
  "Inès monte.",
  "",
  "# Mes notes",
  "",
  "EXT. GRÈVE - JOUR",
  "",
  "La mer se retire.",
  "",
  "INT. CUISINE - SOIR",
  "",
  "YANN",
  "Tu restes ?",
  "",
].join("\n");

const label = (key: string) => fr.plan.beats[key as keyof typeof fr.plan.beats].label;
const outline = (elements: ReturnType<typeof parse>["elements"]) =>
  blocks(elements).map((b) => (b.kind === "section" ? `# ${beatOf(b.text) ?? sectionLabel(b.text)}` : b.text));

describe("gabarits de scénario", () => {
  it("gabarits du scénario, tous traduits (le voyage du héros et les structures d'octobre 2026 compris)", () => {
    expect(SCREENPLAY_TEMPLATES.slice(0, 4)).toEqual(["troisActes", "saveTheCat", "huitSequences", "episode"]);
    for (const template of SCREENPLAY_TEMPLATES) {
      expect(fr.plan.templates[template] && en.plan.templates[template]).toBeTruthy();
      for (const key of PLAN_TEMPLATES[template]) expect(fr.plan.beats[key].label && en.plan.beats[key].label).toBeTruthy();
    }
    expect(isScreenplayTemplate("voyageHeros")).toBe(true);
    expect(isScreenplayTemplate("libre")).toBe(false);
    expect(isScreenplayTemplate("")).toBe(false);
  });

  it("note de gabarit : lue dans la section, absente de ce qu'on affiche", () => {
    expect(beatOf("Catalyseur [[cosmos:beat:c_catalyst]]")).toBe("c_catalyst");
    expect(sectionLabel("Catalyseur [[cosmos:beat:c_catalyst]]")).toBe("Catalyseur");
    expect(beatOf("Mes notes")).toBeNull();
    expect(sectionLabel("Mes notes")).toBe("Mes notes");
  });
});

describe("poser un gabarit", () => {
  const screenplay = parse(source);

  it("première case avant la première scène, les autres à la fin ; rien d'autre ne bouge", () => {
    const next = applyTemplate(screenplay, "episode", label);
    expect(currentTemplate(next.elements)).toBe("episode");
    expect(outline(next.elements)).toEqual([
      "# e_teaser",
      "INT. PHARE - NUIT",
      "# Mes notes",
      "EXT. GRÈVE - JOUR",
      "INT. CUISINE - SOIR",
      "# e_act1",
      "# e_act2",
      "# e_act3",
      "# e_act4",
      "# e_tag",
    ]);
    // L'action d'ouverture reste avant tout, le lien de la carte et le texte sont intacts.
    expect(next.elements[0]).toMatchObject({ type: "action", text: "Noir." });
    expect(next.elements.filter((el) => el.type !== "section")).toEqual(screenplay.elements.filter((el) => el.type !== "section"));
  });

  it("le fichier se relit à l'identique, et reste du Fountain ordinaire", () => {
    const next = applyTemplate(screenplay, "troisActes", label);
    const text = serialize(next);
    expect(text).toContain("# Acte I · Exposition [[cosmos:beat:a_setup]]");
    expect(parse(text)).toEqual(next);
    expect(serialize(parse(text))).toBe(text);
  });

  it("changer de gabarit : les anciennes cases partent, la section de l'auteur reste", () => {
    const first = applyTemplate(screenplay, "episode", label);
    const second = applyTemplate(first, "huitSequences", label);
    expect(currentTemplate(second.elements)).toBe("huitSequences");
    expect(outline(second.elements).filter((l) => l.startsWith("# "))).toEqual(["# q_1", "# Mes notes", ...PLAN_TEMPLATES.huitSequences.slice(1).map((k) => `# ${k}`)]);
  });

  it("retirer le gabarit rend le scénario d'origine ; même gabarit : même objet", () => {
    const next = applyTemplate(screenplay, "saveTheCat", label);
    expect(applyTemplate(next, "saveTheCat", label)).toBe(next);
    expect(applyTemplate(next, null, label).elements).toEqual(screenplay.elements);
    expect(serialize(applyTemplate(next, null, label))).toBe(serialize(screenplay));
    expect(applyTemplate(screenplay, null, label)).toBe(screenplay);
  });

  it("scénario vide : les cases, dans l'ordre", () => {
    const empty = applyTemplate({ titlePage: {}, elements: [] }, "episode", label);
    expect(outline(empty.elements)).toEqual(PLAN_TEMPLATES.episode.map((k) => `# ${k}`));
  });
});

describe("ranger une scène dans une section", () => {
  const base = applyTemplate(parse(source), "episode", label);
  const find = (elements: typeof base.elements, text: string) => blocks(elements).findIndex((b) => (beatOf(b.text) ?? b.text) === text);

  it("vers une case plus loin : elle y arrive, avec tout son texte", () => {
    const elements = moveToSection(base.elements, find(base.elements, "INT. PHARE - NUIT"), find(base.elements, "e_act2"));
    expect(outline(elements).slice(-5)).toEqual(["# e_act2", "INT. PHARE - NUIT", "# e_act3", "# e_act4", "# e_tag"]);
    const at = elements.findIndex((el) => el.text === "INT. PHARE - NUIT");
    expect(elements[at]).toMatchObject({ cardId: "s1" });
    expect(elements[at + 1]).toMatchObject({ type: "action", text: "Inès monte." });
    expect(elements).toHaveLength(base.elements.length);
  });

  it("vers une case plus haut, à la fin de ses scènes", () => {
    const moved = moveToSection(base.elements, find(base.elements, "INT. CUISINE - SOIR"), find(base.elements, "e_teaser"));
    expect(outline(moved).slice(0, 4)).toEqual(["# e_teaser", "INT. PHARE - NUIT", "INT. CUISINE - SOIR", "# Mes notes"]);
  });

  it("déjà la dernière de sa section, ou blocs qui ne conviennent pas : même tableau", () => {
    expect(moveToSection(base.elements, find(base.elements, "INT. PHARE - NUIT"), find(base.elements, "e_teaser"))).toBe(base.elements);
    expect(moveToSection(base.elements, find(base.elements, "e_act1"), find(base.elements, "e_act2"))).toBe(base.elements);
    expect(moveToSection(base.elements, 1, 1)).toBe(base.elements);
    expect(moveToSection(base.elements, 99, 0)).toBe(base.elements);
  });

  it("section d'un bloc : la dernière placée avant lui", () => {
    expect(sectionOf(base.elements, find(base.elements, "INT. PHARE - NUIT"))).toBe(find(base.elements, "e_teaser"));
    expect(sectionOf(base.elements, find(base.elements, "INT. CUISINE - SOIR"))).toBe(find(base.elements, "Mes notes"));
    expect(sectionOf(parse(source).elements, 0)).toBe(-1);
  });
});

describe("clés de case avec majuscules", () => {
  // p_falseLead (Polar) n'était pas reconnu : la note restait visible et la case n'était plus une case.
  it("reconnaît toutes les clés des gabarits du séquencier", () => {
    for (const template of SCREENPLAY_TEMPLATES) {
      for (const key of PLAN_TEMPLATES[template]) {
        const text = `Case [[cosmos:beat:${key}]]`;
        expect(beatOf(text)).toBe(key);
        expect(sectionLabel(text)).toBe("Case");
      }
    }
  });
  it("retrouve le gabarit Polar posé dans un scénario", () => {
    const sp = parse("# Fausse piste [[cosmos:beat:p_falseLead]]\n\nINT. LANDE - NUIT\n\nAction.\n");
    expect(currentTemplate(sp.elements)).toBe("polar");
  });
});
