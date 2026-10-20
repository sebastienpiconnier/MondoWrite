// Chutier : un passage retiré du manuscrit sans être perdu (idée reprise de NEO, « Darlings »).
// On garde le passage tel quel (tranche ProseMirror, mise en forme comprise) et de quoi le remettre à sa place :
// la scène d'où il vient, le texte qui l'entourait et sa position. Fonctions pures, sur l'état de l'éditeur du livre.

import { Slice } from "@tiptap/pm/model";
import { Selection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { sceneAt, sceneGroups, type SceneGroup } from "./bookDoc";

export interface Passage {
  id: string;
  /** Scène d'où il vient (identifiant de sa carte). */
  scene: string;
  /** Le passage lui-même : tranche ProseMirror en JSON (garde l'italique, les paragraphes…). */
  slice: unknown;
  /** Son texte brut : aperçu dans le volet. */
  text: string;
  /** Texte de la scène juste avant et juste après l'endroit retiré (pour le retrouver si la scène a bougé). */
  before: string;
  after: string;
  /** Position dans le texte de la scène, en caractères. */
  offset: number;
  /** Date ISO du retrait. */
  date: string;
}

/** Nombre de caractères gardés de chaque côté. */
export const CONTEXT = 60;
const SEP = "\n";
const LEAF = "￼";

const start = (doc: PMNode, g: SceneGroup) => g.markerPos + (doc.nodeAt(g.markerPos)?.nodeSize ?? 1);
const textIn = (doc: PMNode, from: number, to: number) => doc.textBetween(from, to, SEP, LEAF);

/** Où commencent et finissent les scènes du document (par défaut celles du livre ; le scénario fournit les siennes). */
export type GroupsOf = (doc: PMNode) => SceneGroup[];

export type Taken = { tr: Transaction; passage: Passage } | { error: "empty" | "scene" };

/** Retire la sélection du texte et la met de côté. Une sélection vide, ou à cheval sur deux scènes, est refusée. */
export function takePassage(state: EditorState, id: string, date: string, groupsOf: GroupsOf = sceneGroups): Taken {
  const { from, to } = state.selection;
  if (from === to) return { error: "empty" };
  const groups = groupsOf(state.doc);
  const g = sceneAt(groups, from);
  if (!g || g !== sceneAt(groups, to - 1) || from < start(state.doc, g)) return { error: "scene" };
  const text = textIn(state.doc, from, to);
  if (text.trim() === "") return { error: "empty" };
  const slice = state.doc.slice(from, to).toJSON();
  const tr = state.tr.delete(from, to);
  // Le contexte se lit dans le texte d'après : c'est dans celui-ci qu'on cherchera l'endroit au retour.
  const after = groupsOf(tr.doc).find((x) => x.id === g.id);
  if (!after) return { error: "scene" };
  const s = start(tr.doc, after);
  const whole = textIn(tr.doc, s, after.end);
  const offset = textIn(tr.doc, s, Math.min(from, after.end)).length;
  return {
    tr,
    passage: {
      id,
      scene: g.id,
      slice,
      text: text.replace(/\s+/g, " ").trim(),
      before: whole.slice(Math.max(0, offset - CONTEXT), offset),
      after: whole.slice(offset, offset + CONTEXT),
      offset,
      date,
    },
  };
}

/** Occurrence de `needle` dans `text` la plus proche de `target`, ou -1. */
function nearest(text: string, needle: string, target: number): number {
  let best = -1;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
    if (best < 0 || Math.abs(i - target) < Math.abs(best - target)) best = i;
  }
  return best;
}

/** Position du document où le texte de la scène atteint `offset` caractères. */
function positionAt(doc: PMNode, g: SceneGroup, offset: number): number {
  const s = start(doc, g);
  let lo = s;
  let hi = g.end;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (textIn(doc, s, mid).length >= offset) hi = mid;
    else lo = mid + 1;
  }
  // Une position entre deux blocs ne reçoit pas de texte : on prend la plus proche dans un paragraphe.
  return Selection.near(doc.resolve(lo), 1).from;
}

/** Où le passage retourne : « exact » si le texte autour est resté tel quel, sinon l'endroit le plus proche. */
export type Placed = { tr: Transaction; from: number; to: number; where: "exact" | "near" | "elsewhere" };

/**
 * Remet un passage dans le texte. Si sa scène n'existe plus, il va à la fin de `fallback` (la scène en cours),
 * et rend null si même celle-ci manque.
 */
export function placePassage(state: EditorState, p: Passage, fallback: string | null, groupsOf: GroupsOf = sceneGroups): Placed | null {
  const { doc } = state;
  const groups = groupsOf(doc);
  let g = groups.find((x) => x.id === p.scene);
  let where: Placed["where"] = "exact";
  let offset = 0;
  if (!g) {
    g = groups.find((x) => x.id === fallback);
    if (!g) return null;
    where = "elsewhere";
    offset = textIn(doc, start(doc, g), g.end).length;
  } else {
    const s = start(doc, g);
    const whole = textIn(doc, s, g.end);
    const both = p.before + p.after;
    const hit = both ? nearest(whole, both, p.offset - p.before.length) : whole === "" ? 0 : -1;
    if (hit >= 0) offset = hit + p.before.length;
    else {
      where = "near";
      const b = p.before ? nearest(whole, p.before, p.offset - p.before.length) : -1;
      const a = p.after ? nearest(whole, p.after, p.offset) : -1;
      offset = b >= 0 ? b + p.before.length : a >= 0 ? a : Math.min(p.offset, whole.length);
    }
  }
  const at = positionAt(doc, g, offset);
  const tr = state.tr.replace(at, at, Slice.fromJSON(state.schema, p.slice));
  return { tr, from: at, to: tr.mapping.map(at, 1), where };
}

const validSlice = (v: unknown): boolean => !!v && typeof v === "object" && Array.isArray((v as { content?: unknown }).content);

/** Lit le chutier d'un cosmos.json : ce qui n'a pas la bonne forme est écarté. */
export function readChutier(raw: unknown): Passage[] {
  if (!Array.isArray(raw)) return [];
  const out: Passage[] = [];
  for (const r of raw) {
    const p = r as Partial<Record<keyof Passage, unknown>> | null;
    if (!p || typeof p.id !== "string" || typeof p.scene !== "string" || !validSlice(p.slice)) continue;
    out.push({
      id: p.id,
      scene: p.scene,
      slice: p.slice,
      text: typeof p.text === "string" ? p.text : "",
      before: typeof p.before === "string" ? p.before : "",
      after: typeof p.after === "string" ? p.after : "",
      offset: typeof p.offset === "number" && Number.isFinite(p.offset) ? p.offset : 0,
      date: typeof p.date === "string" ? p.date : "",
    });
  }
  return out;
}
