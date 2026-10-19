// Le manuscrit en un seul livre : repères de scène, sauts de page forcés.

import { describe, expect, it } from "vitest";
import { composeBook, structureSignature, type BookBlock } from "../bookDoc";
import { layoutPages, type PageItem } from "../screenplay/editor/pages";

const block = (id: string, extra: Partial<BookBlock> = {}): BookBlock => ({ id, chapter: null, page: null, newPage: false, breakBefore: false, ...extra });

describe("composeBook", () => {
  it("un repère par scène, suivi du texte ou d'un paragraphe vide", () => {
    const html = composeBook([block("a"), block("b", { breakBefore: true })], { a: "<p>Un</p>" });
    expect(html.match(/data-scene-mark/g)).toHaveLength(2);
    expect(html).toContain('data-scene="a"></div><p>Un</p>');
    expect(html).toContain('data-break="1"></div><p></p>');
  });

  it("échappe les titres de chapitre", () => {
    const html = composeBook([block("a", { chapter: { id: "c", n: 1, title: 'Le "Loup" <b>' } })], {});
    expect(html).toContain("&quot;Loup&quot;");
    expect(html).not.toContain("<b>");
  });
});

describe("structureSignature", () => {
  it("change avec la structure, pas avec le titre d'un chapitre", () => {
    const a = [block("a", { chapter: { id: "c", n: 1, title: "X" } })];
    const b = [block("a", { chapter: { id: "c", n: 1, title: "Y" } })];
    const c = [block("a", { chapter: { id: "c", n: 1, title: "X" }, newPage: true })];
    expect(structureSignature(a)).toBe(structureSignature(b));
    expect(structureSignature(a)).not.toBe(structureSignature(c));
  });
});

describe("layoutPages: saut de page forcé", () => {
  it("un bloc `before` ouvre une nouvelle page même s'il reste de la place", () => {
    const items: PageItem[] = [
      { height: 2, margin: 0, keep: 0 },
      { height: 2, margin: 0, keep: 0, before: true },
      { height: 2, margin: 0, keep: 0 },
    ];
    const r = layoutPages(items, 40);
    expect(r.breaks.map((x) => x.index)).toEqual([1]);
  });
});
