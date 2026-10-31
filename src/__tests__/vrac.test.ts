// @vitest-environment happy-dom
// « Du vrac aux cartes » (1.8.0) : relecture de la réponse de l'IA (types, identifiants, passages retrouvés tels
// quels, fils) et création des cartes en une seule étape d'annulation, posées sans chevauchement.

import { beforeEach, describe, expect, it } from "vitest";
import { fold, keptLinks, locate, parseVrac, vracGrid, vracMaxTokens, vracPrompt, vracTypes, VRAC_MAX } from "../ai/vrac";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EMPTY_PLAN } from "../plan";
import { boxes, frameBox } from "../projectState";
import type { CardData } from "../types";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const SOURCE = `Brainstorm du 12 mars.
Inès Morvan, gardienne remplaçante du phare, ne supporte pas le silence.
Le phare de Kerbrat : une tour blanche battue par le vent, isolée sur son rocher.
- Yann cache une lettre de son frère.
- Qui a éteint la lanterne la nuit du naufrage ?`;

const existing: CardData[] = [{ id: "k3x9a7bq2m", type: "personnage", title: "Yann Le Goff", html: "" }];
const types = vracTypes("roman");
const reply = (o: unknown) => `Voici :\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;

describe("types proposés", () => {
  it("ni Image, ni Lien, ni Document ; pas d'Épisode dans un roman ou un film", () => {
    expect(types).not.toContain("image");
    expect(types).not.toContain("lien");
    expect(types).not.toContain("document");
    expect(types).not.toContain("episode");
    expect(vracTypes("scenario")).toContain("episode");
    expect(vracTypes("scenario", true)).not.toContain("episode");
    expect(types).toContain("scene");
  });
  it("la consigne exige le texte mot pour mot et ne nomme que les types permis", () => {
    const p = vracPrompt("Un texte", existing, "fr", "roman", types);
    expect(p.system).toMatch(/word for word/);
    expect(p.system).not.toMatch(/\bimage \(/);
    expect(JSON.parse(p.user).existing).toEqual([{ id: "k3x9a7bq2m", type: "personnage", title: "Yann Le Goff" }]);
    expect(vracMaxTokens("x".repeat(VRAC_MAX))).toBeGreaterThan(VRAC_MAX / 2);
    expect(vracMaxTokens("x".repeat(100000))).toBeLessThanOrEqual(8000);
  });
});

describe("passages retrouvés dans le texte de l'auteur", () => {
  it("espaces, ponctuation, casse et accents repliés ; c'est le texte d'origine qui est gardé", () => {
    expect(fold("Élan, d’été !").text).toBe("elandete");
    const at = locate(SOURCE, "ines morvan gardienne remplacante du phare ne supporte pas le silence")!;
    expect(SOURCE.slice(at.start, at.end)).toBe("Inès Morvan, gardienne remplaçante du phare, ne supporte pas le silence.");
  });
  it("une marque de liste en tête de ligne vient avec le passage", () => {
    const at = locate(SOURCE, "Yann cache une lettre de son frère")!;
    expect(SOURCE.slice(at.start, at.end)).toBe("- Yann cache une lettre de son frère.");
  });
  it("l'espace avant « ? » et le guillemet fermant viennent avec le passage", () => {
    const at = locate(SOURCE, "Qui a éteint la lanterne la nuit du naufrage")!;
    expect(SOURCE.slice(at.start, at.end)).toBe("- Qui a éteint la lanterne la nuit du naufrage ?");
    const quoted = "Elle dit « je reste » ; puis part.";
    const q = locate(quoted, "Elle dit je reste")!;
    expect(quoted.slice(q.start, q.end)).toBe("Elle dit « je reste » ;");
  });
  it("un mot changé au milieu : aligné par le début et la fin, le passage d'origine remplace celui de l'IA", () => {
    const at = locate(SOURCE, "Le phare de Kerbrat : une tour BLANCHÂTRE battue par le vent, isolée sur son rocher.")!;
    expect(SOURCE.slice(at.start, at.end)).toBe("Le phare de Kerbrat : une tour blanche battue par le vent, isolée sur son rocher.");
  });
  it("un passage réécrit ou inventé n'est pas retrouvé", () => {
    expect(locate(SOURCE, "Inès déteste le calme")).toBeNull();
    expect(locate(SOURCE, "Une gardienne qui a peur du silence et un phare au bout du monde")).toBeNull();
  });
});

describe("parseVrac", () => {
  const parsed = parseVrac(
    reply({
      cards: [
        { key: "n1", type: "personnage", title: "Inès Morvan", text: "Inès Morvan, gardienne remplaçante du phare, ne supporte pas le silence." },
        { key: "n2", type: "lieu", title: "Le phare de Kerbrat", text: "Le phare de Kerbrat : une tour blanche battue par le vent, isolée sur son rocher." },
        { key: "n3", type: "image", title: "Photo du phare", text: "une tour blanche battue par le vent" },
        { key: "n4", type: "secret", title: "La lettre", text: "Yann cache une lettre de son frère." },
        { key: "n5", type: "question", title: "La lanterne", text: "Qui a éteint la lanterne pendant la tempête ?" },
        { key: "n6", type: "inconnu", title: "", text: "Brainstorm du 12 mars." },
      ],
      links: [
        { from: "n1", to: "n2", label: "garde" },
        { from: "n4", to: "k3x9a7bq2m", label: "gardé par" },
        { from: "n1", to: "zzzzzzzzzz", label: "inventée" },
        { from: "n5", to: "n1", label: "carte écartée" },
        { from: "n2", to: "n1", label: "doublon" },
        { from: "k3x9a7bq2m", to: "k3x9a7bq2m" },
      ],
    }),
    SOURCE,
    existing,
    types,
  );

  it("types permis seulement : un type refusé ou inconnu fait une Idée, le texte reste", () => {
    expect(parsed.cards.map((c) => c.type)).toEqual(["personnage", "lieu", "secret", "idee"]);
    // « image » : passage contenu dans celui du lieu, déjà pris.
    expect(parsed.cards.some((c) => c.title === "Photo du phare")).toBe(false);
    expect(parsed.cards[3].title).toBe("Brainstorm du 12 mars.");
  });
  it("chaque texte est un passage exact du texte collé ; un passage introuvable est écarté", () => {
    for (const c of parsed.cards) expect(SOURCE).toContain(c.text);
    expect(parsed.rejected).toBe(1);
    expect(parsed.cards.some((c) => c.title === "La lanterne")).toBe(false);
  });
  it("fils : identifiants inventés, carte écartée, doublons et boucles retirés", () => {
    expect(parsed.links).toEqual([
      { from: "new:0", to: "new:1", label: "garde" },
      { from: "new:2", to: "k3x9a7bq2m", label: "gardé par" },
    ]);
  });
  it("un fil vers une carte décochée part avec elle", () => {
    expect(keptLinks(parsed.links, new Set(["new:1"]))).toEqual([{ from: "new:2", to: "k3x9a7bq2m", label: "gardé par" }]);
  });
  it("réponse illisible : rien", () => {
    expect(parseVrac("Désolé, je ne peux pas.", SOURCE, existing, types)).toEqual({ cards: [], links: [], rejected: 0 });
  });
});

describe("grille", () => {
  it("colonnes à peu près carrées, rangées à la hauteur de leur plus haute carte", () => {
    const g = vracGrid([100, 200, 150, 120, 90], 240);
    expect(g.cells).toHaveLength(5);
    expect(g.cells[2]).toEqual({ x: 528, y: 0 });
    expect(g.cells[3]).toEqual({ x: 0, y: 224 });
    expect(g.height).toBe(224 + 120);
  });
});

describe("textes", () => {
  it("chaque chaîne existe en français et en anglais", () => {
    expect(Object.keys(en.vrac).sort()).toEqual(Object.keys(fr.vrac).sort());
  });
});

describe("createVracCards", () => {
  const state = () => useCosmos.getState();
  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, plan: EMPTY_PLAN, manuscript: {}, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Phare", kind: "roman" });
  });

  it("une seule étape d'annulation, cartes et fils créés, texte en paragraphes et listes gardées", () => {
    state().addCard({ x: 0, y: 0 }, "personnage");
    const yann = state().nodes[0].id;
    const before = state().past.length;
    const ids = state().createVracCards(
      [
        { key: "new:0", type: "personnage", title: "Inès", text: "Inès Morvan.\nNe supporte pas le silence." },
        { key: "new:1", type: "lieu", title: "Kerbrat", text: "- Une tour blanche\n- Battue par le vent" },
        { key: "new:2", type: "image", title: "Refusée", text: "x" },
      ],
      [
        { from: "new:0", to: "new:1", label: "garde" },
        { from: "new:1", to: yann, label: "" },
        { from: "new:0", to: "inventee00", label: "" },
      ],
      { at: { x: 0, y: 0 } },
    );
    expect(ids).toHaveLength(2);
    expect(state().past.length).toBe(before + 1);
    const ines = state().nodes.find((n) => n.id === ids[0])!.data;
    expect(ines).toMatchObject({ type: "personnage", title: "Inès", html: "<p>Inès Morvan.</p><p>Ne supporte pas le silence.</p>" });
    expect(state().nodes.find((n) => n.id === ids[1])!.data.html).toContain("<li>");
    expect(state().edges.map((e) => [e.source, e.target, e.label])).toEqual([
      [ids[0], ids[1], "garde"],
      [ids[1], yann, ""],
    ]);
    state().undo();
    expect(state().nodes.map((n) => n.id)).toEqual([yann]);
    expect(state().edges).toEqual([]);
  });

  it("posées ensemble dans un espace libre : ni sur une carte ni sur un cadre", () => {
    state().addCard({ x: 0, y: 0 });
    state().addFrame({ x: 600, y: 100 });
    const cards = Array.from({ length: 6 }, (_, i) => ({ key: `new:${i}`, type: "idee" as const, title: `Idée ${i}`, text: `Texte ${i}` }));
    const ids = state().createVracCards(cards, [], { at: { x: 300, y: 100 } });
    const made = new Set(ids);
    const mine = boxes(state().nodes.filter((n) => made.has(n.id)));
    const others = [...boxes(state().nodes.filter((n) => !made.has(n.id))), ...state().frames.map(frameBox)];
    const hit = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const m of mine) for (const o of others) expect(hit(m, o)).toBe(false);
    for (const a of mine) for (const b of mine) if (a !== b) expect(hit(a, b)).toBe(false);
  });

  it("téléphone : les cartes vont dans « À ranger »", () => {
    const ids = state().createVracCards([{ key: "new:0", type: "question", title: "Qui ?", text: "Qui a éteint la lanterne ?" }], [], { inbox: true });
    expect(state().nodes.find((n) => n.id === ids[0])!.data.inbox).toBe(true);
  });

  it("une Scène range son texte comme toute Scène (manuscrit d'un roman)", () => {
    const long = "Inès monte l'escalier du phare.\nLa lanterne est éteinte. Elle comprend que quelqu'un est venu.";
    const [id] = state().createVracCards([{ key: "new:0", type: "scene", title: "La lanterne", text: long }], []);
    expect(state().nodes.find((n) => n.id === id)!.data).toMatchObject({ type: "scene", title: "La lanterne", html: "" });
    expect(state().manuscript[id]).toContain("Inès monte");
  });
});
