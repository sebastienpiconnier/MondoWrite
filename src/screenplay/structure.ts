// Actes et séquences d'un scénario (#140) : des sections Fountain écrites dans le texte, comme les saisons et les
// épisodes. Une section posée par MondoWrite porte sa note (« ## Séquence 3 [[cosmos:seq:<id>]] », « # Acte 1
// [[cosmos:act:<id>]] ») ; une section venue d'ailleurs, sans note, est lue selon sa profondeur sous les sections
// notées qui la contiennent (saison, épisode, case du gabarit) : un cran plus bas, un acte ; deux crans ou plus,
// une séquence (un fichier qui n'a qu'un seul niveau de sections de l'auteur les lit comme des séquences).
// Une séquence regroupe les scènes jusqu'à la prochaine section de même niveau ou plus haute.
// Ces sections ne comptent jamais dans les pages (paginate.ts ignore toutes les sections) et ne s'impriment
// qu'avec « Sections » de la fenêtre PDF. Fonctions pures ; elles rendent le même objet quand rien ne change.

import type { ScreenplayElement } from "./model";
import { beatOf } from "./template";
import { plainSection, seriesMark } from "./series";

/** Acte, séquence, sous-séquence (lot 17 ter : trois niveaux, comme Acte › Séquence › Scène des logiciels de
 *  scénario, la scène restant l'en-tête INT./EXT.). */
export type StructureKind = "act" | "seq" | "sub";

const MARK_RE = /\s*\[\[cosmos:(act|seq|sub):([A-Za-z0-9_-]+)\]\]/;

/** Acte ou séquence posé par MondoWrite (note), sinon null. */
export function structureMark(el: ScreenplayElement | undefined): { kind: StructureKind; id: string } | null {
  if (el?.type !== "section") return null;
  const m = MARK_RE.exec(el.text);
  return m ? { kind: m[1] as StructureKind, id: m[2] } : null;
}

/** Section qui ordonne le récit sans être un acte ni une séquence : saison, épisode, case d'une structure. Un
 *  acte ou une séquence porte aussi une note de case (#148) : il reste un acte ou une séquence. */
const isFrame = (el: ScreenplayElement) => el.type === "section" && (!!seriesMark(el) || (!!beatOf(el.text) && !MARK_RE.test(el.text)));

export interface StructurePart {
  kind: StructureKind;
  /** Identifiant de la note ; null pour une section sans note (fichier venu d'ailleurs). */
  id: string | null;
  /** Clé stable dans la session : l'identifiant, sinon « @rang ». */
  key: string;
  /** Rang de la section dans le scénario. */
  at: number;
  depth: number;
  /** Titre écrit (sans la note), peut être vide. */
  title: string;
  /** Rang parmi les parties de même sorte sous la même section notée (épisode, case…), à partir de 1. */
  number: number;
  /** Premier élément après la partie. */
  end: number;
  /** Acte qui contient la séquence (ou la sous-séquence). */
  act?: string;
  /** Séquence qui contient la sous-séquence. */
  seq?: string;
  /** Scènes de la partie : rang de l'en-tête et carte. */
  scenes: { index: number; cardId?: string }[];
}

/** Toutes les sections du texte, rangées : « frame » (saison, épisode, case), « author » (sans note), act, seq. */
function classify(elements: ScreenplayElement[]) {
  // Un seul niveau de sections de l'auteur dans tout le texte : ce sont des séquences.
  const authorRel = new Set<number>();
  const rel = new Map<number, number>();
  const stack: { depth: number; frame: boolean }[] = [];
  elements.forEach((el, i) => {
    if (el.type !== "section") return;
    const depth = el.depth ?? 1;
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const frame = isFrame(el);
    if (!frame && !structureMark(el)) {
      const base = Math.max(0, ...stack.filter((s) => s.frame).map((s) => s.depth));
      const r = depth - base;
      rel.set(i, r);
      authorRel.add(r);
    }
    stack.push({ depth, frame });
  });
  const kinds = new Map<number, StructureKind>();
  // Un niveau : des séquences ; deux : actes et séquences ; trois et plus : sous-séquences en dessous.
  const levels = [...authorRel].sort((a, b) => a - b);
  for (const [i, r] of rel) {
    const rank = levels.indexOf(r);
    kinds.set(i, levels.length === 1 ? "seq" : rank === 0 ? "act" : rank === 1 ? "seq" : "sub");
  }
  return kinds;
}

/** Actes et séquences du texte, dans l'ordre. */
export function structureOf(elements: ScreenplayElement[]): StructurePart[] {
  const guessed = classify(elements);
  const parts: StructurePart[] = [];
  // Parties ouvertes, de la plus haute à la plus basse, et section notée qui les contient (pour les numéros).
  const open: { part: StructurePart | null; depth: number }[] = [];
  const counters = new Map<string, number>();
  let scope = "";
  elements.forEach((el, i) => {
    if (el.type === "sceneHeading") {
      if (el.omitted !== undefined) return;
      for (const o of open) o.part?.scenes.push({ index: i, ...(el.cardId ? { cardId: el.cardId } : {}) });
      return;
    }
    if (el.type !== "section") return;
    const depth = el.depth ?? 1;
    while (open.length > 0 && open[open.length - 1].depth >= depth) {
      const o = open.pop()!;
      if (o.part) o.part.end = i;
    }
    const mark = structureMark(el);
    const kind = mark?.kind ?? guessed.get(i);
    if (!kind) {
      // Saison ou épisode : les numéros repartent de 1 en dessous (pas une case : ils courent dans tout
      // l'épisode, #148).
      if (seriesMark(el)) scope = `${i}`;
      open.push({ part: null, depth });
      return;
    }
    const counter = `${scope}:${kind}`;
    const number = (counters.get(counter) ?? 0) + 1;
    counters.set(counter, number);
    const act = kind !== "act" ? [...open].reverse().find((o) => o.part?.kind === "act")?.part?.key : undefined;
    const seq = kind === "sub" ? [...open].reverse().find((o) => o.part?.kind === "seq")?.part?.key : undefined;
    const part: StructurePart = {
      kind,
      id: mark?.id ?? null,
      key: mark?.id ?? `@${i}`,
      at: i,
      depth,
      title: plainSection(el.text),
      number,
      end: elements.length,
      ...(act ? { act } : {}),
      ...(seq ? { seq } : {}),
      scenes: [],
    };
    parts.push(part);
    open.push({ part, depth });
  });
  return parts;
}

/** Titre à afficher : celui de l'auteur, sinon « Séquence 3 ». */
export const partLabel = (part: Pick<StructurePart, "kind" | "title" | "number">, labels: { act: string; seq: string; sub?: string }): string =>
  part.title || `${part.kind === "act" ? labels.act : part.kind === "sub" ? (labels.sub ?? labels.seq) : labels.seq} ${part.number}`;

/**
 * Profondeur d'un acte ou d'une séquence posé au rang `at` : un cran sous les sections notées qui le contiennent
 * (épisode, case) pour un acte ; sous l'acte ouvert, sinon deux crans, pour une séquence.
 */
export function structureDepth(elements: ScreenplayElement[], at: number, kind: StructureKind): number {
  const stack: { depth: number; frame: boolean; beat: boolean; act: boolean; seq: boolean }[] = [];
  const guessed = classify(elements);
  elements.slice(0, at).forEach((el, i) => {
    if (el.type !== "section") return;
    const depth = el.depth ?? 1;
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const k = structureMark(el)?.kind ?? guessed.get(i);
    stack.push({ depth, frame: isFrame(el), beat: isFrame(el) && !seriesMark(el), act: k === "act", seq: k === "seq" });
  });
  const base = Math.max(0, ...stack.filter((s) => s.frame).map((s) => s.depth));
  // Dans une case d'une structure (#148) : une sous-case, un cran sous elle.
  if (kind === "sub") {
    // Sous la séquence ouverte ; sans elle, sous l'acte (deux crans), sinon trois crans.
    const seq = [...stack].reverse().find((s) => s.seq);
    if (seq) return seq.depth + 1;
    const act = [...stack].reverse().find((s) => s.act);
    return act ? act.depth + 2 : base + 3;
  }
  const innermost = [...stack].reverse().find((s) => s.frame || s.act);
  if (innermost?.frame && innermost.beat) return base + 1;
  if (kind === "act") return base + 1;
  const act = [...stack].reverse().find((s) => s.act);
  return act ? act.depth + 1 : base + 2;
}

/** Rang où poser un acte ou une séquence quand le curseur est au rang `cursor` : avant l'en-tête de sa scène. */
export function insertionPoint(elements: ScreenplayElement[], cursor: number): number {
  for (let i = Math.min(cursor, elements.length - 1); i >= 0; i--) {
    const el = elements[i];
    if (el.type === "sceneHeading") return i;
    if (el.type === "section") return i + 1;
  }
  return Math.max(0, Math.min(cursor, elements.length));
}

/** Section d'un acte ou d'une séquence, avec ses notes (case de l'auteur `caseKey`, #148) et sa profondeur. */
export function structureSection(elements: ScreenplayElement[], at: number, kind: StructureKind, id: string, title: string, caseKey?: string): ScreenplayElement {
  const beat = caseKey ? ` [[cosmos:beat:${caseKey}]]` : "";
  return { type: "section", depth: structureDepth(elements, at, kind), text: `${title.trim()}${beat} [[cosmos:${kind}:${id}]]`.trim() };
}

/** Nombre de parties de cette sorte sous la même section notée que le rang `at`, plus une : numéro de la nouvelle. */
export function nextNumber(elements: ScreenplayElement[], at: number, kind: StructureKind): number {
  const parts = structureOf(elements).filter((p) => p.kind === kind && p.at < at);
  // Même épisode (#148 : les numéros courent à travers les cases) : la dernière saison ou épisode avant `at`.
  let scope = -1;
  elements.slice(0, at).forEach((el, i) => {
    if (seriesMark(el)) scope = i;
  });
  return parts.filter((p) => p.at > scope).length + 1;
}

/** Ajoute un acte ou une séquence au rang `at`. */
export function insertStructure(elements: ScreenplayElement[], at: number, kind: StructureKind, id: string, title: string, caseKey?: string): ScreenplayElement[] {
  const pos = Math.max(0, Math.min(at, elements.length));
  return [...elements.slice(0, pos), structureSection(elements, pos, kind, id, title, caseKey), ...elements.slice(pos)];
}

/** Renomme la section au rang `at` en gardant ses notes. Même tableau si rien ne change. */
export function renameStructure(elements: ScreenplayElement[], at: number, title: string): ScreenplayElement[] {
  const el = elements[at];
  if (el?.type !== "section") return elements;
  const notes = el.text.match(/\[\[cosmos:[^\]]*\]\]/g) ?? [];
  const text = [title.replace(/\s+/g, " ").trim(), ...notes].join(" ").trim();
  if (text === el.text) return elements;
  const next = elements.slice();
  next[at] = { ...el, text };
  return next;
}

/** Séquence (sinon acte) qui contient la scène dont l'en-tête est au rang `heading`. */
export function partOfScene(parts: StructurePart[], heading: number, kind?: StructureKind): StructurePart | undefined {
  const holding = parts.filter((p) => p.scenes.some((s) => s.index === heading) && (!kind || p.kind === kind));
  return holding.find((p) => p.kind === "sub") ?? holding.find((p) => p.kind === "seq") ?? holding[0];
}

/**
 * Séquences lues comme des chapitres, le temps de ranger le canevas (« Organiser » : un cadre par séquence) :
 * jamais écrites dans cosmos.json. Sans séquence, les actes en tiennent lieu.
 */
export function partChapters(
  elements: ScreenplayElement[],
  labels: { act: string; seq: string },
): { id: string; title: string; scenes: string[]; act?: { id: string; title: string } }[] {
  // Un acte ou une séquence qui est aussi une case (#148) a déjà son cadre de case : seules les sections de
  // l'auteur sans note passent ici.
  const parts = structureOf(elements).filter((p) => !beatOf(elements[p.at]?.type === "section" ? (elements[p.at] as { text: string }).text : ""));
  const seqs = parts.filter((p) => p.kind === "seq");
  const acts = new Map(parts.filter((p) => p.kind === "act").map((p) => [p.key, p]));
  const cards = (p: StructurePart) => p.scenes.flatMap((s) => (s.cardId ? [s.cardId] : []));
  if (seqs.length === 0) return parts.map((p) => ({ id: `part:${p.key}`, title: partLabel(p, labels), scenes: cards(p) })).filter((c) => c.scenes.length > 0);
  // Une séquence garde son acte : « Organiser » met les cadres des séquences dans celui de l'acte.
  const out: { id: string; title: string; scenes: string[]; act?: { id: string; title: string } }[] = [];
  for (const p of seqs) {
    const act = p.act ? acts.get(p.act) : undefined;
    const scenes = cards(p);
    if (scenes.length > 0) out.push({ id: `part:${p.key}`, title: partLabel(p, labels), scenes, ...(act ? { act: { id: act.key, title: partLabel(act, labels) } } : {}) });
  }
  return out;
}

/** Nombre d'actes, de séquences et de sous-séquences. */
export type StructureCount = Record<StructureKind, number>;

/**
 * Actes, séquences et sous-séquences qu'une structure choisie retirerait (#154) : ceux qui sont aussi une case de
 * « Ma structure » (note de case, #148). Une section de l'auteur sans note de case reste, elle ne compte pas.
 */
export function replacedParts(elements: ScreenplayElement[]): StructureCount {
  const count: StructureCount = { act: 0, seq: 0, sub: 0 };
  for (const p of structureOf(elements)) {
    const el = elements[p.at];
    if (el?.type === "section" && beatOf(el.text)) count[p.kind]++;
  }
  return count;
}

export const countTotal = (c: StructureCount): number => c.act + c.seq + c.sub;

/**
 * Sections de l'auteur sans aucune note (#155 : fichier venu d'ailleurs, Causality, Highland…), lues par leur
 * profondeur : rang et sorte devinée. Saisons, épisodes, cases et sections déjà notées n'y sont pas.
 */
export function unmarkedSections(elements: ScreenplayElement[]): { at: number; kind: StructureKind }[] {
  return structureOf(elements).flatMap((p) => {
    const el = elements[p.at];
    return p.id === null && el?.type === "section" && !/\[\[cosmos:/.test(el.text) ? [{ at: p.at, kind: p.kind }] : [];
  });
}

/**
 * Transforme la section de l'auteur au rang `at` en acte, séquence ou sous-séquence (#155) : son titre et sa
 * profondeur restent, elle reçoit la note de sa sorte (et la note de case `caseKey`, #148). Une section déjà
 * notée acte, séquence ou sous-séquence change de sorte (la note est remplacée, l'identifiant gardé). Même
 * tableau si ce n'est pas une section de l'auteur, ou si rien ne change.
 */
export function convertSection(elements: ScreenplayElement[], at: number, kind: StructureKind, id: string, caseKey?: string): ScreenplayElement[] {
  const el = elements[at];
  if (el?.type !== "section" || seriesMark(el)) return elements;
  const mark = structureMark(el);
  // Une case d'une structure livrée (note de case sans acte ni séquence) n'est pas une section de l'auteur.
  if (!mark && beatOf(el.text)) return elements;
  if (mark?.kind === kind) return elements;
  const title = plainSection(el.text);
  const beat = beatOf(el.text) ?? caseKey;
  const text = [title, beat ? `[[cosmos:beat:${beat}]]` : "", `[[cosmos:${kind}:${mark?.id ?? id}]]`].filter(Boolean).join(" ");
  const next = elements.slice();
  next[at] = { ...el, text };
  return next;
}

/**
 * Lit d'un coup toutes les sections de l'auteur sans note comme actes, séquences et sous-séquences selon leur
 * profondeur (#155 : « les lire comme actes et séquences ? »). `ids` fournit un identifiant par section,
 * `caseKeys` une clé de case de l'auteur (#148), dans l'ordre. Même tableau s'il n'y en a aucune.
 */
export function adoptUnmarkedSections(elements: ScreenplayElement[], ids: () => string, caseKeys: () => string | undefined): ScreenplayElement[] {
  const found = unmarkedSections(elements);
  if (found.length === 0) return elements;
  let next = elements;
  for (const { at, kind } of found) next = convertSection(next, at, kind, ids(), caseKeys());
  return next;
}

/**
 * Ce qui contient la scène de la carte `cardId` (#153) : clés des actes, séquences et sous-séquences (celles du
 * pli, `StructurePart.key`) et identifiants de la saison et de l'épisode. Vide si la scène n'est pas dans le texte.
 */
export function holdersOf(elements: ScreenplayElement[], cardId: string): { parts: string[]; series: string[] } {
  const heading = elements.findIndex((el) => el.type === "sceneHeading" && el.cardId === cardId);
  if (heading === -1) return { parts: [], series: [] };
  const parts = structureOf(elements)
    .filter((p) => p.at < heading && heading < p.end)
    .map((p) => p.key);
  let season: string | null = null;
  let episode: string | null = null;
  for (let i = 0; i < heading; i++) {
    const m = seriesMark(elements[i]);
    if (m?.kind === "season") {
      season = m.id;
      episode = null;
    } else if (m?.kind === "episode") episode = m.id;
  }
  return { parts, series: [season, episode].filter((x): x is string => !!x) };
}

/** Libellés d'un décompte (« 1 acte », « {n} actes »…), lus dans `t.plan`. */
export interface CountLabels {
  partsAct: string;
  partsActs: string;
  partsSeq: string;
  partsSeqs: string;
  partsSub: string;
  partsSubs: string;
}

/** « 2 actes, 6 séquences et 1 sous-séquence » dans la langue `lang` ; null quand il n'y a rien. */
export function describeCount(c: StructureCount, labels: CountLabels, lang: string): string | null {
  const one = (n: number, single: string, many: string) => (n === 1 ? single : many.replace("{n}", String(n)));
  const items = [
    c.act ? one(c.act, labels.partsAct, labels.partsActs) : "",
    c.seq ? one(c.seq, labels.partsSeq, labels.partsSeqs) : "",
    c.sub ? one(c.sub, labels.partsSub, labels.partsSubs) : "",
  ].filter(Boolean);
  if (items.length === 0) return null;
  try {
    return new Intl.ListFormat(lang, { type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}
