// @vitest-environment happy-dom
// Lot 1.7.3 : collage de dialogues, en-têtes reliés, page de titre, demi-cadratin, réponses envoyées à l'IA,
// nom d'auteur vidé.

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { dialogueLines, looksLikeMarkdown, markdownSource } from "../markdownText";
import { markdownToHtml } from "../storage/markdown";
import { parse } from "../screenplay/parse";
import { serialize } from "../screenplay/serialize";
import { headingParts } from "../screenplay/scenes";
import { settingOf } from "../review/places";
import { isNaturalHeading } from "../screenplay/rules";
import { fromDoc, screenplayExtensions, toDoc } from "../screenplay/editor";
import { interviewPrompt, coherencePrompt } from "../ai/tasks";
import { withAuthorName } from "../profile";
import type { CardData } from "../types";

describe("M10 : un dialogue à tirets collé n'est pas une liste", () => {
  it("répliques suivies de narration : pas de Markdown", () => {
    expect(looksLikeMarkdown("- Tu viens ?\n- Oui.\nIl sortit.")).toBe(false);
    expect(looksLikeMarkdown("- Tu viens ?")).toBe(false);
  });
  it("une vraie liste reste une liste", () => {
    expect(looksLikeMarkdown("- un\n- deux")).toBe(true);
    expect(dialogueLines("Courses :\n- pain\n- lait\n\nFin.").size).toBe(0);
  });
  it("avec d'autre Markdown, les répliques restent du texte et la narration n'est pas avalée", () => {
    const html = markdownToHtml(markdownSource("- Tu viens ?\n- Oui.\nIl sortit sous la **pluie**."));
    expect(html).not.toContain("<li>");
    expect(html).toContain("<p>- Tu viens ?</p>");
    expect(html).toContain("<p>Il sortit sous la <strong>pluie</strong>.</p>");
  });
});

describe("M11 : Tab puis Maj+Tab garde le lien de l'en-tête", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());
  it("la carte et le numéro reviennent avec le type", () => {
    editor = new Editor({
      element: document.createElement("div"),
      extensions: screenplayExtensions({ locale: () => "fr", placeholder: (type) => type, onEscape: () => {} }),
      content: toDoc(parse(".PHARE [[cosmos:abc123defg]] #4#\n\nLa mer.\n")),
    });
    editor.commands.setTextSelection(2);
    const press = (shiftKey: boolean) =>
      editor.view.someProp("handleKeyDown", (f) => f(editor.view, new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true })));
    press(false);
    expect(editor.state.doc.child(0).type.name).toBe("action");
    press(true);
    const heading = fromDoc(editor.getJSON(), {}).elements[0];
    expect(heading).toMatchObject({ type: "sceneHeading", cardId: "abc123defg", sceneNumber: "4" });
    expect(editor.state.doc.child(0).attrs.known).toBe(true);
  });
});

describe("M12 : une première action « Lieu, date : … » n'est pas une page de titre", () => {
  it("relue comme action", () => {
    const sp = parse("Paris, 1942 : la ville est occupée.\n\nINT. CAFÉ - JOUR\n");
    expect(sp.titlePage).toEqual({});
    expect(sp.elements[0]).toMatchObject({ type: "action", text: "Paris, 1942 : la ville est occupée." });
  });
  it("une vraie page de titre, avec ses clés inconnues, reste lue", () => {
    const sp = parse("Title: Le Phare\nRevue: version 3\n\nINT. PHARE - NUIT\n");
    expect(sp.titlePage).toEqual({ Title: "Le Phare", Revue: "version 3" });
  });
  it("une action « Title: … » sans page de titre est forcée à l'écriture", () => {
    const text = serialize({ titlePage: {}, elements: [{ type: "action", text: "Title: rien" }] });
    expect(text).toBe("!Title: rien\n");
    expect(parse(text).elements[0]).toMatchObject({ type: "action", text: "Title: rien" });
  });
});

describe("M13 : demi-cadratin et EXT./INT.", () => {
  it("le moment se lit après -, – ou —", () => {
    for (const dash of ["-", "–", "—"]) expect(headingParts(`INT. PHARE ${dash} NUIT`)).toEqual({ prefix: "INT.", location: "PHARE", time: "NUIT" });
  });
  it("EXT./INT. est reconnu des deux côtés", () => {
    expect(isNaturalHeading("EXT./INT. VOITURE - JOUR")).toBe(true);
    const parts = headingParts("EXT./INT. VOITURE – JOUR");
    expect(parts).toEqual({ prefix: "EXT./INT.", location: "VOITURE", time: "JOUR" });
    expect(settingOf(parts.prefix)).toBe("both");
  });
  it("un tiret dans le nom du décor ne coupe pas", () => {
    expect(headingParts("INT. SAINT-MALO - JOUR").location).toBe("SAINT-MALO");
  });
});

describe("M16 : les réponses de l'auteur vont à l'IA", () => {
  const ines: CardData = {
    id: "p1",
    type: "personnage",
    title: "Inès",
    html: "<p>Gardienne.</p>",
    reponses: { "passe.0": "Elle a grandi à Brest.", "q:Que cache-t-elle ?": "Une lettre." },
  };
  const texts = { "passe.0": "Où a-t-elle grandi ?" };
  it("interview : réponses jointes, questions déjà répondues évitées", () => {
    const user = JSON.parse(interviewPrompt(ines, [ines], [], "fr", ["Que veut-elle ?"], texts).user);
    expect(user.character.answers).toEqual([
      { question: "Où a-t-elle grandi ?", answer: "Elle a grandi à Brest." },
      { question: "Que cache-t-elle ?", answer: "Une lettre." },
    ]);
    expect(user.alreadyAsked).toEqual(["Où a-t-elle grandi ?", "Que cache-t-elle ?", "Que veut-elle ?"]);
  });
  it("cohérence : réponses jointes", () => {
    const user = JSON.parse(coherencePrompt([ines], [], "fr", {}, texts).user);
    expect(user.cards[0].answers).toHaveLength(2);
  });
});

describe("M17 : vider l'auteur d'une page de titre ne vide pas le profil", () => {
  it("nom de plume gardé", () => {
    const p = { firstName: "", lastName: "", penName: "Jean Lune", address: "", phone: "", email: "", bio: "", works: "" };
    expect(withAuthorName(p as never, "")).toBe(p);
    expect(withAuthorName(p as never, "Jean Soleil")).toMatchObject({ penName: "Jean Soleil" });
  });
});
