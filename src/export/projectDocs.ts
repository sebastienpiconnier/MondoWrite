// Documents du projet ouvert (manuscrit, bible, canevas), prêts pour un export ou pour les copies Markdown du
// dossier projet. Une seule façon de les fabriquer : le menu Exporter et les copies lisent la même chose.

import { fmt, type Messages } from "../i18n";
import type { ProjectKind, CardType } from "../types";
import { CARD_TYPES } from "../types";
import { vocab } from "../vocab";
import { chapterNumbers, chapterOf, type Plan } from "../plan";
import { bookOrder, isPageKind } from "../book";
import { bibleDoc, manuscriptDoc, type ExportDoc } from "./doc";
import { canvasDoc } from "./canvas";
import { boxes, frameBox, type CardNode, type FrameNode } from "../projectState";
import type { Manuscript } from "../manuscript";
import type { Pitch } from "../pitch";
import type { Edge } from "@xyflow/react";

/** Ce que les documents lisent du projet ouvert (un extrait de l'état du store). */
export interface ProjectDocSource {
  title: string;
  kind: ProjectKind;
  nodes: CardNode[];
  frames: FrameNode[];
  edges: Edge[];
  plan: Plan;
  manuscript: Manuscript;
  pitch: Pitch;
}

export interface DocContext {
  t: Messages;
  lang: string;
  author: string;
}

const info = (s: ProjectDocSource, ctx: DocContext) => ({ title: s.title.trim() || ctx.t.home.untitled, author: ctx.author.trim(), lang: ctx.lang });
const linksOf = (s: ProjectDocSource) => s.edges.map((e) => ({ source: e.source, target: e.target, label: String(e.label ?? "") }));
const typeLabels = (t: Messages, kind: ProjectKind, key: "section" | "label") => {
  const types = vocab(t, kind).types;
  return Object.fromEntries(CARD_TYPES.map((type) => [type, types[type][key]])) as Record<CardType, string>;
};

/** Manuscrit d'un roman, dans l'ordre du livre ; `contact` : coordonnées sur la page de garde. */
export function manuscriptOf(s: ProjectDocSource, ctx: DocContext, contact: string[] = []): ExportDoc {
  const { t } = ctx;
  const cards = s.nodes.map((n) => n.data);
  const order = bookOrder(s.nodes, s.plan);
  const numbers = chapterNumbers(s.plan, order);
  return manuscriptDoc({ ...info(s, ctx), ...(contact.length > 0 ? { contact } : {}) }, order, cards, s.manuscript, t.manuscript.untitled, (id) => {
    // Page du livre (dédicace, prologue…) : un chapitre à elle seule, sous son nom.
    const page = cards.find((c) => c.id === id)?.page;
    if (isPageKind(page)) return { id: `page:${id}`, title: t.book.kinds[page] };
    const chapter = chapterOf(s.plan, id);
    if (!chapter) return null;
    const n = numbers.get(chapter.id) ?? 0;
    return { id: chapter.id, title: chapter.title.trim() ? fmt(t.chapters.numberedTitle, { n, title: chapter.title.trim() }) : fmt(t.chapters.numbered, { n }) };
  });
}

/** Bible : couverture puis les rubriques données, dans leur ordre. */
export function bibleOf(s: ProjectDocSource, ctx: DocContext, sections: CardType[]): ExportDoc {
  const { t } = ctx;
  const base = info(s, ctx);
  return bibleDoc(
    { ...base, title: fmt(t.exports.bibleName, { title: base.title }) },
    s.nodes.map((n) => n.data),
    linksOf(s),
    {
      sections: typeLabels(t, s.kind, "section"),
      untitled: t.bible.untitled,
      linkedTo: t.bible.linkedTo,
      fields: { ...t.character.fields, ...t.fiche.fields },
      arcTypes: { ...t.character.arcTypes, ...t.sceneStatus.values },
      cover: { title: t.pitch.toc, fields: t.pitch.fields },
    },
    s.pitch,
    sections,
  );
}

/** Texte du canevas : une partie par cadre, les cartes dans l'ordre de lecture. */
export function canvasOf(s: ProjectDocSource, ctx: DocContext): ExportDoc {
  const { t } = ctx;
  const base = info(s, ctx);
  const cardBoxes = boxes(s.nodes);
  return canvasDoc(
    { ...base, title: fmt(t.exports.canvasName, { title: base.title }) },
    s.nodes.map((n, i) => ({ card: n.data, box: cardBoxes[i] })),
    s.frames.map((f) => ({ id: f.id, title: f.data.title, box: frameBox(f) })),
    linksOf(s),
    {
      types: typeLabels(t, s.kind, "label"),
      untitled: t.bible.untitled,
      loose: t.exports.canvasLoose,
      untitledFrame: t.exports.untitledFrame,
      linkedTo: t.bible.linkedTo,
      fields: { ...t.character.fields, ...t.fiche.fields },
      arcTypes: { ...t.character.arcTypes, ...t.sceneStatus.values },
    },
  );
}
