// « Lire le synopsis seul » (#147) : les seuls en-têtes (saisons, épisodes, actes, séquences, chapitres, scènes) et
// leur synopsis, à la suite, pour lire ou imprimer le récit en quelques pages. Rien n'est écrit dans le projet.
// Fonctions pures.

import type { ScreenplayElement } from "./screenplay/model";
import { listScenes, sceneSynopsis } from "./screenplay/scenes";
import { plainSection, seriesMark } from "./screenplay/series";
import { partLabel, structureOf } from "./screenplay/structure";
import { chapterNumbers, chapterOf, type Plan } from "./plan";
import type { Block, ExportDoc } from "./export/doc";

export type SynopsisKind = "season" | "episode" | "act" | "seq" | "sub" | "chapter" | "scene";

export interface SynopsisRow {
  kind: SynopsisKind;
  title: string;
  synopsis: string;
  /** Scène : son numéro dans le récit. */
  number?: number;
  /** Carte de la scène (pour y aller). */
  cardId?: string;
  /** Scénario : rang de l'élément (en-tête ou section). */
  at?: number;
}

/** Scénario : sections de série, actes et séquences, puis chaque scène et son synopsis (lignes « = »). */
export function screenplaySynopsis(elements: ScreenplayElement[], labels: { act: string; seq: string; untitled: string }): SynopsisRow[] {
  const parts = new Map(structureOf(elements).map((p) => [p.at, p]));
  const scenes = new Map(listScenes(elements).map((s) => [s.index, s]));
  const rows: SynopsisRow[] = [];
  elements.forEach((el, i) => {
    if (el.type === "section") {
      const mark = seriesMark(el);
      const part = parts.get(i);
      if (mark) rows.push({ kind: mark.kind, title: plainSection(el.text) || labels.untitled, synopsis: mark.kind === "episode" ? sceneSynopsis(elements, i) : "", at: i });
      else if (part) rows.push({ kind: part.kind, title: partLabel(part, labels), synopsis: "", at: i });
      return;
    }
    const scene = scenes.get(i);
    if (!scene) return;
    rows.push({ kind: "scene", title: scene.text.trim() || labels.untitled, synopsis: sceneSynopsis(elements, i).replace(/\s*\[\[[^\]]*\]\]/g, ""), number: scene.number, ...(scene.cardId ? { cardId: scene.cardId } : {}), at: i });
  });
  return rows;
}

/** Roman : chapitres et scènes du récit dans l'ordre du Plan, avec le synopsis de leur fiche. */
export function novelSynopsis(
  order: string[],
  plan: Plan,
  cards: Map<string, { title: string; synopsis: string }>,
  labels: { chapter: (n: number, title: string) => string; untitled: string },
): SynopsisRow[] {
  const numbers = chapterNumbers(plan, order);
  const rows: SynopsisRow[] = [];
  let chapter: string | null = null;
  order.forEach((id, k) => {
    const c = chapterOf(plan, id);
    if (c && c.id !== chapter) rows.push({ kind: "chapter", title: labels.chapter(numbers.get(c.id) ?? 0, c.title.trim()), synopsis: "" });
    chapter = c?.id ?? null;
    const card = cards.get(id);
    rows.push({ kind: "scene", title: card?.title.trim() || labels.untitled, synopsis: card?.synopsis.trim() ?? "", number: k + 1, cardId: id });
  });
  return rows;
}

/** Document d'export (PDF, Word, Markdown) : un intertitre par partie, chaque scène en gras suivie de son synopsis. */
export function synopsisDoc(rows: SynopsisRow[], meta: { title: string; author: string; lang: string; heading: string; empty: string }): ExportDoc {
  const blocks: Block[] = [];
  for (const r of rows) {
    if (r.kind !== "scene") {
      blocks.push({ kind: "heading", runs: [{ text: r.title }] });
      if (r.synopsis) blocks.push({ kind: "paragraph", runs: [{ text: r.synopsis, italic: true }] });
      continue;
    }
    blocks.push({ kind: "paragraph", runs: [{ text: `${r.number}. ${r.title}`, bold: true }] });
    blocks.push({ kind: "paragraph", runs: [{ text: r.synopsis || meta.empty, italic: !r.synopsis }] });
  }
  return { title: meta.title, author: meta.author, lang: meta.lang, chapters: [{ title: meta.heading, blocks }] };
}
