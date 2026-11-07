// @vitest-environment happy-dom
// Révisions de scénario, lot 1 (#18) : note Fountain, bloc cosmos.json, marquage, PDF, Final Draft.

import { describe, expect, it } from "vitest";
import { parse } from "../parse";
import { serialize } from "../serialize";
import type { ScreenplayElement } from "../model";
import {
  EMPTY_REVISIONS,
  clearMarks,
  closeRevision,
  colorFor,
  currentSet,
  markChanged,
  markedCount,
  nextNumber,
  openRevision,
  readRevNote,
  readRevisions,
  revNote,
  revisionsToMeta,
  usedRevisions,
  withUsedSets,
} from "../revisions";
import { typeset } from "../export/typeset";
import { LAYOUTS } from "../layout";
import { buildFdx } from "../export/fdx";
import { parseFdx, parseFdxRevisions } from "../fdxImport";
import { toDoc, fromDoc } from "../editor/convert";

const strings = { more: "(À SUIVRE)", contd: "(SUITE)" };
const el = (type: ScreenplayElement["type"], text: string, extra: Partial<ScreenplayElement> = {}): ScreenplayElement => ({ type, text, ...extra });

describe("note de révision", () => {
  it("s'écrit et se relit en fin de texte", () => {
    expect(revNote(3)).toBe("[[cosmos:rev:3]]");
    expect(readRevNote("Elle ouvre la porte. [[cosmos:rev:3]]")).toEqual({ text: "Elle ouvre la porte.", rev: 3 });
    expect(readRevNote("Pas de note")).toEqual({ text: "Pas de note" });
    expect(readRevNote("[[cosmos:rev:0]]").rev).toBeUndefined();
  });

  it("aller-retour Fountain pour chaque sorte d'élément", () => {
    const sp = {
      titlePage: {},
      elements: [
        el("sceneHeading", "INT. PHARE - NUIT", { cardId: "abc123", sceneNumber: "12A", rev: 2 }),
        el("action", "La lampe tourne.\nUn cri.", { rev: 1 }),
        el("character", "INÈS"),
        el("parenthetical", "(bas)", { rev: 2 }),
        el("dialogue", "Qui est là ?", { rev: 2 }),
        el("transition", "FONDU AU NOIR :", { rev: 1, forced: true }),
        el("transition", "CUT TO:", { rev: 3, forced: true }),
        el("action", "Sans marque."),
      ],
    };
    const source = serialize(sp);
    expect(source).toContain("INT. PHARE - NUIT [[cosmos:abc123]] #12A# [[cosmos:rev:2]]");
    expect(source).toContain("> CUT TO: [[cosmos:rev:3]]");
    expect(parse(source)).toEqual(sp);
    // Un fichier sans marque ne change pas d'un octet.
    expect(serialize(parse(serialize({ titlePage: {}, elements: [el("action", "Rien.")] })))).toBe("Rien.\n");
  });

  it("l'ordre des notes est [[ia]], révision, commentaires", () => {
    const sp = { titlePage: {}, elements: [el("action", "Texte", { ia: true, rev: 2, comments: ["c0mment1"] })] };
    const source = serialize(sp);
    expect(source.trim()).toBe("Texte [[ia]] [[cosmos:rev:2]] [[cosmos:comment:c0mment1]]");
    expect(parse(source)).toEqual(sp);
  });

  it("un nom de personnage ne porte pas de marque", () => {
    expect(serialize({ titlePage: {}, elements: [el("character", "INÈS", { rev: 2 }), el("dialogue", "Oui.")] })).not.toContain("rev");
  });
});

describe("bloc revisions de cosmos.json", () => {
  it("n'écrit rien tant qu'aucune passe n'est ouverte", () => {
    expect(revisionsToMeta(EMPTY_REVISIONS)).toBeUndefined();
  });

  it("ouvre des passes de couleurs successives et les relit", () => {
    let r = openRevision(EMPTY_REVISIONS, { date: "2026-11-03", label: "  Version   tournage " });
    expect(r.current).toBe(1);
    expect(currentSet(r)).toMatchObject({ n: 1, color: "bleu", date: "2026-11-03", label: "Version tournage" });
    r = closeRevision(r);
    expect(r.current).toBeNull();
    r = openRevision(r, { date: "2026-11-05" });
    expect(currentSet(r)?.color).toBe("rose");
    expect(nextNumber(r)).toBe(3);
    expect(readRevisions(JSON.parse(JSON.stringify(revisionsToMeta(r))))).toEqual(r);
  });

  it("les couleurs reprennent après la huitième", () => {
    expect(colorFor(1)).toBe("bleu");
    expect(colorFor(9)).toBe("bleu");
    expect(colorFor(8)).toBe("cerise");
  });

  it("écarte les valeurs inconnues à la lecture", () => {
    const r = readRevisions({
      sets: [{ n: 2, color: "mauve", date: "hier", label: 5 }, { n: 2 }, { n: -1 }, "x"],
      current: 7,
      locked: { pages: [{ label: "", at: 1 }, { label: "12A", at: 3, text: "INT." }, { label: "9", at: -2 }] },
    });
    expect(r.sets).toEqual([{ n: 2, color: "rose", date: "", label: "" }]);
    expect(r.current).toBeNull();
    expect(r.locked).toEqual([{ label: "12A", at: 3, text: "INT." }]);
    expect(readRevisions(null)).toEqual(EMPTY_REVISIONS);
  });

  it("une marque sans passe connue reçoit une passe à l'import", () => {
    const r = withUsedSets(EMPTY_REVISIONS, [el("action", "A", { rev: 4 })]);
    expect(r.sets).toEqual([{ n: 4, color: "vert", date: "", label: "" }]);
    expect(r.current).toBeNull();
  });
});

describe("marques sur les éléments", () => {
  const base = [el("sceneHeading", "INT. A - JOUR"), el("action", "Un."), el("action", "Deux."), el("action", "Trois.")];

  it("marque ce qui est modifié ou ajouté, et une seule ligne d'un échange", () => {
    const next = [base[0], el("action", "Un, modifié."), base[2], el("action", "Nouveau."), base[3]];
    const out = markChanged(base, next, 2);
    expect(out.map((e) => e.rev)).toEqual([undefined, 2, undefined, 2, undefined]);
    // Deux et Trois échangés : une seule des deux lignes est « déplacée », l'autre garde sa place.
    expect(markedCount(markChanged(base, [base[0], base[1], base[3], base[2]], 2))).toBe(1);
  });

  it("rend le même tableau quand rien ne change", () => {
    expect(markChanged(base, base.slice(), 1)).toEqual(base);
    const same = base.map((e) => ({ ...e }));
    expect(markChanged(base, same, 1)).toBe(same);
  });

  it("une passe plus récente remplace la marque", () => {
    const first = markChanged(base, [base[0], el("action", "Un bis."), base[2], base[3]], 1);
    const second = markChanged(first, [first[0], el("action", "Un ter."), first[2], first[3]], 2);
    expect(second[1].rev).toBe(2);
    expect(usedRevisions([...first, ...second])).toEqual([1, 2]);
  });

  it("n'efface pas la marque d'un élément inchangé", () => {
    const marked = [base[0], el("action", "Un.", { rev: 1 }), base[2], base[3]];
    const out = markChanged(marked, [marked[0], marked[1], marked[2], el("action", "Trois bis.")], 2);
    expect(out.map((e) => e.rev)).toEqual([undefined, 1, undefined, 2]);
  });

  it("ne marque ni un nom de personnage ni un élément vide", () => {
    const out = markChanged([], [el("character", "INÈS"), el("action", ""), el("section", "Acte"), el("dialogue", "Oui.")], 1);
    expect(out.map((e) => e.rev)).toEqual([undefined, undefined, undefined, 1]);
  });

  it("« Nouvelle version propre » retire toutes les marques sans toucher au texte", () => {
    const marked = [el("action", "A", { rev: 1 }), el("action", "B")];
    const cleared = clearMarks(marked);
    expect(cleared).toEqual([el("action", "A"), el("action", "B")]);
    expect(clearMarks(cleared)).toBe(cleared);
  });
});

describe("éditeur", () => {
  it("la marque fait l'aller-retour modèle ↔ document", () => {
    const sp = { titlePage: {}, elements: [el("action", "A", { rev: 2 }), el("character", "INÈS"), el("dialogue", "Oui.", { rev: 3 })] };
    const doc = toDoc(sp);
    expect(doc.content?.[0].attrs?.rev).toBe(2);
    expect(doc.content?.[1].attrs?.rev).toBeUndefined();
    expect(fromDoc(doc, {}).elements).toEqual(sp.elements);
  });
});

describe("PDF", () => {
  const elements = [
    el("sceneHeading", "INT. PHARE - NUIT"),
    el("action", "La lampe tourne."),
    el("action", "Un cri dans la nuit.", { rev: 2 }),
    el("character", "INÈS"),
    el("dialogue", "Qui est là ?", { rev: 3 }),
  ];

  it("les lignes révisées portent leur passe, la page la plus récente", () => {
    const pages = typeset(elements, LAYOUTS.a4, "fr", strings);
    const marked = pages[0].lines.filter((l) => l.rev !== undefined);
    expect(marked.map((l) => [l.text, l.rev])).toEqual([["Un cri dans la nuit.", 2], ["Qui est là ?", 3]]);
    expect(pages[0].rev).toBe(3);
  });

  it("sans marque, rien ne change", () => {
    const pages = typeset(elements.map(({ rev: _r, ...e }) => e), LAYOUTS.a4, "fr", strings);
    expect(pages.every((p) => p.rev === undefined && p.lines.every((l) => l.rev === undefined))).toBe(true);
  });
});

describe("Final Draft", () => {
  const sp = { titlePage: {}, elements: [el("sceneHeading", "INT. PHARE - NUIT"), el("action", "Un cri.", { rev: 2 })] };
  const revisions = openRevision(openRevision(EMPTY_REVISIONS, { date: "2026-11-01" }), { date: "2026-11-03", label: "Tournage" });

  it("écrit RevisionID et les passes", () => {
    const fdx = buildFdx(sp, "fr", false, false, revisions);
    expect(fdx).toContain('<Text RevisionID="2">Un cri.</Text>');
    expect(fdx).toContain('<Revisions ActiveSet="2" Location="Top">');
    expect(fdx).toContain('<Revision ID="2" Color="Pink" Mark="*" Name="Tournage" Date="2026-11-03" />');
  });

  it("sans révision, le fichier ne change pas", () => {
    const fdx = buildFdx({ titlePage: {}, elements: [el("action", "Rien.")] }, "fr");
    expect(fdx).not.toContain("Revision");
  });

  it("relit les marques et les passes", () => {
    const fdx = buildFdx(sp, "fr", false, false, revisions);
    expect(parseFdx(fdx)?.elements.map((e) => e.rev)).toEqual([undefined, 2]);
    const read = parseFdxRevisions(fdx);
    expect(read.current).toBe(2);
    expect(read.sets).toEqual([
      { n: 1, color: "bleu", date: "2026-11-01", label: "" },
      { n: 2, color: "rose", date: "2026-11-03", label: "Tournage" },
    ]);
    expect(parseFdxRevisions(buildFdx({ titlePage: {}, elements: [] }, "fr")).sets).toEqual([]);
  });
});
