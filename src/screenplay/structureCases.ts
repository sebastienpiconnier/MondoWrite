// Actes et séquences = cases de la structure de l'auteur (#148). Une section d'acte ou de séquence porte aussi la
// note d'une case de l'auteur (« ## Séquence 3 [[cosmos:beat:u7]] [[cosmos:seq:<id>]] ») : tout ce qui lit les
// cases (canevas, ruban, séquencier, « Ranger dans ») la voit comme une case, et ce qui lit les actes et séquences
// (liste des scènes, place d'une scène) la voit toujours comme telle. Un acte est une case de niveau 1, une
// séquence une sous-case. Une structure livrée (Save the Cat…) qui reçoit un acte ou une séquence devient celle de
// l'auteur, « d'après » elle : ses cases prennent des clés de l'auteur, leurs scènes restent dessous.
// Fonctions pures ; même tableau rendu quand rien ne change.

import type { ScreenplayElement } from "./model";
import { beatOf } from "./template";
import { seriesMark } from "./series";
import { isCustomBeat, nextCustomKey, type ScriptBeats } from "../plan";

const STRUCTURE_NOTE_RE = /\[\[cosmos:(act|seq|sub):[A-Za-z0-9_-]+\]\]/;
const BEAT_NOTE_RE = /\s*\[\[cosmos:beat:[A-Za-z0-9_]+\]\]/;

/** Acte ou séquence (note) de cette section, sinon null. */
const partKindOf = (el: ScreenplayElement | undefined): "act" | "seq" | "sub" | null => {
  if (el?.type !== "section") return null;
  const m = STRUCTURE_NOTE_RE.exec(el.text);
  return m ? (m[1] as "act" | "seq" | "sub") : null;
};

/** Clés de case de l'auteur déjà prises : dans le texte et dans `plan.scriptBeats`. */
export function usedCaseKeys(elements: readonly ScreenplayElement[], scriptBeats?: ScriptBeats): string[] {
  const keys = new Set<string>(Object.keys(scriptBeats ?? {}));
  for (const el of elements) {
    const key = el.type === "section" ? beatOf(el.text) : null;
    if (key && isCustomBeat(key)) keys.add(key);
  }
  return [...keys];
}

/** Texte d'une section avec la note de case `key` (remplace celle qui y était), les autres notes gardées. */
export function withCaseNote(text: string, key: string): string {
  const rest = text.replace(BEAT_NOTE_RE, "");
  const note = `[[cosmos:beat:${key}]]`;
  // La note de case juste après le titre, avant celle de l'acte ou de la séquence.
  const m = /\s*\[\[cosmos:/.exec(rest);
  return m ? `${rest.slice(0, m.index).trim()} ${note} ${rest.slice(m.index).trim()}`.trim() : `${rest.trim()} ${note}`.trim();
}

/** Bornes [début, fin) de l'épisode qui contient le rang `at`, ou tout le texte hors série. */
export function scopeAt(elements: readonly ScreenplayElement[], at: number): [number, number] {
  let start = 0;
  for (let i = Math.min(at, elements.length) - 1; i >= 0; i--) {
    if (seriesMark(elements[i])) {
      start = i + 1;
      break;
    }
  }
  let end = elements.length;
  for (let i = Math.max(at, start); i < elements.length; i++) {
    if (seriesMark(elements[i])) {
      end = i;
      break;
    }
  }
  return [start, end];
}

/** Clé de la case livrée (pas de l'auteur, pas un acte ni une séquence) que porte cette section, sinon null. */
const builtInKey = (el: ScreenplayElement): string | null => {
  const key = el.type === "section" ? beatOf(el.text) : null;
  return key && !isCustomBeat(key) && !partKindOf(el) ? key : null;
};

export interface CaseChange {
  elements: ScreenplayElement[];
  /** Aide et nom de la structure des cases nouvelles de l'auteur (`plan.scriptBeats`). */
  entries: ScriptBeats;
}

/**
 * Les cases livrées entre `start` et `end` deviennent des cases de l'auteur (même nom, même aide, mêmes scènes),
 * sous le nom « `tplName` ». Rien ne change sans case livrée.
 */
export function customizeRange(
  elements: readonly ScreenplayElement[],
  start: number,
  end: number,
  used: Iterable<string>,
  text: { label: (key: string) => string; hint: (key: string) => string; tplName: string },
): CaseChange {
  const taken = [...used];
  const entries: ScriptBeats = {};
  let next: ScreenplayElement[] | null = null;
  for (let i = start; i < end && i < elements.length; i++) {
    const el = elements[i];
    const old = builtInKey(el);
    if (!old || el.type !== "section") continue;
    const key = nextCustomKey(taken);
    taken.push(key);
    next ??= elements.slice();
    next[i] = { ...el, text: `${text.label(old)} [[cosmos:beat:${key}]]` };
    const hint = text.hint(old).trim();
    entries[key] = { ...(hint ? { hint } : {}), ...(text.tplName ? { tpl: text.tplName } : {}) };
  }
  return { elements: next ?? (elements as ScreenplayElement[]), entries };
}

/**
 * Reprise (#148) : chaque acte ou séquence qui n'a pas encore sa note de case la reçoit ; dans un épisode (ou un
 * texte) qui a aussi une structure livrée, celle-ci devient d'abord celle de l'auteur. Même tableau si tout est
 * déjà en place.
 */
export function adoptStructureCases(
  elements: readonly ScreenplayElement[],
  scriptBeats: ScriptBeats | undefined,
  text: { label: (key: string) => string; hint: (key: string) => string; tplName: (template: string) => string; builtInOf: (key: string) => string },
): CaseChange {
  let els = elements as ScreenplayElement[];
  const entries: ScriptBeats = {};
  const used = () => [...usedCaseKeys(els, scriptBeats), ...Object.keys(entries)];
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el.type !== "section" || !partKindOf(el) || beatOf(el.text)) continue;
    const [start, end] = scopeAt(els, i);
    const firstBuiltIn = els.slice(start, end).map(builtInKey).find((k): k is string => !!k);
    if (firstBuiltIn) {
      const done = customizeRange(els, start, end, used(), { label: text.label, hint: text.hint, tplName: text.tplName(text.builtInOf(firstBuiltIn)) });
      els = done.elements;
      Object.assign(entries, done.entries);
    }
    const key = nextCustomKey(used());
    els = els === elements ? els.slice() : els;
    els[i] = { ...el, text: withCaseNote(el.text, key) };
    entries[key] = entries[key] ?? {};
  }
  for (const k of Object.keys(entries)) if (Object.keys(entries[k]).length === 0) delete entries[k];
  return { elements: els, entries };
}

/** Section d'acte ou de séquence : aussi une case de l'auteur (pour l'affichage du rang). */
export const isPartCase = (el: ScreenplayElement | undefined): boolean => !!partKindOf(el) && !!(el && el.type === "section" && beatOf(el.text));

/** Acte ou séquence de la case `key` (rang « Séquence 3 sur 8 »), sinon null. */
export function caseKind(elements: readonly ScreenplayElement[], key: string): "act" | "seq" | "sub" | null {
  for (const el of elements) if (el.type === "section" && beatOf(el.text) === key) return partKindOf(el);
  return null;
}

export interface KindRank {
  n: number;
  total: number;
  /** Acte, séquence ou sous-séquence ; null pour l'étape d'une structure (livrée ou non notée). */
  kind: "act" | "seq" | "sub" | null;
}

/**
 * Rang de chaque étape finale (`leaves`, sans les ensembles) : un acte parmi les actes, une séquence parmi les
 * séquences, une sous-séquence parmi les sous-séquences, une étape parmi les autres étapes (lot 17 ter :
 * « Séquence 3 sur 8 », jamais « Étape 3 sur 8 » pour une séquence).
 */
export function kindRanks(elements: readonly ScreenplayElement[], leaves: readonly string[]): Map<string, KindRank> {
  const kinds = leaves.map((key) => ({ key, kind: caseKind(elements, key) }));
  const out = new Map<string, KindRank>();
  for (const { key, kind } of kinds) {
    const same = kinds.filter((k) => k.kind === kind);
    out.set(key, { n: same.findIndex((k) => k.key === key) + 1, total: same.length, kind });
  }
  return out;
}

/** Libellé d'un rang selon sa sorte. */
export const rankLabel = (t: { beatRank: string; seqRank: string; subRank: string; actRank: string }, kind: KindRank["kind"]): string =>
  kind === "act" ? t.actRank : kind === "seq" ? t.seqRank : kind === "sub" ? t.subRank : t.beatRank;
