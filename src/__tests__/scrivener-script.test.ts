// @vitest-environment happy-dom
// Import Scrivener d'un scénario (mode script) : chaque élément reconnu à son retrait, comme dans le modèle
// « Screenplay » de Scrivener 3 (vérifié sur un vrai projet). Projet fabriqué : jamais de vrai projet dans le dépôt.

import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { buildScrivener, readScrivenerSource } from "../import/scrivener";
import { isScriptDraft, scriptElements } from "../import/scrivener/script";
import { rtfDocument } from "../import/scrivener/rtf";
import { readVersionFile } from "../versions";

let n = 0;
const newId = () => `id${String(++n).padStart(6, "0")}`;
// Paragraphes tels que Scrivener les écrit : \pard, retrait à gauche (twips), alignement.
const P = {
  heading: "\\pard\\li720\\ri-720\\sl-240\\sb480 ",
  action: "\\pard\\li720\\ri-720\\sl-240\\sb240 ",
  character: "\\pard\\li3600\\ri-360\\sl-240\\sb240 ",
  paren: "\\pard\\li2880\\fi-144\\ri2160\\sl-240 ",
  dialogue: "\\pard\\li2160\\ri1440\\sl-240 ",
  transition: "\\pard\\li6480\\ri-173\\sl-240\\sb240\\qr ",
};
const rtf = (...paras: [keyof typeof P, string][]) =>
  `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2869{\\fonttbl\\f0\\fnil\\fcharset0 CourierPrime;}${paras.map(([k, t]) => `${P[k]}\\f0\\fs24 \\cf0 ${t}\\\n`).join("")}}`;

describe("éléments d'un document en mode script", () => {
  it("reconnaît chaque élément à son retrait", () => {
    const doc = rtfDocument(
      rtf(
        ["heading", "<$ScrKeepWithNext>INT. COULOIR - JOUR #22#"],
        ["action", "Ethan sonne."],
        ["character", "<$ScrKeepWithNext>L'HOMME"],
        ["paren", "(agressif)"],
        ["dialogue", "T'es qui toi?"],
        ["transition", "\\'c9CRAN NOIR"],
      ),
    );
    expect(scriptElements(doc.paras, "INT. COULOIR - JOUR #22#")).toEqual([
      { type: "sceneHeading", text: "INT. COULOIR - JOUR", sceneNumber: "22" },
      { type: "action", text: "Ethan sonne." },
      { type: "character", text: "L'HOMME" },
      { type: "parenthetical", text: "(agressif)" },
      { type: "dialogue", text: "T'es qui toi?" },
      { type: "transition", text: "ÉCRAN NOIR" },
    ]);
  });

  it("prend l'en-tête dans le titre du document quand le texte n'en a pas", () => {
    const els = scriptElements(rtfDocument(rtf(["action", "Il pleut."])).paras, "EXT. PLAGE - NUIT");
    expect(els[0]).toEqual({ type: "sceneHeading", text: "EXT. PLAGE - NUIT" });
    const forced = scriptElements(rtfDocument(rtf(["action", "Il pleut."])).paras, "La plage");
    expect(forced[0]).toMatchObject({ type: "sceneHeading", text: "La plage", forced: true });
  });

  it("ne voit un scénario que si la plupart des documents sont en mode script", () => {
    expect(isScriptDraft([{ type: "Text", script: true }, { type: "Text", script: true }, { type: "Text" }])).toBe(true);
    expect(isScriptDraft([{ type: "Text", script: true }, { type: "Text" }])).toBe(false);
    expect(isScriptDraft([{ type: "Folder" }])).toBe(false);
  });
});

const U = (k: string) => `${[...k].map((c) => c.charCodeAt(0).toString(16)).join("").padEnd(8, "0").slice(0, 8)}-0000-0000-0000-000000000000`.toUpperCase();
const item = (uuid: string, type: string, title: string, inner = "", children = "") =>
  `<BinderItem UUID="${U(uuid)}" Type="${type}"><Title>${title}</Title>${inner}${children ? `<Children>${children}</Children>` : ""}</BinderItem>`;
const scriptMode = "<TextSettings><TextMode>Script</TextMode></TextSettings>";

describe("projet scénario", () => {
  const data = (uuid: string, file: string) => `Film.scriv/Files/Data/${U(uuid)}/${file}`;
  const source = readScrivenerSource(
    new Map(
      Object.entries({
        "Film.scriv/Film.scrivx": `<?xml version="1.0"?><ScrivenerProject Version="2.0"><Binder>${
          item("draft", "DraftFolder", "Screenplay", "", item("s1", "Text", "INT. COULOIR - JOUR #1#", `<MetaData><StatusID>5</StatusID></MetaData>${scriptMode}`) + item("s2", "Text", "EXT. RUE - NUIT #2#", scriptMode)) +
          item("front", "Folder", "Front Matter", "", item("tp", "Text", "Title Page")) +
          item("chars", "Folder", "Characters", "", item("c1", "Text", "Ethan"))
        }</Binder><StatusSettings><StatusItems><Status ID="5">Terminé</Status></StatusItems></StatusSettings></ScrivenerProject>`,
        [data("s1", "content.rtf")]: rtf(["heading", "INT. COULOIR - JOUR #1#"], ["character", "ETHAN"], ["dialogue", "Bonjour"]),
        [data("s1", "synopsis.txt")]: "Ethan croise sa voisine.",
        [data("s2", "content.rtf")]: rtf(["heading", "EXT. RUE - NUIT #2#"], ["action", "La rue est vide."]),
        [data("tp", "content.rtf")]: rtf(["action", "<$PROJECTTITLE>"]),
        [data("c1", "content.rtf")]: "{\\rtf1\\ansi Role in Story: H\\'e9ros\\\nOccupation: Comptable\\\n}",
        [`Film.scriv/Snapshots/${U("s2")}.snapshots/2025-06-01-10-00-00+0200.rtf`]: rtf(["heading", "EXT. RUE - NUIT #2#"], ["action", "La rue est d\\'e9serte."]),
      }).map(([k, v]) => [k, strToU8(v)]),
    ),
  )!;
  const { project, report, versions } = buildScrivener(source, { newId })!;
  const els = project.screenplay!.elements;

  it("fait un projet scénario, une carte par scène, le synopsis et le statut à leur place", () => {
    expect(project.meta.kind).toBe("scenario");
    expect(els.map((e) => e.type)).toEqual(["sceneHeading", "synopsis", "character", "dialogue", "sceneHeading", "action"]);
    expect(els[1].text).toBe("Ethan croise sa voisine.");
    const scenes = project.cards.filter((c) => c.type === "scene");
    expect(scenes.map((c) => c.title)).toEqual(["INT. COULOIR - JOUR", "EXT. RUE - NUIT"]);
    expect(scenes[0].fiche?.statut).toBe("fini");
    expect(els[0]).toMatchObject({ cardId: scenes[0].id, sceneNumber: "1" });
    expect(report.scenes).toBe(2);
  });

  it("donne la fiche du dossier Characters au personnage qui parle, sans doublon, et laisse la page de titre", () => {
    const ethan = project.cards.filter((c) => c.type === "personnage");
    expect(ethan.map((c) => c.title)).toEqual(["Ethan"]);
    expect(ethan[0].fiche).toMatchObject({ role: "Héros", metier: "Comptable" });
    expect(project.cards.some((c) => c.title === "Title Page")).toBe(false);
    expect(project.cards.filter((c) => c.type === "lieu").map((c) => c.title)).toEqual(["Couloir", "Rue"]);
  });

  it("garde les instantanés en versions Fountain de la scène, sans l'en-tête", () => {
    const scene = project.cards.find((c) => c.title === "EXT. RUE - NUIT")!;
    const [own] = versions.filter(([c]) => c === scene.id).map(([, name, text]) => readVersionFile(name, text)!);
    expect(own.kind).toBe("scenario");
    expect(own.text.trim()).toBe("La rue est déserte.");
  });
});
