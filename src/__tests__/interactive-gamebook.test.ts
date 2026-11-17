// @vitest-environment happy-dom
// Roman interactif, lot 8 : livre-jeu (sections numérotées et mélangées, renvois, faits à noter).

import { describe, expect, it } from "vitest";
import { choicesHtml, sceneSlugs } from "../interactive/choices";
import { gamebookDoc, numberSections, seedOf, type GamebookInput } from "../interactive/gamebook";
import { chapterXhtml } from "../export/text";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import type { Run } from "../export/doc";

const scenes = [
  { id: "s1", title: "La grille" },
  { id: "s2", title: "La cour" },
  { id: "s3", title: "Le village" },
  { id: "s4", title: "La tour" },
  { id: "s5", title: "Le puits" },
];
const manuscript: Record<string, string> = {
  s1: `<p>La grille est entrouverte.</p>${choicesHtml("* [Pousser la grille] -> la_cour\n  ~ cle = true\n* [Rentrer au village] -> le_village")}`,
  s2: `<p>La cour est vide.</p>${choicesHtml("* { cle } [Ouvrir la tour] -> la_tour\n* { not le_puits } [Voir le puits] -> le_puits\n* [Partir] -> END")}`,
  s3: `<p>Le village dort.</p>${choicesHtml("* [Repartir] -> la_grille\n  ~ pieces += 2")}`,
  s4: "<p>La tour est haute.</p>",
  s5: `<p>Le puits est sec.</p>${choicesHtml("-> la_cour")}`,
};

const input = (texts = fr.interactive.gamebook, lang = "fr"): GamebookInput => ({
  title: "La grille",
  author: "Sébastien",
  lang,
  scenes,
  slugs: sceneSlugs(scenes),
  manuscript,
  factLabels: { cle: "La clé", pieces: "Pièces" },
  texts,
});

const text = (runs: Run[]) => runs.map((r) => r.text).join("");
const lines = (doc: ReturnType<typeof gamebookDoc>["doc"], n: number) =>
  doc.chapters[n].blocks.flatMap((b) => (b.kind === "paragraph" ? [text(b.runs)] : []));

describe("livre-jeu", () => {
  it("garde la première scène au 1 et mélange les autres, toujours de la même façon", () => {
    const a = numberSections(input());
    expect(a[0]).toEqual({ id: "s1", n: 1 });
    expect(a.map((s) => s.id).sort()).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(numberSections(input())).toEqual(a);
    // L'ordre des scènes dans le projet ne change pas la graine.
    expect(seedOf(["a", "b"])).toBe(seedOf(["b", "a"]));
  });

  it("évite qu'un choix mène à la section juste en dessous quand c'est possible", () => {
    const sections = numberSections(input());
    const order = sections.map((s) => s.id);
    const next = (id: string) => order[order.indexOf(id) + 1];
    expect(next("s1")).not.toBe("s2");
    expect(next("s1")).not.toBe("s3");
  });

  it("écrit les renvois, les conditions, les faits à noter et les fins", () => {
    const { doc, sections } = gamebookDoc(input());
    const n = (id: string) => sections.find((s) => s.id === id)!.n;
    expect(doc.chapters[0].title).toBe("Avant de commencer");
    expect(doc.chapters).toHaveLength(6);
    expect(doc.chapters[1].title).toBe("1");
    expect(lines(doc, 1)).toEqual([
      "La grille est entrouverte.",
      `Pousser la grille : notez « La clé », puis rendez-vous au ${n("s2")}.`,
      `Rentrer au village : rendez-vous au ${n("s3")}.`,
    ]);
    expect(lines(doc, n("s2"))).toEqual([
      "La cour est vide.",
      `Si vous avez noté « La clé », ouvrir la tour : rendez-vous au ${n("s4")}.`,
      `Si vous n’êtes pas encore passé par le ${n("s5")}, voir le puits : rendez-vous au ${n("s5")}.`,
      "Partir : fin de l’histoire.",
    ]);
    expect(lines(doc, n("s3"))[1]).toBe(`Repartir : ajoutez 2 à « Pièces », puis rendez-vous au 1.`);
    expect(lines(doc, n("s4"))).toEqual(["La tour est haute.", "Fin."]);
    expect(lines(doc, n("s5"))).toEqual(["Le puits est sec.", `Rendez-vous au ${n("s2")}.`]);
    // Le bloc de choix n'est jamais imprimé tel quel.
    expect(JSON.stringify(doc)).not.toContain("->");
  });

  it("fait des numéros des liens vers leur section", () => {
    const { doc, sections } = gamebookDoc(input());
    const run = doc.chapters[1].blocks.flatMap((b) => (b.kind === "paragraph" ? b.runs : [])).find((r) => r.chapter !== undefined)!;
    expect(run.chapter).toBe(sections.find((s) => s.id === "s2")!.n);
    expect(run.text).toBe(String(run.chapter));
    const xhtml = chapterXhtml(doc.chapters[1].blocks, undefined, (k) => `ch${k + 1}.xhtml`);
    expect(xhtml).toContain(`<a href="ch${run.chapter! + 1}.xhtml">${run.chapter}</a>`);
  });

  it("parle anglais avec les guillemets anglais", () => {
    const { doc } = gamebookDoc(input(en.interactive.gamebook, "en"));
    expect(lines(doc, 1)[1]).toMatch(/^Pousser la grille: note “La clé”, then turn to \d+\.$/);
  });

  it("annonce les mots à noter seulement s'il y en a", () => {
    expect(lines(gamebookDoc(input()).doc, 0)).toHaveLength(2);
    const plain = { ...input(), manuscript: { s1: "<p>Seul.</p>" }, scenes: [scenes[0]] };
    expect(lines(gamebookDoc(plain).doc, 0)).toHaveLength(1);
  });
});

describe("gamebookBook (livre broché d'un livre-jeu)", () => {
  it("garde les pages du livre sauf l'épilogue, puis l'ouverture et les sections numérotées", async () => {
    const { gamebookBook } = await import("../interactive/gamebook");
    const base = {
      title: "T",
      author: "A",
      lang: "fr",
      year: 2026,
      sections: [
        { kind: "page" as const, page: "dedicace" as const, title: "Dédicace", blocks: [] },
        { kind: "chapter" as const, label: "", title: "Scène", toc: "Scène", blocks: [] },
        { kind: "page" as const, page: "epilogue" as const, title: "Épilogue", blocks: [] },
      ],
    };
    const doc = { title: "T", author: "A", lang: "fr", chapters: [{ title: "Avant de commencer", blocks: [] }, { title: "1", blocks: [] }, { title: "2", blocks: [] }] };
    const out = gamebookBook(base, doc);
    expect(out.sections.map((s) => (s.kind === "page" ? s.page : `${s.title}:${s.section ?? "-"}`))).toEqual(["dedicace", "Avant de commencer:-", "1:1", "2:2"]);
  });
});
