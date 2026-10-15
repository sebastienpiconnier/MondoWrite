// @vitest-environment happy-dom
// Éditeur de scénario : conversion, clavier et détection à la frappe, joués sur un vrai éditeur TipTap.

import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/react";
import type { Screenplay, ScreenplayElement } from "../model";
import { parse } from "../parse";
import { serialize } from "../serialize";
import { fromDoc, screenplayExtensions, setElementType, toDoc } from "../editor";
import { adoptNew } from "../editor/adopt";
import courtFr from "./fixtures/court-fr.fountain?raw";
import shortEn from "./fixtures/short-en.fountain?raw";
import torture from "./fixtures/torture.fountain?raw";

const onEscape = vi.fn();
let editor: Editor;

/** Par défaut : une action vide, pour jouer la frappe. `open([])` ouvre un scénario vraiment vide. */
function open(source: string | ScreenplayElement[] = [{ type: "action", text: "" }]): Editor {
  const screenplay: Screenplay = typeof source === "string" ? parse(source) : { titlePage: {}, elements: source };
  editor = new Editor({
    element: document.createElement("div"),
    extensions: screenplayExtensions({ locale: () => "fr", placeholder: (type) => type, onEscape }),
    content: toDoc(screenplay),
  });
  return editor;
}

afterEach(() => editor?.destroy());

/** Frappe caractère par caractère, comme le navigateur : les règles de saisie voient chaque touche. */
function type(text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (f) =>
      f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}

function press(key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  return editor.view.someProp("handleKeyDown", (f) => f(editor.view, event)) === true;
}

const model = () => fromDoc(editor.getJSON(), {});
const shape = () => model().elements.map((el) => `${el.type}: ${el.text}`);
const currentType = () => editor.state.selection.$from.parent.type.name;
/** Place le curseur à la fin de l'élément d'index donné. */
function cursorAtEnd(index: number) {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
  editor.commands.setTextSelection(pos + editor.state.doc.child(index).nodeSize - 1);
}

describe("conversion", () => {
  for (const [name, source] of Object.entries({ "court-fr": courtFr, "short-en": shortEn, torture })) {
    it(`${name} : le modèle traverse l'éditeur sans changer`, () => {
      const screenplay = parse(source);
      open(source);
      expect(fromDoc(editor.getJSON(), screenplay.titlePage)).toEqual(screenplay);
    });
  }

  it("scénario vide : un en-tête de scène à remplir, rien à écrire sur disque", () => {
    open([]);
    expect(shape()).toEqual(["sceneHeading: "]);
    expect(serialize(model())).toBe("");
    type("ext. port - jour");
    expect(shape()).toEqual(["sceneHeading: EXT. PORT - JOUR"]);
  });

  it("ouvrir un fichier ne met rien en majuscules", () => {
    open(".Inès trouve le journal de bord [[cosmos:a]]\n\n@McAvoy\nOui.\n");
    expect(shape()).toEqual(["sceneHeading: Inès trouve le journal de bord", "character: McAvoy", "dialogue: Oui."]);
  });
});

describe("écrire une scène au clavier seul", () => {
  it("en-tête, action, personnage, didascalie, dialogue, transition, puis la scène suivante", () => {
    open([]);
    type("int. phare, lanterne - nuit");
    press("Enter");
    type("La lampe est froide.");
    press("Enter");
    press("Tab");
    type("inès");
    press("Enter");
    type("(à voix basse)");
    press("Enter");
    type("Le 13 octobre.");
    press("Enter");
    type("COUPE À :");
    press("Enter");
    type("ext. îlot - aube");

    const fountain = [
      "INT. PHARE, LANTERNE - NUIT",
      "",
      "La lampe est froide.",
      "",
      "INÈS",
      "(à voix basse)",
      "Le 13 octobre.",
      "",
      "> COUPE À :",
      "",
      "EXT. ÎLOT - AUBE",
      "",
    ].join("\n");
    expect(serialize(model())).toBe(fountain);

    // Recharger redonne exactement le même texte.
    editor.destroy();
    open(fountain);
    expect(serialize(model())).toBe(fountain);
  });
});

describe("Tab, Maj+Tab", () => {
  const cases: [ScreenplayElement["type"], string, string][] = [
    ["sceneHeading", "action", "transition"],
    ["action", "character", "sceneHeading"],
    ["character", "action", "action"],
    ["parenthetical", "dialogue", "dialogue"],
    ["dialogue", "parenthetical", "character"],
    ["transition", "sceneHeading", "action"],
  ];
  for (const [from, tab, shiftTab] of cases) {
    it(`${from} : Tab → ${tab}, Maj+Tab → ${shiftTab}`, () => {
      const text = from === "parenthetical" ? "(bas)" : "Texte";
      open([{ type: from, text }]);
      cursorAtEnd(0);
      expect(press("Tab")).toBe(true);
      expect(currentType()).toBe(tab);

      editor.destroy();
      open([{ type: from, text }]);
      cursorAtEnd(0);
      expect(press("Tab", { shiftKey: true })).toBe(true);
      expect(currentType()).toBe(shiftTab);
    });
  }

  it("la didascalie gagne et perd ses parenthèses avec son type", () => {
    open([{ type: "dialogue", text: "à voix basse" }]);
    cursorAtEnd(0);
    press("Tab");
    expect(shape()).toEqual(["parenthetical: (à voix basse)"]);
    press("Tab");
    expect(shape()).toEqual(["dialogue: à voix basse"]);
  });

  it("un en-tête qui change de type perd son lien avec la carte", () => {
    open("INT. PHARE - NUIT [[cosmos:k1]] #3#\n");
    cursorAtEnd(0);
    press("Tab");
    expect(model().elements).toEqual([{ type: "action", text: "INT. PHARE - NUIT" }]);
  });

  it("la barre d'éléments passe par la même commande", () => {
    open([{ type: "action", text: "couper à :" }]);
    cursorAtEnd(0);
    setElementType("transition")(editor.state, editor.view.dispatch);
    expect(shape()).toEqual(["transition: COUPER À :"]);
  });
});

describe("Entrée", () => {
  const next: [ScreenplayElement["type"], string][] = [
    ["sceneHeading", "action"],
    ["action", "action"],
    ["character", "dialogue"],
    ["parenthetical", "dialogue"],
    ["dialogue", "action"],
    ["transition", "sceneHeading"],
  ];
  for (const [from, to] of next) {
    it(`après ${from} : ${to}`, () => {
      open([{ type: from, text: from === "parenthetical" ? "(bas)" : "TEXTE" }]);
      cursorAtEnd(0);
      press("Enter");
      expect(editor.state.doc.childCount).toBe(2);
      expect(currentType()).toBe(to);
    });
  }

  it("sur un élément vide : le transforme, sans créer de ligne", () => {
    open();
    press("Enter");
    expect(shape()).toEqual(["character: "]);
    press("Enter");
    expect(shape()).toEqual(["action: "]);
  });

  it("au milieu d'une action : coupe le paragraphe en deux actions", () => {
    open([{ type: "action", text: "Avant. Après." }]);
    editor.commands.setTextSelection(8);
    press("Enter");
    expect(shape()).toEqual(["action: Avant. ", "action: Après."]);
  });

  it("au milieu d'un en-tête lié : le lien reste sur l'en-tête", () => {
    open("INT. PHARE - NUIT [[cosmos:k1]]\n");
    editor.commands.setTextSelection(11);
    press("Enter");
    expect(model().elements).toEqual([
      { type: "sceneHeading", text: "INT. PHARE", cardId: "k1" },
      { type: "action", text: " - NUIT" },
    ]);
  });

  it("dans une didascalie, où que soit le curseur : passe au dialogue", () => {
    open([{ type: "parenthetical", text: "(bas)" }]);
    editor.commands.setTextSelection(3);
    press("Enter");
    expect(shape()).toEqual(["parenthetical: (bas)", "dialogue: "]);
  });

  it("Maj+Entrée : retour à la ligne dans l'action, rien dans un personnage", () => {
    open([{ type: "action", text: "Un." }]);
    cursorAtEnd(0);
    press("Enter", { shiftKey: true });
    type("Deux.");
    expect(shape()).toEqual(["action: Un.\nDeux."]);

    editor.destroy();
    open([{ type: "character", text: "HUGO" }]);
    cursorAtEnd(0);
    expect(press("Enter", { shiftKey: true })).toBe(true);
    expect(shape()).toEqual(["character: HUGO"]);
  });
});

describe("Retour arrière", () => {
  it("sur un élément vide : le supprime et remonte à la fin du précédent", () => {
    open([{ type: "action", text: "Un." }]);
    cursorAtEnd(0);
    press("Enter");
    press("Tab");
    expect(shape()).toEqual(["action: Un.", "character: "]);
    expect(press("Backspace")).toBe(true);
    expect(shape()).toEqual(["action: Un."]);
    type(" Deux.");
    expect(shape()).toEqual(["action: Un. Deux."]);
  });

  it("une didascalie réduite à ses parenthèses compte comme vide", () => {
    open([{ type: "character", text: "HUGO" }]);
    cursorAtEnd(0);
    press("Enter");
    type("(");
    expect(shape()).toEqual(["character: HUGO", "parenthetical: ()"]);
    press("Backspace");
    expect(shape()).toEqual(["character: HUGO"]);
  });

  it("dernier élément du document : redevient une action vide", () => {
    open([{ type: "character", text: "" }]);
    press("Backspace");
    expect(shape()).toEqual(["action: "]);
  });
});

describe("détection à la frappe", () => {
  it("préfixes d'en-tête en début d'action", () => {
    for (const prefix of ["int. ", "EXT. ", "int./ext. ", "i/e ", "Est. "]) {
      open();
      type(prefix);
      expect(shape(), prefix).toEqual([`sceneHeading: ${prefix.toUpperCase()}`]);
      editor.destroy();
    }
  });

  it("aussi dans un personnage ou une transition vides (scène suivante après une réplique)", () => {
    for (const type0 of ["character", "transition"] as const) {
      open([{ type: type0, text: "" }]);
      type("ext. ");
      expect(shape(), type0).toEqual(["sceneHeading: EXT. "]);
      editor.destroy();
    }
  });

  it("pas au milieu d'une phrase, ni pour un mot qui commence pareil", () => {
    open();
    type("Il dit : int. ");
    expect(currentType()).toBe("action");
    editor.destroy();
    open();
    type("interdit ");
    expect(currentType()).toBe("action");
  });

  it("Retour arrière juste après : annule la détection", () => {
    open();
    type("int. ");
    expect(currentType()).toBe("sceneHeading");
    press("Backspace");
    expect(shape()).toEqual(["action: int. "]);
  });

  it("annuler (Ctrl/Cmd+Z) revient à l'action", () => {
    open();
    type("int. ");
    editor.commands.undo();
    expect(currentType()).toBe("action");
  });

  it("« ( » ne devient une didascalie qu'au début d'un dialogue vide", () => {
    open([{ type: "dialogue", text: "Oui" }]);
    cursorAtEnd(0);
    type(" (non)");
    expect(shape()).toEqual(["dialogue: Oui (non)"]);
    editor.destroy();
    open();
    type("(plan large)");
    expect(shape()).toEqual(["action: (plan large)"]);
  });

  it("majuscules accentuées pour ce qu'on écrit, pas pour l'action ni le dialogue", () => {
    open();
    press("Tab");
    type("zoé (h.c.)");
    press("Enter");
    type("Ça va ?");
    expect(shape()).toEqual(["character: ZOÉ (H.C.)", "dialogue: Ça va ?"]);
  });

  it("une action en majuscules finissant par « : » devient une transition à la validation", () => {
    open();
    type("FONDU AU NOIR :");
    press("Enter");
    expect(shape()).toEqual(["transition: FONDU AU NOIR :", "sceneHeading: "]);
  });
});

describe("sortir au clavier", () => {
  it("Tab reste dans le texte, Échap rend la main", () => {
    open();
    expect(press("Tab")).toBe(true);
    expect(press("Escape")).toBe(true);
    expect(onEscape).toHaveBeenCalled();
  });
});

describe("ce qu'on écrit alimente le canevas", () => {
  const created: [string, string][] = [];
  const links: [string, string][] = [];
  const places: { id: string; title: string }[] = [];
  const host = (cards: string[] = []) => ({
    addCard: (type: "scene" | "personnage" | "lieu", title: string) => {
      created.push([type, title]);
      const id = `carte${created.length}`;
      if (type === "personnage") cards.push(title);
      if (type === "lieu") places.push({ id, title });
      return id;
    },
    characterCards: () => cards,
    locationCards: () => places,
    linkSceneToLocation: (scene: string, place: string) => void links.push([scene, place]),
    locale: "fr",
  });
  const reset = () => {
    created.length = 0;
    links.length = 0;
    places.length = 0;
  };

  it("une scène et ses personnages écrits au clavier reçoivent leurs cartes, une seule fois", () => {
    reset();
    const cards = ["Inès Morvan"];
    open([]);
    type("int. phare - nuit");
    // L'en-tête est encore seul : il est peut-être en cours de frappe.
    expect(adoptNew(editor, host(cards))).toBeNull();
    press("Enter");
    type("La lampe est froide.");
    press("Enter");
    press("Tab");
    type("hugo (h.c.)");
    // Le personnage n'a pas encore de réplique : son nom n'est pas fini.
    adoptNew(editor, host(cards));
    expect(created).toEqual([
      ["scene", "INT. PHARE - NUIT"],
      ["lieu", "Phare"],
    ]);
    expect(links).toEqual([["carte1", "carte2"]]);
    press("Enter");
    type("Tu ne devrais pas monter seule.");
    press("Enter");
    press("Tab");
    type("inès");
    press("Enter");
    type("J’arrive.");
    adoptNew(editor, host(cards));

    // Hugo est nouveau ; Inès a déjà sa carte (« Inès Morvan »).
    expect(created).toEqual([
      ["scene", "INT. PHARE - NUIT"],
      ["lieu", "Phare"],
      ["personnage", "Hugo"],
    ]);
    expect(model().elements[0]).toEqual({ type: "sceneHeading", text: "INT. PHARE - NUIT", cardId: "carte1" });
    // Rien de plus au passage suivant.
    expect(adoptNew(editor, host(cards))).toBeNull();
    expect(created).toHaveLength(3);
  });

  it("décor : une seule carte par lieu, reliée à chaque scène ; pas de décor pour un titre libre", () => {
    reset();
    places.push({ id: "port", title: "Port" });
    open([]);
    type("ext. port - jour");
    press("Enter");
    type("Hugo attend.");
    press("Enter");
    press("Tab", { shiftKey: true });
    type("int. phare, lanterne - nuit");
    press("Enter");
    type("La lampe.");
    press("Enter");
    press("Tab", { shiftKey: true });
    type("ext. PORT - nuit");
    press("Enter");
    type("Personne.");
    press("Enter");
    press("Tab", { shiftKey: true });
    type("Inès trouve le journal");
    press("Enter");
    type("Elle lit.");
    adoptNew(editor, host());

    expect(created.filter(([kind]) => kind === "lieu")).toEqual([["lieu", "Phare, Lanterne"]]);
    expect(created.filter(([kind]) => kind === "scene")).toHaveLength(4);
    const lantern = places.find((p) => p.title === "Phare, Lanterne")!.id;
    expect(links.map(([, place]) => place)).toEqual(["port", lantern, "port"]);
  });

  it("un fichier ouvert n'est pas transformé en cartes d'office", () => {
    reset();
    open("INT. PHARE - NUIT\n\nLa lampe.\n\nHUGO\nOui.\n");
    expect(adoptNew(editor, host())).toBeNull();
    expect(created).toEqual([]);
    // Mais une scène ajoutée à ce fichier, si.
    cursorAtEnd(3);
    press("Enter");
    type("ext. port - jour");
    press("Enter");
    type("Hugo attend.");
    adoptNew(editor, host());
    expect(created).toEqual([
      ["scene", "EXT. PORT - JOUR"],
      ["lieu", "Port"],
    ]);
  });

  it("la création des cartes n'entre pas dans l'historique d'annulation", () => {
    reset();
    open([]);
    type("int. phare - nuit");
    press("Enter");
    type("La lampe.");
    adoptNew(editor, host());
    editor.commands.undo();
    expect(model().elements.find((el) => el.type === "sceneHeading")?.cardId).toBe("carte1");
  });
});
