import { describe, expect, it } from "vitest";
import { parse } from "../screenplay/parse";
import { novelSynopsis, screenplaySynopsis, synopsisDoc } from "../synopsisView";

const labels = { act: "Acte", seq: "Séquence", untitled: "Sans titre" };

describe("lire le synopsis seul (#147)", () => {
  it("scénario : séquences, en-têtes et synopsis, sans les notes", () => {
    const sp = parse("## La nuit [[cosmos:seq:s1]]\n\nINT. PHARE - NUIT [[cosmos:a]]\n\n= Inès allume la lanterne. [[ia]]\n\nLa lanterne tourne.\n\nEXT. QUAI - NUIT\n\nIl pleut.\n");
    const rows = screenplaySynopsis(sp.elements, labels);
    expect(rows.map((r) => [r.kind, r.title, r.synopsis])).toEqual([
      ["seq", "La nuit", ""],
      ["scene", "INT. PHARE - NUIT", "Inès allume la lanterne."],
      ["scene", "EXT. QUAI - NUIT", ""],
    ]);
    expect(rows[1].cardId).toBe("a");
    const doc = synopsisDoc(rows, { title: "T", author: "", lang: "fr", heading: "Synopsis", empty: "—" });
    expect(doc.chapters[0].blocks.length).toBe(5);
  });
  it("roman : chapitres puis scènes dans l'ordre du Plan", () => {
    const plan = { template: "libre", beats: {}, chapters: [{ id: "c1", title: "Le départ", scenes: ["x", "y"] }] } as never;
    const cards = new Map([["x", { title: "Le bois", synopsis: "Elle part." }], ["y", { title: "", synopsis: "" }]]);
    const rows = novelSynopsis(["x", "y"], plan, cards, { chapter: (n, t) => `Chapitre ${n} · ${t}`, untitled: "Sans titre" });
    expect(rows.map((r) => [r.kind, r.title, r.synopsis])).toEqual([
      ["chapter", "Chapitre 1 · Le départ", ""],
      ["scene", "Le bois", "Elle part."],
      ["scene", "Sans titre", ""],
    ]);
  });
});
