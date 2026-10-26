// @vitest-environment happy-dom
// Lot 6 de la Bible v2 : couverture d'une série (saison, fin de saison, ce qu'elle n'est pas, pourquoi moi),
// destinataire et page « L'auteur » d'un dossier envoyé.
import { describe, expect, it } from "vitest";
import { askableFields, pitchFields, readPitch } from "../pitch";
import { cleanOptions, defaultsFor } from "../bibleExport";
import { buildBiblePack, EXTRACT_PAGES, type PackSource } from "../export/biblePack";
import { cleanProfile } from "../profile";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { RULE_ORDER, STORY_RULES, checkStory } from "../review/checks";
import type { CardData } from "../types";

const source = (kind: "roman" | "scenario" = "scenario"): PackSource => ({
  title: "Veilleurs",
  kind,
  nodes: [],
  edges: [],
  plan: { template: "libre", beats: {} },
  manuscript: {},
  pitch: readPitch({ intention: "Je veux filmer la mer.", saison: "D’où vient le signal ?", finSaison: "Inès part en mer.", nestPas: "Pas un film d’horreur.", pourquoiMoi: "Mon grand-père était gardien." }),
  screenplay: null,
  goals: {},
} as never);
const profile = { bio: "Scénariste depuis 2015.\nAtelier du CEEA.", works: "Courant d’air, court métrage, 2019\nLa Digue, France 3, 2023" };
const ctx = { t: fr, lang: "fr", author: "Camille Durand", date: new Date(2026, 9, 26), profile };
const texts = (pack: ReturnType<typeof buildBiblePack>) => JSON.stringify(pack.sections);

describe("couverture d'une série, lot 6", () => {
  it("quatre champs de plus, seulement dans un scénario, avec leur question", () => {
    for (const k of ["saison", "finSaison", "nestPas", "pourquoiMoi"] as const) {
      expect(pitchFields("scenario")).toContain(k);
      expect(pitchFields("roman")).not.toContain(k);
      expect(askableFields("scenario")).toContain(k);
      expect(fr.pitch.questions[k]).toBeTruthy();
      expect(en.pitch.questions[k]).toBeTruthy();
    }
  });

  it("la saison dans la Structure, « ce qu'elle n'est pas » dans la Présentation", () => {
    const pack = buildBiblePack(source(), defaultsFor("tiers", "scenario"), ctx);
    const structure = JSON.stringify(pack.sections.filter((s) => s.part === "structure" && s.title !== fr.bibleExport.pilotTitle));
    expect(structure).toContain("D’où vient le signal ?");
    expect(structure).toContain("Inès part en mer.");
    expect(JSON.stringify(pack.sections.find((s) => s.part === "presentation"))).toContain("Pas un film d’horreur.");
  });
});

describe("destinataire et page « L'auteur »", () => {
  it("le destinataire termine la note d'intention, pour un tiers seulement", () => {
    const tiers = buildBiblePack(source(), { ...defaultsFor("tiers", "scenario"), recipient: "  Arte, pour sa case fiction du jeudi. " }, ctx);
    const blocks = tiers.sections[0].blocks;
    const i = blocks.findIndex((b) => b.kind === "label" && b.text === fr.pitch.fields.intention);
    expect(blocks.slice(i + 1, i + 3).map((b) => (b.kind === "para" ? b.runs[0].text : ""))).toEqual(["Je veux filmer la mer.", "Arte, pour sa case fiction du jeudi."]);
    const moi = buildBiblePack(source(), { ...defaultsFor("moi", "scenario"), recipient: "Arte" }, ctx);
    expect(texts(moi)).not.toContain("Arte");
  });

  it("la page « L'auteur » reprend le profil de l'appareil, pour un tiers", () => {
    const pack = buildBiblePack(source(), defaultsFor("tiers", "scenario"), ctx);
    const page = pack.sections.find((s) => s.kicker === fr.bibleExport.authorKicker)!;
    expect(page.title).toBe("Camille Durand");
    expect(JSON.stringify(page.blocks)).toContain("Mon grand-père était gardien.");
    expect(JSON.stringify(page.blocks)).toContain("Atelier du CEEA.");
    expect(page.blocks.find((b) => b.kind === "list")).toMatchObject({ items: [{ text: "Courant d’air, court métrage, 2019" }, { text: "La Digue, France 3, 2023" }] });
    // Avant l'annexe du pilote, s'il y en a une ; jamais dans la bible de travail.
    expect(pack.sections.at(-1)).toBe(page);
    expect(buildBiblePack(source(), defaultsFor("moi", "scenario"), ctx).sections.some((s) => s.kicker === fr.bibleExport.authorKicker)).toBe(false);
    // Sans profil ni « pourquoi moi » : pas de page.
    const bare = buildBiblePack({ ...source("roman"), pitch: {} }, defaultsFor("tiers"), { ...ctx, profile: undefined });
    expect(bare.sections.some((s) => s.kicker === fr.bibleExport.authorKicker)).toBe(false);
  });

  it("le destinataire et le profil sont relus proprement", () => {
    expect(cleanOptions({ recipient: "  a\n b " }).recipient).toBe("a b");
    expect(cleanOptions({ recipient: 3 }).recipient).toBe("");
    expect(cleanOptions({ recipient: "x".repeat(500) }).recipient).toHaveLength(300);
    expect(cleanProfile({ bio: " Une\n\n deux ", works: 4 })).toMatchObject({ bio: "Une\ndeux", works: "" });
  });
});

describe("Vérifier : trois questions sur l'histoire", () => {
  const row = (id: string, name: string, scenes: number) => ({ id, name, gender: "", scenes, lines: 0, words: 0, share: 0, first: null, last: null });
  const people: CardData[] = [
    { id: "a", type: "personnage", title: "Inès", html: "", fiche: { principal: "oui" } },
    { id: "b", type: "personnage", title: "Yann", html: "", fiche: { objectif: "Partir" } },
  ];

  it("le principal n'est pas le plus présent, et ne dit pas ce qu'il veut", () => {
    const found = checkStory(people, [row("a", "Inès", 2), row("b", "Yann", 5)], "roman", {});
    expect(found.map((f) => f.rule)).toEqual(["principalNotMost", "noGoal"]);
    expect(found[0]).toMatchObject({ sceneId: "a", names: ["Inès", "Yann"], counts: [2, 5] });
    // Le plus présent, avec un « Veut » : rien à dire.
    const fine = checkStory([{ ...people[0], fiche: { principal: "oui", objectif: "Comprendre" } }, people[1]], [row("a", "Inès", 5), row("b", "Yann", 2)], "roman", {});
    expect(fine).toEqual([]);
    // Personne de marqué principal : aucune de ces questions.
    expect(checkStory([people[1]], [row("b", "Yann", 5)], "roman", {})).toEqual([]);
  });

  it("une série sans épisode, seulement pour une série", () => {
    expect(checkStory([], [], "scenario", { format: "Série, épisodes de 52 min" }).map((f) => f.rule)).toEqual(["noEpisodes"]);
    expect(checkStory([], [], "scenario", { arene: "Un phare" }).map((f) => f.rule)).toEqual(["noEpisodes"]);
    expect(checkStory([], [], "scenario", { format: "Long métrage" })).toEqual([]);
    expect(checkStory([], [], "roman", { format: "Série" })).toEqual([]);
    expect(checkStory([{ id: "e", type: "episode", title: "Un", html: "" }], [], "scenario", { format: "Série" })).toEqual([]);
  });

  it("chaque question a ses textes, dans les deux langues", () => {
    for (const r of STORY_RULES) {
      expect(RULE_ORDER).toContain(r);
      for (const t of [fr, en]) {
        expect(t.review.rules[r as keyof typeof t.review.rules]).toBeTruthy();
        expect(t.review.hints[r as keyof typeof t.review.hints]).toBeTruthy();
      }
    }
  });
});

describe("roman : extrait en annexe", () => {
  const novel = (): PackSource => ({ ...source("roman"), manuscript: { s1: "<p>Il était une fois une petite fille de village.</p>" } } as never);

  it("un éditeur reçoit les premières pages du manuscrit, annoncées par une page", () => {
    expect(defaultsFor("tiers", "roman").extract).toBe(true);
    expect(defaultsFor("tiers", "scenario").extract).toBe(false);
    expect(defaultsFor("moi", "roman").extract).toBe(false);
    const pack = buildBiblePack(novel(), defaultsFor("tiers", "roman"), ctx);
    expect(pack.annexPages).toBe(EXTRACT_PAGES);
    expect(pack.sections.at(-1)?.title).toBe(fr.bibleExport.extractTitle);
    // Sans texte, ou option décochée : rien.
    expect(buildBiblePack(source("roman"), defaultsFor("tiers", "roman"), ctx).annexPages).toBe(0);
    expect(buildBiblePack(novel(), { ...defaultsFor("tiers", "roman"), extract: false }, ctx).annexPages).toBe(0);
    // Un scénario ne joint jamais d'extrait du manuscrit.
    expect(buildBiblePack({ ...novel(), kind: "scenario" } as never, { ...defaultsFor("tiers", "scenario"), extract: true }, ctx).annexPages).toBe(0);
  });

  it("un réglage enregistré avant le lot 6 n'a pas d'extrait", () => {
    expect(cleanOptions({ audience: "tiers" }).extract).toBe(false);
    expect(cleanOptions({ audience: "tiers", extract: true }).extract).toBe(true);
  });
});
