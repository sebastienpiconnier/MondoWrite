// @vitest-environment happy-dom
// Mentions « @ » : citer une carte dans une autre, format Markdown, suivi des renommages et des suppressions.

import { beforeEach, describe, expect, it } from "vitest";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { cardToFile, fileToCard, htmlToMarkdown, markdownToHtml } from "../storage/markdown";
import {
  canCreateMention,
  mentionCandidates,
  mentionedIds,
  mentionHtml,
  mentionQuery,
  mentionTarget,
  removeMentions,
  renameMentions,
} from "../mentions";
import type { CardData } from "../types";

const card = (id: string, title: string, type: CardData["type"] = "personnage"): CardData => ({ id, type, title, html: "" });
const cards = [card("a1", "Inès Morvan"), card("b2", "Yann Le Goff"), card("c3", "Phare de Kerlaouen", "lieu"), card("d4", "Morgane"), card("e5", "")];

describe("ce qu'on tape après @", () => {
  it("le @ ouvre un mot : début de ligne, après une espace ou une parenthèse", () => {
    expect(mentionQuery("@")).toEqual({ query: "", length: 1 });
    expect(mentionQuery("Elle parle à @In")).toEqual({ query: "In", length: 3 });
    expect(mentionQuery("(@Yann Le")).toEqual({ query: "Yann Le", length: 8 });
  });

  it("pas une mention : adresse de courriel, espace juste après le @, texte trop long", () => {
    expect(mentionQuery("ines@exemple.fr")).toBeNull();
    expect(mentionQuery("Rendez-vous @ midi")).toBeNull();
    expect(mentionQuery("@" + "x".repeat(41))).toBeNull();
    expect(mentionQuery("Rien ici")).toBeNull();
  });

  it("une mention déjà posée avant le curseur ne compte pas", () => {
    expect(mentionQuery("@￼ et puis")).toBeNull();
  });
});

describe("ce qu'on tape après [[ (comme dans Obsidian)", () => {
  it("[[ ouvre le même menu, partout dans la ligne ; la mention remplace aussi les crochets", () => {
    expect(mentionQuery("[[")).toEqual({ query: "", length: 2 });
    expect(mentionQuery("Elle parle à [[Inè")).toEqual({ query: "Inè", length: 5 });
    expect(mentionQuery("voir[[Yann Le")).toEqual({ query: "Yann Le", length: 9 });
  });

  it("le déclencheur le plus récent l'emporte", () => {
    expect(mentionQuery("@Inès puis [[Ya")).toEqual({ query: "Ya", length: 4 });
    expect(mentionQuery("[[Inès puis @Ya")).toEqual({ query: "Ya", length: 3 });
  });

  it("pas une mention : crochets refermés, espace juste après, texte trop long", () => {
    expect(mentionQuery("[[Inès]]")).toBeNull();
    expect(mentionQuery("[[ Inès")).toBeNull();
    expect(mentionQuery("[[" + "x".repeat(41))).toBeNull();
    expect(mentionQuery("[un seul crochet")).toBeNull();
  });
});

describe("cartes proposées", () => {
  it("sans la carte elle-même ni les cartes sans titre", () => {
    expect(mentionCandidates(cards, "", "a1", "fr").map((c) => c.id)).toEqual(["d4", "c3", "b2"]);
  });

  it("sans casse ni accents ; début du titre, puis début d'un mot, puis ailleurs", () => {
    expect(mentionCandidates(cards, "INES", "zz", "fr").map((c) => c.title)).toEqual(["Inès Morvan"]);
    expect(mentionCandidates(cards, "mor", "zz", "fr").map((c) => c.title)).toEqual(["Morgane", "Inès Morvan"]);
    expect(mentionCandidates(cards, "erl", "zz", "fr").map((c) => c.title)).toEqual(["Phare de Kerlaouen"]);
  });

  it("six au plus", () => {
    const many = Array.from({ length: 10 }, (_, i) => card(`m${i}`, `Marin ${i}`));
    expect(mentionCandidates(many, "marin", "zz", "fr")).toHaveLength(6);
  });

  it("créer une carte : seulement pour un nom court que personne ne porte", () => {
    expect(canCreateMention(cards, "Soizic")).toBe(true);
    expect(canCreateMention(cards, "inès morvan")).toBe(false);
    expect(canCreateMention(cards, "")).toBe(false);
    expect(canCreateMention(cards, "Soizic ")).toBe(false);
    expect(canCreateMention(cards, "une phrase qui continue après")).toBe(false);
  });
});

describe("mentions dans le texte d'une carte", () => {
  const html = `<p>Elle remplace ${mentionHtml("b2", "Yann Le Goff")} au ${mentionHtml("c3", "Phare")}.</p>`;

  it("cartes citées", () => {
    expect(mentionedIds(html + html)).toEqual(["b2", "c3"]);
    expect(mentionedIds("<p>Rien</p>")).toEqual([]);
  });

  it("renommer la carte citée : la mention suit, les autres non", () => {
    expect(renameMentions(html, "b2", "Yann & fils")).toBe(
      '<p>Elle remplace <span data-mention="b2">@Yann &amp; fils</span> au <span data-mention="c3">@Phare</span>.</p>',
    );
    // Rien à changer, ou titre vidé : même chaîne.
    expect(renameMentions(html, "zz", "Autre")).toBe(html);
    expect(renameMentions(html, "b2", "  ")).toBe(html);
  });

  it("supprimer la carte citée : le nom reste écrit, sans lien", () => {
    expect(removeMentions(html, "b2")).toBe('<p>Elle remplace @Yann Le Goff au <span data-mention="c3">@Phare</span>.</p>');
    expect(removeMentions(html, "zz")).toBe(html);
  });
});

describe("format Markdown", () => {
  const html = `<p>Elle remplace ${mentionHtml("p4t8w2zq1c", "Yann Le Goff")} au phare.</p>`;

  it("une mention s'écrit comme un lien vers la carte", () => {
    expect(htmlToMarkdown(html)).toBe("Elle remplace [@Yann Le Goff](cosmos:p4t8w2zq1c) au phare.");
  });

  it("le fichier se relit à l'identique", () => {
    const file = cardToFile({ id: "k3x9a7bq2m", type: "personnage", title: "Inès Morvan", html });
    expect(fileToCard(file)!.html.trim()).toBe(html);
    expect(cardToFile(fileToCard(file)!)).toBe(file);
  });

  it("un lien web reste un lien, un lien piégé perd son adresse", () => {
    expect(markdownToHtml("[site](https://exemple.fr)").trim()).toBe('<p><a href="https://exemple.fr">site</a></p>');
    expect(markdownToHtml("[x](javascript:alert(1))")).not.toContain("javascript");
    expect(markdownToHtml('[x](cosmos:a"onmouseover="b)')).not.toContain("data-mention");
    expect(markdownToHtml("[x](cosmos:../../secret)")).not.toContain("data-mention");
  });

  it("le texte d'une mention lue sur disque n'est jamais interprété", () => {
    const out = markdownToHtml("[@<img src=x onerror=alert(1)>](cosmos:abc)");
    expect(out).not.toContain("<img");
    expect(mentionTarget("cosmos:abc")).toBe("abc");
    expect(mentionTarget("cosmos:")).toBeNull();
    expect(mentionTarget("https://exemple.fr")).toBeNull();
  });
});

describe("mentions dans le projet", () => {
  const state = () => useCosmos.getState();
  let ines = "";
  let yann = "";

  beforeEach(async () => {
    localStorage.clear();
    useSettings.setState({ lang: "fr" });
    useCosmos.setState({ loaded: false, screen: "home", projects: [], nodes: [], frames: [], edges: [], screenplay: null, savedScreenplay: null, lastFiles: {}, past: [], future: [] });
    await state().start();
    await state().createProject({ title: "Kerlaouen", kind: "roman" });
    ines = state().addTitledCard("personnage", "Inès Morvan");
    yann = state().addTitledCard("personnage", "Yann Le Goff");
    state().updateCard(ines, { html: `<p>Remplace ${mentionHtml(yann, "Yann Le Goff")}.</p>` });
    state().linkCards(ines, yann, "");
  });

  const htmlOf = (id: string) => state().nodes.find((n) => n.id === id)!.data.html;

  it("citer une carte tire un fil, une seule fois", () => {
    state().linkCards(ines, yann, "");
    expect(state().edges).toHaveLength(1);
    expect(state().edges[0]).toMatchObject({ source: ines, target: yann, label: "" });
  });

  it("renommer la carte citée met la mention à jour, et annuler la remet", () => {
    state().updateCard(yann, { title: "Yann Le Goff, père" });
    expect(htmlOf(ines)).toBe(`<p>Remplace ${mentionHtml(yann, "Yann Le Goff, père")}.</p>`);
    state().undo();
    expect(htmlOf(ines)).toBe(`<p>Remplace ${mentionHtml(yann, "Yann Le Goff")}.</p>`);
  });

  it("une carte sans mention n'est pas recréée par un renommage", () => {
    const before = state().nodes.find((n) => n.id === yann);
    state().updateCard(ines, { title: "Inès M." });
    expect(state().nodes.find((n) => n.id === yann)).toBe(before);
  });

  it("supprimer la carte citée : le nom reste en texte, annuler rend la mention et le fil", () => {
    state().deleteCard(yann);
    expect(htmlOf(ines)).toBe("<p>Remplace @Yann Le Goff.</p>");
    expect(state().edges).toHaveLength(0);
    state().undo();
    expect(htmlOf(ines)).toBe(`<p>Remplace ${mentionHtml(yann, "Yann Le Goff")}.</p>`);
    expect(state().edges).toHaveLength(1);
  });

  it("enregistré puis rouvert : la mention et le fil sont toujours là", async () => {
    await state().save();
    await state().closeProject();
    await state().openProject(state().projects[0].id);
    expect(htmlOf(ines).trim()).toBe(`<p>Remplace ${mentionHtml(yann, "Yann Le Goff")}.</p>`);
    expect(state().edges).toHaveLength(1);
  });
});
