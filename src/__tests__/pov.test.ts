// @vitest-environment happy-dom
// Point de vue d'une scène (1.13.0) : clé `fiche.pov`, champs-références (pivot, pov), scènes racontées,
// choix proposés, écriture sur disque, exports et action du store.

import { describe, expect, it } from "vitest";
import { CARD_REF_FIELDS, cardRef, ficheValue, isCardRefField, povOf, readFiche } from "../character";
import { pivotOf } from "../episodes";
import { matchChoices, narratedScenes, narratorCounts, povChoices } from "../pov";
import { cardToFile, fileToCard } from "../storage/markdown";
import type { CardData } from "../types";
import { useCosmos } from "../store";
import { useSettings } from "../settings";

const ethan: CardData = { id: "p1", type: "personnage", title: "Ethan", html: "" };
const violette: CardData = { id: "p2", type: "personnage", title: "Violette", html: "" };
const ambre: CardData = { id: "p3", type: "personnage", title: "Ambre", html: "" };
const parc: CardData = { id: "l1", type: "lieu", title: "Le parc", html: "" };
const scene = (id: string, pov?: string, extra: Partial<CardData> = {}): CardData => ({ id, type: "scene", title: id, html: "", ...(pov ? { fiche: { pov } } : {}), ...extra });

describe("Champs-références", () => {
  it("pivot et pov désignent une carte Personnage", () => {
    expect(CARD_REF_FIELDS).toEqual({ pivot: "personnage", pov: "personnage" });
    expect(isCardRefField("pov")).toBe(true);
    expect(isCardRefField("synopsis")).toBe(false);
    expect(isCardRefField("toString")).toBe(false);
  });

  it("cardRef : la carte si elle existe et a le bon type, sinon null", () => {
    const cards = [ethan, parc];
    expect(cardRef(scene("s", "p1"), "pov", cards)).toBe(ethan);
    expect(cardRef(scene("s", "l1"), "pov", cards)).toBeNull();
    expect(cardRef(scene("s", "absent"), "pov", cards)).toBeNull();
    expect(cardRef(scene("s"), "pov", cards)).toBeNull();
  });

  it("povOf ne vaut que pour une scène ; pivotOf passe par la même règle", () => {
    expect(povOf(scene("s", "p1"), [ethan])).toBe(ethan);
    expect(povOf({ type: "idee", fiche: { pov: "p1" } }, [ethan])).toBeNull();
    const episode: CardData = { id: "e", type: "episode", title: "Pilote", html: "", fiche: { pivot: "p2" } };
    expect(pivotOf(episode, [ethan, violette])).toBe(violette);
    expect(pivotOf({ ...episode, fiche: { pivot: "l1" } }, [parc])).toBeNull();
  });

  it("ficheValue écrit le titre de la carte désignée, jamais son identifiant", () => {
    const s = scene("s", "p1", { fiche: { pov: "p1", synopsis: " Ethan croise Ambre. " } });
    expect(ficheValue(s, "pov", [ethan])).toBe("Ethan");
    expect(ficheValue(s, "pov", [])).toBe("");
    expect(ficheValue(s, "synopsis", [])).toBe("Ethan croise Ambre.");
  });

  it("readFiche garde pov pour une scène, pas pour un autre type", () => {
    expect(readFiche({ pov: "p1", statut: "fini" }, "scene")).toEqual({ pov: "p1", statut: "fini" });
    expect(readFiche({ pov: "p1" }, "personnage")).toBeUndefined();
  });
});

describe("Sur disque", () => {
  it("la clé pov s'écrit dans la fiche et se relit", () => {
    const card = scene("s8k2m4q9xa", "p4t8w2zq1c", { title: "La rencontre", fiche: { synopsis: "Au parc.", statut: "fini", pov: "p4t8w2zq1c" } });
    const text = cardToFile(card);
    expect(text).toContain('"pov":"p4t8w2zq1c"');
    expect(fileToCard(text)?.fiche).toEqual({ synopsis: "Au parc.", statut: "fini", pov: "p4t8w2zq1c" });
  });

  it("un narrateur disparu ne s'affiche plus, mais la clé reste (personnage remis de la corbeille)", () => {
    const s = scene("s", "p9");
    const read = fileToCard(cardToFile(s))!;
    expect(read.fiche?.pov).toBe("p9");
    expect(povOf(read, [ethan])).toBeNull();
    expect(povOf(read, [{ ...ethan, id: "p9" }])?.title).toBe("Ethan");
  });
});

describe("Scènes racontées", () => {
  const cards = [ethan, violette, ambre, scene("a", "p1"), scene("b", "p2"), scene("c", "p1"), scene("d"), scene("titre", "p1", { page: "titre" }), scene("e", "l1"), parc];

  it("dans l'ordre du livre, sans les pages hors récit ni les narrateurs qui ne sont pas des personnages", () => {
    expect(narratedScenes("p1", cards, ["c", "b", "a"]).map((c) => c.id)).toEqual(["c", "a"]);
    expect(narratedScenes("l1", cards, []).map((c) => c.id)).toEqual([]);
  });

  it("une scène hors de l'ordre passe à la fin", () => {
    expect(narratedScenes("p1", cards, ["c"]).map((c) => c.id)).toEqual(["c", "a"]);
  });

  it("compte les scènes de chaque narrateur", () => {
    expect([...narratorCounts(cards)]).toEqual([
      ["p1", 2],
      ["p2", 1],
    ]);
  });
});

describe("Choix proposés", () => {
  const cards = [violette, ambre, ethan, { ...ethan, id: "vide", title: " " }, scene("a", "p1"), scene("b", "p1"), scene("c", "p2")];

  it("les narrateurs d'abord (les plus présents en tête), puis par nom ; pas de personnage sans nom", () => {
    expect(povChoices(cards, "fr").map((c) => c.title)).toEqual(["Ethan", "Violette", "Ambre"]);
  });

  it("une saisie filtre sans casse ni accents", () => {
    const people = [ethan, { ...violette, title: "Élodie" }];
    expect(matchChoices(people, "elo").map((c) => c.title)).toEqual(["Élodie"]);
    expect(matchChoices(people, "  ").length).toBe(2);
  });
});

describe("Action du store", () => {
  it("createPov crée le personnage et le choisit ; un Annuler défait les deux", async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    const st = () => useCosmos.getState();
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], edges: [], screenplay: null, savedScreenplay: null, paperChosen: false, lastFiles: {} });
    await st().start();
    await st().createProject({ title: "Sacré Bonhomme", kind: "roman" });
    const s1 = st().addCard({ x: 0, y: 0 }, "scene");
    const before = st().past.length;
    const id = st().createPov(s1, "  Ethan   Durand ");
    expect(id).toBeTruthy();
    expect(st().nodes.find((n) => n.id === id)?.data).toMatchObject({ type: "personnage", title: "Ethan Durand" });
    expect(st().nodes.find((n) => n.id === s1)?.data.fiche?.pov).toBe(id);
    expect(st().past.length).toBe(before + 1);
    st().undo();
    expect(st().nodes.some((n) => n.id === id)).toBe(false);
    expect(st().nodes.find((n) => n.id === s1)?.data.fiche?.pov).toBeUndefined();
    expect(st().createPov(s1, "   ")).toBeNull();
    expect(st().createPov("absent", "Ambre")).toBeNull();
  });
});

describe("Exports", () => {
  it("la bible écrit le nom du narrateur, jamais son identifiant", async () => {
    const { bibleDoc } = await import("../export/doc");
    const { fr } = await import("../i18n/fr");
    const doc = bibleDoc({ title: "Bible", author: "", lang: "fr" }, [ethan, scene("s1", "p1", { title: "Le réveil", fiche: { pov: "p1", statut: "fini" } })], [], {
      sections: Object.fromEntries(Object.entries(fr.types).map(([k, v]) => [k, v.section])) as never,
      untitled: "Sans titre",
      linkedTo: "Relié à",
      fields: { ...fr.character.fields, ...fr.fiche.fields },
      arcTypes: fr.character.arcTypes,
      cover: { title: fr.pitch.toc, fields: fr.pitch.fields },
    });
    const blocks = doc.chapters.flatMap((c) => c.blocks);
    const line = blocks.find((b) => b.kind === "paragraph" && b.runs[0]?.text === "Point de vue : ");
    expect(line && line.kind === "paragraph" ? line.runs[1].text : null).toBe("Ethan");
  });
});

describe("Lot 2 : couleurs des narrateurs", () => {
  it("une couleur par narrateur, de 1 à 8, stable quel que soit l'ordre des scènes", async () => {
    const { narratorColors, POV_COLORS } = await import("../pov");
    const a = narratorColors(["p1", "p2", "p3"]);
    const b = narratorColors(["p3", "p1", "p2", "p1"]);
    expect([...a].sort()).toEqual([...b].sort());
    expect(new Set(a.values()).size).toBe(3);
    for (const c of a.values()) expect(c).toBeGreaterThanOrEqual(1), expect(c).toBeLessThanOrEqual(POV_COLORS);
    // Au-delà de huit narrateurs, les couleurs reviennent sans erreur.
    const many = narratorColors(Array.from({ length: 11 }, (_, i) => `n${i}`));
    expect(many.size).toBe(11);
    expect(new Set(many.values()).size).toBe(POV_COLORS);
  });
});

describe("Lot 2 : chronologie, chiffres et filtre du canevas", () => {
  const cards = [ethan, violette, scene("a", "p1"), scene("b", "p2"), scene("c")];

  it("la chronologie marque le narrateur d'une scène, plus fort qu'un fil", async () => {
    const { timeline } = await import("../timeline");
    const people = timeline(cards, [{ source: "a", target: "p1" }, { source: "c", target: "p1" }], {}, ["a", "b", "c"], "fr").find((g) => g.type === "personnage")!;
    expect(people.rows.find((r) => r.card.id === "p1")!.cells).toEqual(["pov", "none", "linked"]);
    expect(people.rows.find((r) => r.card.id === "p2")!.cells).toEqual(["none", "pov", "none"]);
  });

  it("les chiffres ajoutent les scènes racontées, leurs mots et leur part du livre ; rien sans point de vue", async () => {
    const { novelReport, withPov, reportCsv } = await import("../review/report");
    const manuscript = { a: "<p>Un deux trois quatre</p>", b: "<p>Cinq six</p>", c: "<p>Sept huit</p>" };
    const words = (id: string) => (manuscript as Record<string, string>)[id].replace(/<[^>]+>/g, "").split(/\s+/).length;
    const rows = withPov(novelReport(manuscript, ["a", "b", "c"], cards), cards, ["a", "b", "c"], words);
    expect(rows.find((r) => r.id === "p1")!.pov).toEqual({ scenes: 1, words: 4, share: 0.5 });
    expect(rows.find((r) => r.id === "p2")!.pov).toEqual({ scenes: 1, words: 2, share: 0.25 });
    const none = [ethan, scene("x")];
    const plain = novelReport({}, ["x"], none);
    expect(withPov(plain, none, ["x"])).toBe(plain);
    const csv = reportCsv(rows, ["Personnage", "Genre", "Scènes", "Répliques", "Mots", "Part (%)", "Première", "Dernière"], "fr", ["Scènes PDV", "Mots PDV", "Part PDV (%)"]);
    const [head, ...lines] = csv.trim().split("\r\n");
    expect(head.endsWith("Scènes PDV;Mots PDV;Part PDV (%)")).toBe(true);
    expect(lines.find((l) => l.startsWith("Ethan"))!.endsWith(";1;4;50")).toBe(true);
    // Scénario : deux colonnes (scènes, part).
    expect(reportCsv(rows, ["P"], "en", ["POV scenes", "Share"]).split("\r\n")[0]).toBe("P,POV scenes,Share");
  });

  it("le filtre du canevas sur un narrateur ne masque que les autres scènes, et garde le narrateur", async () => {
    const { hiddenCards, filterActive, NO_FILTER } = await import("../canvasFilter");
    const f = { ...NO_FILTER, pov: "p1", base: null };
    expect(filterActive(f)).toBe(true);
    expect([...hiddenCards(cards, [], f)].sort()).toEqual(["b", "c"]);
    expect(hiddenCards(cards, [], { ...f, types: ["personnage"] }).has("p1")).toBe(false);
  });
});
