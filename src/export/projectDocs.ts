// Documents du projet ouvert (manuscrit, bible, canevas), prêts pour un export ou pour les copies Markdown du
// dossier projet. Une seule façon de les fabriquer : le menu Exporter et les copies lisent la même chose.

import { fmt, type Messages } from "../i18n";
import type { ProjectKind, CardType } from "../types";
import { CARD_TYPES } from "../types";
import { vocab } from "../vocab";
import { chapterNumbers, chapterOf, type Plan } from "../plan";
import { bookOrder, isPageKind } from "../book";
import { SCENE_BREAK, bibleDoc, htmlToBlocks, manuscriptDoc, type ExportDoc } from "./doc";
import type { BookDoc, BookSection } from "./paperback";
import { countWords, isBlank } from "../manuscript";
import { roundWords } from "./prose";
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

/**
 * PDF du manuscrit au format Shunn : « Nom / TITRE » en tête de page, nombre de mots arrondi, « par Untel ».
 * `signed` : nom signé du profil (sinon l'auteur du document). Partagé par le menu Exporter et l'extrait
 * joint à la Bible d'un roman.
 */
export function withShunn(doc: ExportDoc, manuscript: Manuscript, t: Messages, lang: string, signed: string): ExportDoc {
  const words = Object.values(manuscript).reduce((n, html) => n + countWords(html), 0);
  const surname = (signed || doc.author).split(/\s+/).filter(Boolean).pop() ?? "";
  return {
    ...doc,
    shunn: {
      running: [surname, doc.title.toLocaleUpperCase(lang)].filter(Boolean).join(" / "),
      words: fmt(t.exports.aboutWords, { n: new Intl.NumberFormat(lang).format(roundWords(words)) }),
      byline: doc.author ? fmt(t.exports.byline, { author: doc.author }) : "",
    },
  };
}

/**
 * Le livre à imprimer (livre broché) : pages du livre à leur place, chapitres avec leur numéro et leur
 * titre sur deux lignes, scènes d'un même chapitre séparées par « * * * ». Une scène sans texte n'y est pas.
 */
export function bookOf(s: ProjectDocSource, ctx: DocContext, year: number): BookDoc {
  const { t } = ctx;
  const cards = s.nodes.map((n) => n.data);
  const order = bookOrder(s.nodes, s.plan);
  const numbers = chapterNumbers(s.plan, order);
  const sections: (BookSection & { key?: string })[] = [];
  for (const id of order.filter((x) => !isBlank(s.manuscript[x]))) {
    const card = cards.find((c) => c.id === id);
    const blocks = htmlToBlocks(s.manuscript[id]);
    if (isPageKind(card?.page)) {
      sections.push({ kind: "page", page: card.page, title: t.book.kinds[card.page], blocks });
      continue;
    }
    const chapter = chapterOf(s.plan, id);
    const last = sections[sections.length - 1];
    if (chapter && last?.key === chapter.id) {
      last.blocks.push({ kind: "paragraph", runs: [{ text: SCENE_BREAK }] }, ...blocks);
    } else if (chapter) {
      const n = numbers.get(chapter.id) ?? 0;
      const title = chapter.title.trim();
      sections.push({ key: chapter.id, kind: "chapter", label: fmt(t.chapters.numbered, { n }), title, toc: title ? fmt(t.chapters.numberedTitle, { n, title }) : fmt(t.chapters.numbered, { n }), blocks });
    } else {
      const title = card?.title.trim() || t.manuscript.untitled;
      sections.push({ kind: "chapter", label: "", title, toc: title, blocks });
    }
  }
  return { ...info(s, ctx), year, sections: sections.map(({ key: _key, ...rest }) => rest as BookSection) };
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
