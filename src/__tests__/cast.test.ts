import { describe, expect, it } from "vitest";
import type { CardData } from "../types";
import { addNicknames, castPackets, castPrompt, matchCast, mergeCast, newNames, parseCast, type CastScene } from "../ai/cast";

const scenes: CastScene[] = [
  { id: "a", title: "Le départ", paragraphs: ["Inès Morvan pousse la porte du phare. Le vent lui gifle le visage.", "« Tu es en retard », dit Yann sans se retourner."] },
  { id: "b", title: "La lanterne", paragraphs: ["Inès monte l'escalier. La gardienne a trente-quatre ans et des mains d'ouvrière.", "Elle pense à sa mère, restée à Brest."] },
  { id: "c", title: "Ailleurs", paragraphs: ["La mer se calme enfin sur les rochers noirs."] },
];
const reply = (characters: unknown[]) => JSON.stringify({ characters });

describe("castPackets", () => {
  it("met les scènes en paquets, chacune avec sa référence", () => {
    const packs = castPackets(scenes, 200);
    expect(packs.length).toBeGreaterThan(1);
    expect(packs[0].scenes[0].ref).toBe("s1");
    expect(packs[0].text.startsWith("[s1] Le départ\n")).toBe(true);
    expect(packs.flatMap((p) => p.scenes.map((s) => s.ref))).toEqual(["s1", "s2", "s3"]);
  });
  it("saute une scène vide et abrège une scène trop longue", () => {
    const packs = castPackets([{ id: "x", title: "", paragraphs: [] }, { id: "y", title: "", paragraphs: ["a".repeat(500)] }], 100);
    expect(packs).toHaveLength(1);
    expect(packs[0].scenes[0].text).toHaveLength(100);
    expect(packs[0].scenes[0].ref).toBe("s2");
  });
  it("la consigne nomme les personnages connus et interdit le rôle", () => {
    const p = castPrompt(castPackets(scenes)[0], [{ name: "Yann Le Goff", others: [] }], [{ key: "age", label: "Âge" }], "fr", "roman");
    expect(p.system).toMatch(/Never say whether a character is main/);
    expect(JSON.parse(p.user).known[0].name).toBe("Yann Le Goff");
  });
});

describe("parseCast", () => {
  const packet = castPackets(scenes)[0];
  it("garde un nom cité, ses scènes et ses faits retrouvés", () => {
    const { items, rejected } = parseCast(
      reply([
        {
          name: "Inès Morvan",
          variants: ["Inès", "la gardienne", "Ninou"],
          scenes: [{ ref: "s1", speaks: false }],
          quote: "Inès Morvan pousse la porte du phare",
          facts: [
            { field: "age", value: "34 ans", quote: "La gardienne a trente-quatre ans" },
            { field: "role", value: "Héroïne", quote: "Inès Morvan pousse la porte du phare" },
            { field: "metier", value: "Gardienne", quote: "elle garde le phare depuis dix ans" },
          ],
        },
      ]),
      packet,
    );
    expect(items).toHaveLength(1);
    const ines = items[0];
    // « Ninou » n'est pas écrit dans le texte.
    expect(ines.variants).toEqual(["Inès", "la gardienne"]);
    // La scène b la nomme : ajoutée même si l'IA l'oublie ; c ne la nomme pas.
    expect(ines.scenes.map((s) => s.id)).toEqual(["a", "b"]);
    // Jamais le rôle ; un fait sans passage retrouvé est écarté et compté.
    expect(ines.facts).toEqual([{ field: "age", value: "34 ans", quote: "La gardienne a trente-quatre ans" }]);
    expect(rejected).toBe(1);
  });
  it("écarte un nom absent du texte ou une citation inventée", () => {
    const { items, rejected } = parseCast(
      reply([
        { name: "Paul", quote: "Paul arrive au phare en bateau" },
        { name: "Yann", quote: "Yann regarde la mer depuis la fenêtre" },
      ]),
      packet,
    );
    expect(items).toEqual([]);
    expect(rejected).toBe(2);
  });
  it("lit qui parle dans le texte d'un scénario", () => {
    const script = castPackets([{ id: "s", title: "INT. PHARE - NUIT", paragraphs: ["INÈS : Tu es en retard.", "Yann ferme la porte derrière elle."], speakers: ["INÈS"] }])[0];
    const { items } = parseCast(
      reply([
        { name: "Inès", scenes: [{ ref: "s1", speaks: false }], quote: "INÈS : Tu es en retard." },
        { name: "Yann", scenes: [{ ref: "s1", speaks: true }], quote: "Yann ferme la porte derrière elle." },
      ]),
      script,
    );
    expect(items.map((i) => [i.name, i.scenes[0].speaks])).toEqual([
      ["Inès", true],
      ["Yann", false],
    ]);
  });
  it("supporte une réponse qui n'est pas du JSON", () => {
    expect(parseCast("désolé", packet)).toEqual({ items: [], rejected: 0 });
  });
});

describe("mergeCast", () => {
  it("réunit un même personnage d'un paquet à l'autre, le nom le plus complet en tête", () => {
    const a = { name: "Inès", variants: [], quote: "q1", scenes: [{ id: "a", speaks: false }], facts: [] };
    const b = { name: "Inès Morvan", variants: ["Inès"], quote: "q2", scenes: [{ id: "a", speaks: true }, { id: "b", speaks: false }], facts: [{ field: "age" as const, value: "34", quote: "x" }] };
    const [m, ...rest] = mergeCast([a], [b]);
    expect(rest).toEqual([]);
    expect(m.name).toBe("Inès Morvan");
    expect(m.variants).toEqual(["Inès"]);
    expect(m.scenes).toEqual([
      { id: "a", speaks: true },
      { id: "b", speaks: false },
    ]);
    expect(m.facts).toHaveLength(1);
  });
});

describe("matchCast, newNames, addNicknames", () => {
  const card = (id: string, type: CardData["type"], title: string, surnoms?: string): CardData => ({ id, type, title, html: "", ...(surnoms ? { fiche: { surnoms } } : {}) });
  const cards = [card("y", "personnage", "Yann Le Goff", "le vieux"), card("p", "lieu", "Brest"), card("m", "personnage", "Marguerite")];
  it("reconnaît une fiche par son titre, son prénom ou un surnom", () => {
    expect(matchCast({ name: "Yann", variants: [] }, cards)).toEqual({ kind: "known", id: "y" });
    expect(matchCast({ name: "Le vieux", variants: [] }, cards)).toEqual({ kind: "known", id: "y" });
    expect(matchCast({ name: "Brest", variants: [] }, cards)).toEqual({ kind: "other" });
    expect(matchCast({ name: "Margueritte", variants: [] }, cards)).toEqual({ kind: "close", id: "m" });
    expect(matchCast({ name: "Inès", variants: [] }, cards)).toEqual({ kind: "new" });
  });
  it("donne les noms que la fiche ne connaît pas", () => {
    expect(newNames({ name: "Yann Le Goff", variants: ["Yann", "le gardien"] }, cards[0])).toEqual(["le gardien"]);
  });
  it("ajoute des surnoms sans doublon ni le titre", () => {
    expect(addNicknames("le vieux", ["Le Vieux", "le gardien", "Yann Le Goff"], "Yann Le Goff")).toBe("le vieux, le gardien");
    expect(addNicknames(undefined, ["Ninou"])).toBe("Ninou");
  });
});
