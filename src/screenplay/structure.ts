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

export type StructureKind = "act" | "seq";

const MARK_RE = /\s*\[\[cosmos:(act|seq):([A-Za-z0-9_-]+)\]\]/;

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
  /** Acte qui contient la séquence. */
  act?: string;
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
  const twoLevels = authorRel.size > 1;
  for (const [i, r] of rel) kinds.set(i, twoLevels && r <= 1 ? "act" : "seq");
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
    const act = kind === "seq" ? [...open].reverse().find((o) => o.part?.kind === "act")?.part?.key : undefined;
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
      scenes: [],
    };
    parts.push(part);
    open.push({ part, depth });
  });
  return parts;
}

/** Titre à afficher : celui de l'auteur, sinon « Séquence 3 ». */
export const partLabel = (part: Pick<StructurePart, "kind" | "title" | "number">, labels: { act: string; seq: string }): string =>
  part.title || `${part.kind === "act" ? labels.act : labels.seq} ${part.number}`;

/**
 * Profondeur d'un acte ou d'une séquence posé au rang `at` : un cran sous les sections notées qui le contiennent
 * (épisode, case) pour un acte ; sous l'acte ouvert, sinon deux crans, pour une séquence.
 */
export function structureDepth(elements: ScreenplayElement[], at: number, kind: StructureKind): number {
  const stack: { depth: number; frame: boolean; beat: boolean; act: boolean }[] = [];
  const guessed = classify(elements);
  elements.slice(0, at).forEach((el, i) => {
    if (el.type !== "section") return;
    const depth = el.depth ?? 1;
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    stack.push({ depth, frame: isFrame(el), beat: isFrame(el) && !seriesMark(el), act: (structureMark(el)?.kind ?? guessed.get(i)) === "act" });
  });
  const base = Math.max(0, ...stack.filter((s) => s.frame).map((s) => s.depth));
  // Dans une case d'une structure (#148) : une sous-case, un cran sous elle.
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
  return holding.find((p) => p.kind === "seq") ?? holding[0];
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
