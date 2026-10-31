// @vitest-environment happy-dom
// Lot IA 2 (1.9.0), « Structure et Bible » : consignes et lecteurs stricts (ai/structure.ts), sources lues dans le
// projet (structureSources.ts), format des champs de dépouillement, actions du store en une étape.

import { beforeEach, describe, expect, it } from "vitest";
import {
  addEntries,
  beatCharacters,
  beatContext,
  beatQuestionPrompt,
  breakdownBatches,
  breakdownByCategory,
  breakdownEntries,
  breakdownPrompt,
  htmlParagraphs,
  mergeRetro,
  packets,
  parseBeatQuestion,
  parseBreakdown,
  parseRetro,
  parseWires,
  quoteIn,
  retroEmptyFields,
  retroPassages,
  retroPrompt,
  screenplayParagraphs,
  wireCandidates,
  wireCardOf,
  wiresPrompt,
  type BeatRow,
  type WireCard,
} from "../ai/structure";
import { beatRows, breakdownScenes, storyParagraphs, wireCards } from "../structureSources";
import { BREAKDOWN_FIELDS, readFiche, sheetFields, bandFields } from "../character";
import { cardToFile, fileToCard } from "../storage/markdown";
import { parse } from "../screenplay/parse";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import type { CardData } from "../types";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const card = (id: string, type: CardData["type"], title: string, html = "", fiche?: Record<string, string>): CardData => ({ id, type, title, html, ...(fiche ? { fiche } : {}) });
const reply = (o: unknown) => `Voici :\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;
const names = { type: (t: string) => t, untitled: "Sans titre" };

describe("citation retrouvée dans le texte de l'auteur", () => {
  const source = "Inès Morvan travaille au phare de Kerbrat depuis l’hiver.";
  it("rend le passage d'origine, même cité avec d'autres espaces, casse ou apostrophe", () => {
    expect(quoteIn(source, "travaille au PHARE de Kerbrat")).toBe("travaille au phare de Kerbrat");
    expect(quoteIn(source, "depuis l'hiver")).toBe("depuis l’hiver.");
  });
  it("écarte un passage inventé ou trop court", () => {
    expect(quoteIn(source, "Inès déteste la mer")).toBeNull();
    expect(quoteIn(source, "phare")).toBeNull();
  });
});

describe("Ranger les fils", () => {
  const cards: WireCard[] = [
    wireCardOf(card("ines", "personnage", "Inès Morvan", "<p>Inès travaille au phare de Kerbrat. Sœur de Yann.</p>")),
    wireCardOf(card("phare", "lieu", "Le phare de Kerbrat", "<p>Une tour blanche.</p>")),
    wireCardOf(card("yann", "personnage", "Yann", "")),
    wireCardOf(card("img", "image", "Photo", "")),
  ];
  const links = [{ source: "yann", target: "phare", label: "garde" }];

  it("la consigne envoie les cartes nommées et les fils existants, et exige la citation mot pour mot", () => {
    const p = wiresPrompt(cards, links, "fr", "roman");
    const user = JSON.parse(p.user);
    expect(user.cards.map((c: WireCard) => c.id)).toEqual(["ines", "phare", "yann"]);
    expect(user.links).toEqual(links);
    expect(p.system).toMatch(/word for word/);
    expect(p.system).toMatch(/travaille à/);
    expect(wireCandidates(cards)).toHaveLength(3);
  });

  it("garde un fil justifié ; écarte inventé, déjà relié (dans l'autre sens), inconnu, doublon et boucle", () => {
    const { items, rejected } = parseWires(
      reply({
        items: [
          { from: "ines", to: "phare", label: "« travaille à »", quote: "Inès travaille au phare de Kerbrat" },
          { from: "phare", to: "ines", label: "lieu de travail", quote: "Inès travaille au phare de Kerbrat" },
          { from: "phare", to: "yann", label: "gardé par", quote: "Une tour blanche battue par les flots" },
          { from: "ines", to: "inconnue00", label: "x", quote: "Inès travaille au phare de Kerbrat" },
          { from: "ines", to: "ines", label: "x", quote: "Inès travaille au phare de Kerbrat" },
          { from: "Yann (personnage)", to: "ines", label: "frère de", quote: "Sœur de Yann et amie" },
          { from: "Yann", to: "ines", label: "frère de", quote: "travaille au phare de Kerbrat. Sœur de Yann" },
        ],
      }),
      cards,
      links,
      names,
    );
    expect(items).toEqual([
      { from: "ines", to: "phare", label: "travaille à", quote: "Inès travaille au phare de Kerbrat." },
      { from: "yann", to: "ines", label: "frère de", quote: "travaille au phare de Kerbrat. Sœur de Yann." },
    ]);
    // Le phare et Yann, déjà reliés, ne comptent pas comme écartés ; la citation inventée (« Sœur de Yann et amie »), si.
    expect(rejected).toBe(1);
  });

  it("une réponse illisible ne donne rien", () => {
    expect(parseWires("Je ne sais pas.", cards, links).items).toEqual([]);
  });
});

describe("une question pour une case vide", () => {
  const rows: BeatRow[] = [
    { key: "a_setup", label: "Exposition", hint: "", scenes: [{ id: "s1", title: "Arrivée au phare", synopsis: "Inès arrive." }] },
    { key: "a_incident", label: "Déclencheur", hint: "Ce qui lance l’histoire", scenes: [] },
    { key: "a_confrontation", label: "Confrontation", hint: "", scenes: [{ id: "s2", title: "La tempête", synopsis: "" }] },
    { key: "a_midpoint", label: "Milieu", hint: "", scenes: [] },
  ];
  const people = [card("ines", "personnage", "Inès Morvan", "", { principal: "oui", accroche: "Gardienne qui fuit le silence" }), card("yann", "personnage", "Yann", "")];

  it("les voisines, la structure et les personnages principaux d'abord", () => {
    const ctx = beatContext(rows, "a_incident", { kind: "roman", template: "Trois actes", characters: beatCharacters(people), logline: "" })!;
    expect(ctx.beat).toEqual({ label: "Déclencheur", hint: "Ce qui lance l’histoire" });
    expect(ctx.before.map((r) => r.key)).toEqual(["a_setup"]);
    expect(ctx.after.map((r) => r.key)).toEqual(["a_confrontation", "a_midpoint"]);
    expect(ctx.outline).toEqual([
      { label: "Exposition", scenes: 1 },
      { label: "Déclencheur", scenes: 0 },
      { label: "Confrontation", scenes: 1 },
      { label: "Milieu", scenes: 0 },
    ]);
    expect(ctx.characters.map((c) => c.id)).toEqual(["ines"]);
    expect(beatContext(rows, "inconnue", { kind: "roman", template: "", characters: [], logline: "" })).toBeNull();
    const p = beatQuestionPrompt(ctx, "fr");
    expect(p.system).toMatch(/Do not answer it, do not suggest a scene/);
    expect(JSON.parse(p.user).emptyBeat.label).toBe("Déclencheur");
  });

  it("lecture : une question, des cartes connues ou nommées ; rien sans point d'interrogation", () => {
    expect(parseBeatQuestion(reply({ question: "Qu’est-ce qui oblige Inès Morvan à rester ?", cards: ["ines", "inventee"] }), people, names)).toEqual({
      question: "Qu’est-ce qui oblige Inès Morvan à rester ?",
      cards: ["ines"],
    });
    expect(parseBeatQuestion("Question : « Que perd Yann cette nuit-là ? »", people)).toEqual({ question: "Que perd Yann cette nuit-là ?", cards: ["yann"] });
    expect(parseBeatQuestion(reply({ question: "Une scène de tempête." }), people)).toBeNull();
  });
});

describe("rétro-bible", () => {
  const ines = card("ines", "personnage", "Inès Morvan", "", { age: "34 ans", surnoms: "la Veilleuse", principal: "oui" });
  const scenes = [
    { id: "s1", paragraphs: ["Inès monte l’escalier du phare.", "La mer gronde.", "La Veilleuse, disait-on au port, avait été infirmière à Brest."] },
    { id: "s2", paragraphs: ["Yann attend.", "Inès a peur du silence depuis la mort de son père."] },
  ];

  it("seulement les champs vides qu'une lecture peut remplir (jamais un champ à choix ni réservé)", () => {
    const fields = retroEmptyFields(ines);
    expect(fields).toContain("metier");
    expect(fields).not.toContain("age");
    expect(fields).not.toContain("principal");
    expect(fields).not.toContain("arcType");
    expect(fields).not.toContain("blessure");
    expect(retroEmptyFields(card("t", "theme", "Le silence"))).toEqual([]);
    expect(retroEmptyFields(card("l", "lieu", "Phare"))).toEqual(["epoque", "ambiance", "evenements"]);
  });

  it("les passages qui nomment la carte (prénom, surnoms) ; un décor par son en-tête", () => {
    expect(retroPassages(ines, scenes)).toEqual(["Inès monte l’escalier du phare.", "La Veilleuse, disait-on au port, avait été infirmière à Brest.", "Inès a peur du silence depuis la mort de son père."]);
    const phare = card("phare", "lieu", "Le phare de Kerbrat");
    const script = [{ id: "s3", heading: "INT. PHARE DE KERBRAT - NUIT", paragraphs: ["INT. PHARE DE KERBRAT - NUIT", "Le vent siffle sous la porte.", "INÈS : Qui est là ?"] }];
    expect(retroPassages(phare, script)).toEqual(["Le vent siffle sous la porte.", "INÈS : Qui est là ?"]);
  });

  it("des paquets bornés, sans couper un passage", () => {
    const list = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];
    expect(packets(list, 90)).toEqual([`${"a".repeat(40)}\n\n${"b".repeat(40)}`, "c".repeat(40)]);
    expect(packets([])).toEqual([]);
  });

  it("lecture stricte : champ demandé, citation retrouvée dans le paquet ; trois valeurs au plus par champ", () => {
    const packet = scenes.flatMap((s) => s.paragraphs).join("\n\n");
    const p = retroPrompt(ines, [{ key: "metier", label: "Métier" }], packet, "fr", "roman");
    expect(p.system).toMatch(/ONLY if the excerpts state it clearly/);
    expect(JSON.parse(p.user).fields).toEqual([{ key: "metier", meaning: "Métier" }]);
    const { items, rejected } = parseRetro(
      reply({
        items: [
          { field: "metier", value: "Ancienne infirmière", quote: "avait été infirmière à Brest" },
          { field: "peur", value: "Le silence", quote: "Inès a peur du silence depuis toujours, et du noir" },
          { field: "age", value: "40 ans", quote: "Inès monte l’escalier du phare" },
          { field: "metier", value: "", quote: "avait été infirmière à Brest" },
        ],
      }),
      ["metier", "peur"],
      packet,
    );
    expect(items).toEqual([{ field: "metier", value: "Ancienne infirmière", quote: "avait été infirmière à Brest." }]);
    expect(rejected).toBe(1);
    const merged = mergeRetro(items, [
      { field: "metier", value: "ancienne infirmiere", quote: "x" },
      { field: "metier", value: "Gardienne", quote: "x" },
      { field: "metier", value: "Marin", quote: "x" },
      { field: "metier", value: "Médecin", quote: "x" },
    ]);
    expect(merged.map((m) => m.value)).toEqual(["Ancienne infirmière", "Gardienne", "Marin"]);
  });
});

describe("dépouillement", () => {
  const source = `INT. PHARE - NUIT [[cosmos:sc1]]

Inès allume une lanterne à pétrole. Elle porte un ciré jaune.

INÈS
(bas)
Qui est là ?

EXT. PORT - JOUR [[cosmos:sc2]]

Une foule de pêcheurs regarde une vedette de la gendarmerie accoster.

EXT. FALAISE - JOUR

Le vent.
`;
  const screenplay = parse(source);

  it("cinq champs dans la fiche d'une scène, libellés fr et en, hors de la liste de CardSheet", () => {
    expect(sheetFields("scene")).toEqual(expect.arrayContaining([...BREAKDOWN_FIELDS]));
    for (const key of BREAKDOWN_FIELDS) {
      expect((fr.fiche.fields as Record<string, string>)[key]).toBeTruthy();
      expect((en.fiche.fields as Record<string, string>)[key]).toBeTruthy();
      expect(fr.structure.categories[key]).toBeTruthy();
      expect(en.structure.categories[key]).toBeTruthy();
      expect(bandFields(card("s", "scene", "")).has(key)).toBe(true);
    }
  });

  it("gardés sur disque ; une version d'avant les garde aussi (champs inconnus dans keep)", () => {
    const c = card("sc1", "scene", "INT. PHARE - NUIT", "", { accessoires: "Lanterne\nCiré jaune", effets: "Pluie" });
    expect(fileToCard(cardToFile(c))).toEqual(c);
    expect(readFiche({ accessoires: "Lanterne", inconnu: "x" }, "scene")).toEqual({ accessoires: "Lanterne" });
    // Ce que fait une version qui ne connaît pas le champ : il passe dans keep.fiche et se réécrit tel quel.
    const later = fileToCard(cardToFile(card("sc1", "scene", "X", "", { synopsis: "Nuit." })).replace('"synopsis":"Nuit."', '"synopsis":"Nuit.","accessoiresV3":"Lanterne"'))!;
    expect(later.keep?.fiche).toEqual({ accessoiresV3: "Lanterne" });
    expect(cardToFile(later)).toContain('"accessoiresV3":"Lanterne"');
  });

  it("entrées : une par ligne, sans doublon (casse et accents ignorés)", () => {
    expect(breakdownEntries(" Lanterne \n\nCiré ")).toEqual(["Lanterne", "Ciré"]);
    expect(addEntries("Lanterne", ["lanterne", "Ciré jaune", "CIRE JAUNE"])).toBe("Lanterne\nCiré jaune");
    expect(addEntries("Lanterne", ["LANTERNE"])).toBe("Lanterne");
    expect(addEntries(undefined, ["Corde"])).toBe("Corde");
  });

  it("lignes d'action des scènes reliées à une carte, en lots", () => {
    const scenes = breakdownScenes(screenplay, "fr");
    expect(scenes.map((s) => s.id)).toEqual(["sc1", "sc2"]);
    expect(scenes[0].text).toBe("INT. PHARE - NUIT\nInès allume une lanterne à pétrole. Elle porte un ciré jaune.");
    expect(breakdownScenes(screenplay, "fr", "sc2").map((s) => s.id)).toEqual(["sc2"]);
    expect(breakdownBatches(scenes, 70).map((b) => b.map((s) => s.id))).toEqual([["sc1"], ["sc2"]]);
    expect(breakdownBatches(scenes).map((b) => b.length)).toEqual([2]);
    const p = breakdownPrompt(scenes, "fr");
    expect(p.system).toMatch(/only what the action lines actually mention/);
    expect(JSON.parse(p.user).scenes[1]).toEqual({ id: "sc2", heading: "EXT. PORT - JOUR", action: scenes[1].text });
  });

  it("lecture stricte : scène du lot, catégorie connue, citation de cette scène, rien de déjà noté", () => {
    const scenes = breakdownScenes(screenplay, "fr");
    const { items, rejected } = parseBreakdown(
      reply({
        items: [
          { scene: "sc1", category: "accessoires", entry: "Lanterne à pétrole", quote: "allume une lanterne à pétrole" },
          { scene: "sc1", category: "costumes", entry: "Ciré jaune", quote: "Elle porte un ciré jaune" },
          { scene: "sc1", category: "accessoires", entry: "lanterne à pétrole", quote: "allume une lanterne à pétrole" },
          { scene: "sc2", category: "figurants", entry: "Pêcheurs", quote: "Une foule de pêcheurs" },
          { scene: "sc2", category: "vehicules", entry: "Vedette de la gendarmerie", quote: "une vedette de la gendarmerie accoster" },
          { scene: "sc2", category: "accessoires", entry: "Lanterne", quote: "allume une lanterne à pétrole" },
          { scene: "sc2", category: "effets", entry: "Explosion", quote: "une explosion illumine le port" },
          { scene: "sc9", category: "effets", entry: "Pluie", quote: "Le vent" },
          { scene: "sc1", category: "decors", entry: "Phare", quote: "INT. PHARE - NUIT" },
        ],
      }),
      scenes,
      { sc1: { costumes: "ciré jaune" } },
    );
    expect(items.map((i) => [i.scene, i.field, i.entry])).toEqual([
      ["sc1", "accessoires", "Lanterne à pétrole"],
      ["sc2", "figurants", "Pêcheurs"],
      ["sc2", "vehicules", "Vedette de la gendarmerie"],
    ]);
    // La lanterne citée dans la mauvaise scène et l'explosion inventée.
    expect(rejected).toBe(2);
  });

  it("par catégorie, avec les scènes, dans l'ordre", () => {
    const by = breakdownByCategory([card("a", "scene", "", "", { accessoires: "Lanterne\nCorde" }), card("b", "scene", "", "", { accessoires: "lanterne", effets: "Pluie" })]);
    expect(by.accessoires).toEqual([
      { entry: "Corde", scenes: ["a"] },
      { entry: "Lanterne", scenes: ["a", "b"] },
    ]);
    expect(by.effets).toEqual([{ entry: "Pluie", scenes: ["b"] }]);
    expect(by.costumes).toEqual([]);
  });

  it("paragraphes d'une scène : réplique précédée du nom, didascalie comprise", () => {
    expect(screenplayParagraphs(screenplay.elements.slice(0, 5), "fr")).toEqual(["INT. PHARE - NUIT", "Inès allume une lanterne à pétrole. Elle porte un ciré jaune.", "INÈS : (bas) Qui est là ?"]);
    expect(htmlParagraphs("<p>Un.</p><p></p><p>Deux <em>mots</em>.</p>")).toEqual(["Un.", "Deux mots."]);
  });
});

describe("sources lues dans le projet", () => {
  it("cases du gabarit d'un roman avec leurs scènes ; texte des scènes ; récit dans l'ordre du livre", () => {
    const nodes = [
      { id: "s1", data: card("s1", "scene", "Arrivée", "", { synopsis: "Inès arrive." }), position: { x: 0, y: 0 } },
      { id: "s2", data: card("s2", "scene", "Tempête"), position: { x: 0, y: 100 } },
      { id: "p", data: card("p", "personnage", "Inès"), position: { x: 300, y: 0 } },
    ];
    const s = { kind: "roman" as const, nodes, plan: { template: "troisActes" as const, beats: { a_setup: ["s1"], a_climax: ["s2"] } }, manuscript: { s2: "<p>La mer monte.</p>" }, screenplay: null };
    const { template, rows } = beatRows(s, (key) => ({ label: key.toUpperCase(), hint: "" }));
    expect(template).toBe("troisActes");
    expect(rows[0]).toEqual({ key: "a_setup", label: "A_SETUP", hint: "", scenes: [{ id: "s1", title: "Arrivée", synopsis: "Inès arrive." }] });
    expect(rows.find((r) => r.key === "a_incident")?.scenes).toEqual([]);
    expect(beatRows({ ...s, plan: EMPTY_PLAN }, () => ({ label: "", hint: "" })).rows).toEqual([]);
    expect(storyParagraphs(s, "fr")).toEqual([{ id: "s2", paragraphs: ["La mer monte."] }]);
    expect(wireCards(s, "fr").find((c) => c.id === "s1")?.text).toContain("Inès arrive.");
  });
});

describe("store : une acceptation, une étape", () => {
  const state = () => useCosmos.getState();
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Phare", kind: "scenario" });
  });

  it("addWires : fils tirés en une étape, jamais en double ni vers une carte inconnue", () => {
    state().addCard({ x: 0, y: 0 }, "personnage");
    state().addCard({ x: 400, y: 0 }, "lieu");
    state().addCard({ x: 800, y: 0 }, "personnage");
    const [a, b, c] = state().nodes.map((n) => n.id);
    state().linkCards(b, c, "");
    const before = state().past.length;
    expect(state().addWires([{ from: a, to: b, label: "travaille à" }, { from: c, to: b, label: "x" }, { from: a, to: "inconnue00", label: "" }, { from: b, to: a, label: "doublon" }, { from: a, to: c, label: "frère de" }])).toBe(2);
    expect(state().past.length).toBe(before + 1);
    expect(state().edges.map((e) => [e.source, e.target, e.label])).toEqual([[b, c, ""], [a, b, "travaille à"], [a, c, "frère de"]]);
    expect(state().addWires([{ from: a, to: b, label: "encore" }])).toBe(0);
    expect(state().past.length).toBe(before + 1);
    state().undo();
    expect(state().edges).toHaveLength(1);
  });

  it("addBreakdown : entrées ajoutées aux fiches des scènes, sans doublon, en une étape", () => {
    state().addCard({ x: 0, y: 0 }, "scene");
    state().addCard({ x: 400, y: 0 }, "scene");
    const [s1, s2] = state().nodes.map((n) => n.id);
    state().setFiche(s1, "accessoires", "Lanterne");
    const before = state().past.length;
    const n = state().addBreakdown([
      { scene: s1, field: "accessoires", entry: "lanterne" },
      { scene: s1, field: "accessoires", entry: "Corde" },
      { scene: s1, field: "costumes", entry: "Ciré jaune" },
      { scene: s2, field: "effets", entry: "Pluie" },
    ]);
    expect(n).toBe(3);
    expect(state().past.length).toBe(before + 1);
    expect(state().nodes[0].data.fiche).toMatchObject({ accessoires: "Lanterne\nCorde", costumes: "Ciré jaune" });
    expect(state().nodes[1].data.fiche).toEqual({ effets: "Pluie" });
    state().undo();
    expect(state().nodes[0].data.fiche).toEqual({ accessoires: "Lanterne" });
    expect(state().nodes[1].data.fiche).toBeUndefined();
  });
});
