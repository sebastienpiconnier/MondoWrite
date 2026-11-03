// @vitest-environment happy-dom
// Import Scrivener, lot 3 (docs/plan-import-scrivener.md) : instantanés en versions des scènes, historique
// d'écriture en statistiques, pages du livre reconnues, ancien format refusé avec un message.

import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { buildScrivener, readScrivenerSource, snapshotDate } from "../import/scrivener";
import { historyProgress, pageKindOf } from "../import/scrivener/mapping";
import { readVersionFile } from "../versions";

let n = 0;
const newId = () => `id${String(++n).padStart(6, "0")}`;
const rtf = (body: string) => `{\\rtf1\\ansi\\ansicpg1252{\\fonttbl\\f0\\fnil Palatino;}\\pard\\f0\\fs26 ${body}}`;
const U = (k: string) => `${[...k].map((c) => c.charCodeAt(0).toString(16)).join("").padEnd(8, "0").slice(0, 8)}-0000-0000-0000-000000000000`.toUpperCase();
const item = (uuid: string, type: string, title: string, children = "") =>
  `<BinderItem UUID="${U(uuid)}" Type="${type}"><Title>${title}</Title>${children ? `<Children>${children}</Children>` : ""}</BinderItem>`;
const scrivx = (binder: string, version = "2.0") => `<?xml version="1.0" encoding="UTF-8"?><ScrivenerProject Version="${version}"><Binder>${binder}</Binder></ScrivenerProject>`;
const files = (entries: Record<string, string>) => new Map(Object.entries(entries).map(([k, v]) => [k, strToU8(v)]));

describe("lectures simples", () => {
  it("lit la date d'un instantané, dans son nom de fichier comme dans l'index", () => {
    expect(snapshotDate("2025-06-01-11-36-07+0200")).toBe("2025-06-01T11:36:07+02:00");
    expect(snapshotDate("2025-06-01 11:36:07 +0200")).toBe("2025-06-01T11:36:07+02:00");
    expect(snapshotDate("pas une date")).toBeNull();
  });

  it("reconstitue les mots écrits par jour en remontant depuis le total importé", () => {
    const xml = `<WritingHistory><Day dwc="500" dtwc="500">2025-06-01</Day><Day dwc="0">2025-06-02</Day><Day dwc="-20">2025-06-03</Day><Day dwc="300">2025-06-04</Day></WritingHistory>`;
    expect(historyProgress(xml, 1000)).toEqual({
      "2025-06-01": { start: 220, end: 720 },
      "2025-06-03": { start: 720, end: 700 },
      "2025-06-04": { start: 700, end: 1000 },
    });
    // Jamais sous zéro, même si l'historique compte plus de mots que le texte importé.
    expect(historyProgress(`<Day dwc="900">2025-06-01</Day>`, 100)["2025-06-01"]).toEqual({ start: 0, end: 100 });
  });

  it("reconnaît les pages du livre à leur titre, en français et en anglais", () => {
    expect(pageKindOf("Dédicace")).toBe("dedicace");
    expect(pageKindOf("Acknowledgments")).toBe("remerciements");
    expect(pageKindOf("Épigraphe")).toBe("epigraphe");
    expect(pageKindOf("À propos de l’auteur")).toBe("auteur");
    expect(pageKindOf("Prologue")).toBeNull();
    expect(pageKindOf("Chapitre 1")).toBeNull();
  });
});

describe("projet complet", () => {
  const data = (uuid: string, file: string) => `Roman.scriv/Files/Data/${U(uuid)}/${file}`;
  const snaps = (uuid: string) => `Roman.scriv/Snapshots/${U(uuid)}.snapshots/`;
  const source = readScrivenerSource(
    files({
      "Roman.scriv/Roman.scrivx": scrivx(
        item("draft", "DraftFolder", "Manuscrit", item("ded", "Text", "Dédicace") + item("c1", "Text", "Chapitre 1 - Le départ")) +
          item("front", "Folder", "Pages liminaires", item("ack", "Text", "Remerciements")),
      ),
      [data("ded", "content.rtf")]: rtf("\\'c0 Lise.\\\n"),
      [data("ack", "content.rtf")]: rtf("Merci \\'e0 tous.\\\n"),
      [data("c1", "content.rtf")]: rtf("Il part.\\\n***\\\nIl arrive.\\\n"),
      [`${snaps("c1")}index.xml`]: `<Snapshots><Snapshot><Title>Avant relecture</Title><Date>2025-06-01 11:36:07 +0200</Date></Snapshot><Snapshot><Title>Instantané sans titre</Title><Date>2025-06-02 09:00:00 +0200</Date></Snapshot></Snapshots>`,
      [`${snaps("c1")}2025-06-01-11-36-07+0200.rtf`]: rtf("Il partit.\\\n***\\\nIl arriva.\\\n"),
      [`${snaps("c1")}2025-06-02-09-00-00+0200.rtf`]: rtf("Une seule scène, plus de coupure.\\\n"),
      "Roman.scriv/Files/writing.history": `<WritingHistory><Day dwc="3">2025-06-01</Day></WritingHistory>`,
    }),
  )!;
  const built = buildScrivener(source, { newId })!;
  const { project, report, versions } = built;

  it("fait des pages du livre de la dédicace (dans le Manuscrit) et des remerciements (hors du Manuscrit)", () => {
    const pages = project.cards.filter((c) => c.page);
    expect(pages.map((c) => [c.title, c.page])).toEqual([
      ["Dédicace", "dedicace"],
      ["Remerciements", "remerciements"],
    ]);
    expect(project.manuscript?.[pages[0].id]).toContain("Lise");
    expect(project.meta.plan?.chapters).toHaveLength(1);
    expect(report.pages).toBe(2);
  });

  it("donne à chaque scène son morceau de l'instantané, ou tout à la première si la coupure a changé", () => {
    const scenes = project.meta.plan!.chapters![0].scenes;
    expect(scenes).toHaveLength(2);
    const of = (id: string) => versions.filter(([c]) => c === id).map(([, name, text]) => readVersionFile(name, text)!);
    const first = of(scenes[0]);
    expect(first.map((v) => v.title)).toEqual(["Instantané Scrivener : Avant relecture", "Instantané Scrivener"]);
    expect(first[0].text).toContain("Il partit.");
    expect(first[0].date).toBe("2025-06-01T11:36:07+02:00");
    expect(first[1].text).toContain("Une seule scène");
    expect(of(scenes[1]).map((v) => v.text.trim())).toEqual(["Il arriva."]);
    expect(report.versions).toBe(3);
  });

  it("reprend l'historique d'écriture", () => {
    expect(project.meta.progress).toEqual({ "2025-06-01": { start: 6, end: 9 } });
    expect(report.days).toBe(1);
  });
});

it("refuse un projet de Scrivener 2 avec une raison que l'accueil sait dire", () => {
  const old = files({ "Vieux.scriv/Vieux.scrivx": scrivx(item("draft", "DraftFolder", "Draft"), "1.0") });
  expect(() => readScrivenerSource(old)).toThrow("scrivener-old");
});
