// @vitest-environment happy-dom
// Import Scrivener, retours de l'essai sur un vrai roman (1.14.0) : puces de liste en double, liste de personnages
// dans un seul document, mots-clés qui nomment un personnage de la liste, statut d'un chapitre coupé en scènes.
// Projet fabriqué à la façon du vrai (le roman de l'auteur n'entre jamais dans le dépôt).

import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { readCharacterList } from "../import/scrivener/sketch";
import { rtfDocument } from "../import/scrivener/rtf";
import { buildScrivener, readScrivenerSource } from "../import/scrivener";
import type { ImportedPara } from "../import/manuscript";

let n = 0;
const newId = () => `id${String(++n).padStart(6, "0")}`;
const rtf = (body: string) => `{\\rtf1\\ansi\\ansicpg1252{\\fonttbl\\f0\\fnil Palatino;}\\pard\\f0\\fs26 ${body}}`;
const para = (text: string, heading = false): ImportedPara => ({ html: text, text, ...(heading ? { heading: true } : {}) });

describe("puces et liste de personnages", () => {
  it("ne garde qu'une puce quand le repère de liste et une puce collée se suivent", () => {
    const doc = rtfDocument(rtf("{\\listtext\t\\'95\t}\t\\'95\t{\\b \\'c2ge :} Environ 35 ans\\\n"));
    expect(doc.paras[0].text).toBe("• Âge : Environ 35 ans");
    expect(doc.paras[0].html).toBe("<strong>• Âge :</strong> Environ 35 ans");
  });

  it("fait un personnage par intitulé, avec son accroche, et coche les principaux", () => {
    const list = readCharacterList([
      para("Liste des personnages", true),
      para("PERSONNAGES PRINCIPAUX", true),
      para("ETHAN MOREAU - Le protagoniste", true),
      para("• Âge : Environ 35 ans"),
      para("• Profession : Employé"),
      para("• Situation : Célibataire"),
      para("PERSONNAGES SECONDAIRES PRINCIPAUX", true),
      para("VIOLETTE - La collègue amoureuse", true),
      para("• Physique : Petite, brune"),
      para("• Évolution : De l'effacée à la femme sûre d'elle"),
      para("LA SŒUR D'ETHAN - Voix off", true),
      para("• Rôle : Relance l'action"),
    ])!;
    expect(list.map((c) => c.title)).toEqual(["Ethan Moreau", "Violette", "La Sœur d'Ethan"]);
    expect(list[0]).toMatchObject({ accroche: "Le protagoniste", principal: true, fiche: { age: "Environ 35 ans", metier: "Employé" } });
    expect(list[0].body.join("")).toContain("Célibataire");
    expect(list[1]).toMatchObject({ principal: false, fiche: { apparence: "Petite, brune", arc: "De l'effacée à la femme sûre d'elle" } });
    expect(list[2].fiche.role).toBe("Relance l'action");
  });

  it("laisse une fiche ordinaire à la lecture d'une seule fiche", () => {
    expect(readCharacterList([para("Character Name: Inès"), para("Role in Story: Héroïne")])).toBeNull();
    expect(readCharacterList([para("ETHAN", true), para("• Âge : 35 ans")])).toBeNull();
  });
});

const U = (k: string) => `${[...k].map((c) => c.charCodeAt(0).toString(16)).join("").padEnd(8, "0").slice(0, 8)}-0000-0000-0000-000000000000`.toUpperCase();
const item = (uuid: string, type: string, title: string, inner = "", children = "") =>
  `<BinderItem UUID="${U(uuid)}" Type="${type}"><Title>${title}</Title>${inner}${children ? `<Children>${children}</Children>` : ""}</BinderItem>`;
const kws = (...ids: string[]) => `<Keywords>${ids.map((i) => `<KeywordID>${i}</KeywordID>`).join("")}</Keywords>`;

const scrivx = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>${
    item("draft", "DraftFolder", "Manuscrit", "", item("c1", "Text", "Chapitre 1 - Le monde ordinaire", `<MetaData><StatusID>5</StatusID></MetaData>${kws("0", "1", "2")}`)) +
    item("chars", "Folder", "Personnages", "", item("list", "Text", "Character Sketch"))
  }</Binder>
  <StatusSettings><StatusItems><Status ID="5">Terminé</Status></StatusItems></StatusSettings>
  <Keywords><Keyword ID="0"><Title>Ethan</Title></Keyword><Keyword ID="1"><Title>Dubois</Title></Keyword><Keyword ID="2"><Title>Soeur d'Ethan</Title></Keyword></Keywords>
</ScrivenerProject>`;
const data = (uuid: string) => `Roman.scriv/Files/Data/${U(uuid)}/content.rtf`;
const files = new Map<string, Uint8Array>(
  Object.entries({
    "Roman.scriv/Roman.scrivx": scrivx,
    [data("c1")]: rtf("Il pleut.\\\n***\\\nLe lendemain, il pleut encore.\\\n"),
    [data("list")]: rtf(
      "<$Scr_H::3>ETHAN MOREAU - Le protagoniste\\\n\\'95 \\'c2ge : 35 ans\\\n<$Scr_H::3>MONSIEUR DUBOIS - Le patron\\\n\\'95 Profession : Directeur\\\n<$Scr_H::3>LA S\\u338 ?UR D'ETHAN - Voix off\\\n\\'95 R\\'f4le : Relance l'action\\\n",
    ),
  }).map(([k, v]) => [k, strToU8(v)]),
);

describe("roman importé", () => {
  const { project, report } = buildScrivener(readScrivenerSource(files)!, { newId })!;
  const byTitle = (title: string) => project.cards.find((c) => c.title === title)!;
  const linked = (id: string) => project.meta.links.filter((l) => l.source === id || l.target === id).length;

  it("donne le statut du chapitre à chacune de ses scènes", () => {
    const scenes = project.cards.filter((c) => c.type === "scene");
    expect(scenes).toHaveLength(2);
    expect(scenes.every((s) => s.fiche?.statut === "fini")).toBe(true);
  });

  it("fait une carte par personnage de la liste, et y relie les mots-clés qui les nomment", () => {
    expect(project.cards.filter((c) => c.type === "personnage").map((c) => c.title)).toEqual(["Ethan Moreau", "Monsieur Dubois", "La Sœur d'Ethan"]);
    expect(report.characters).toBe(3);
    expect(report.keywords).toBe(0);
    for (const name of ["Ethan Moreau", "Monsieur Dubois", "La Sœur d'Ethan"]) expect(linked(byTitle(name).id)).toBe(2);
    expect(project.cards.some((c) => c.type === "idee")).toBe(false);
  });
});
