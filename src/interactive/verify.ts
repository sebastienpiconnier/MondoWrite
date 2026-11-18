// Vérificateur d'un roman interactif (lot 5, docs/plan-roman-interactif.md) : des points à regarder, posés dans
// l'onglet « Vérifier » du Manuscrit et sur la carte des choix. Jamais une correction. Fonctions pures, testées.
//
// Le chemin du lecteur se suit par les choix (et les renvois `-> nom` écrits à la main), depuis la première scène,
// sans tenir compte des conditions : une scène est « atteignable » s'il existe un chemin, même s'il demande un fait.

import { END_TARGET, choicesIn, isEndingScene, resolveTarget, sceneEnding, sceneSlugs, type EndingKind, type SceneRef } from "./choices";
import { factLabel } from "./facts";
import { condPhrase, effectPhrase, parseCond, type Cond, type CondTexts, type EffectTexts } from "./conditions";
import { sectionGaps } from "./sections";
import { sameSpread } from "./spreads";

export type VerifyRule =
  | "unreachableScene"
  | "brokenChoice"
  | "noEnding"
  | "noGoodEnding"
  | "lockedScene"
  | "factNeverGiven"
  | "factTooLate"
  | "implicitEnd"
  | "notPrinted"
  | "sectionGap"
  | "hiddenUnlocked"
  | "hiddenNotPlayable"
  | "sameSpread";

export interface VerifyPoint {
  rule: VerifyRule;
  /** Scène concernée (la première scène pour « aucune fin », null s'il n'y a aucune scène). */
  scene: string | null;
  /** Fait concerné (nom de la variable), ou destination introuvable. */
  name?: string;
  /** Libellé lisible du fait. */
  label?: string;
}

/** Ordre d'affichage : ce qui empêche de lire d'abord. */
export const VERIFY_ORDER: readonly VerifyRule[] = [
  "noEnding",
  "noGoodEnding",
  "unreachableScene",
  "brokenChoice",
  "lockedScene",
  "factNeverGiven",
  "factTooLate",
  "implicitEnd",
  "notPrinted",
  "sectionGap",
  "hiddenUnlocked",
  "hiddenNotPlayable",
  "sameSpread",
];

const DIVERT_RE = /^\s*->\s*([\p{L}\p{N}_]+)(?:\s+#(?:good|bad))?\s*$/u;
const ASSIGN_RE = /^([\p{L}_][\p{L}\p{N}_]*)\s*(?:\+=|-=|=|\+\+|--)/u;

interface Exit {
  to: string | null;
  label?: string;
  cond?: string;
  effects: string[];
  divert: boolean;
  hidden?: boolean;
}

/** Sorties de chaque scène : ses choix et ses renvois. */
function exitsOf(scenes: readonly SceneRef[], manuscript: Readonly<Record<string, string>>): Map<string, Exit[]> {
  const slugs = sceneSlugs(scenes);
  const out = new Map<string, Exit[]>();
  for (const s of scenes) {
    const list: Exit[] = [];
    for (const line of choicesIn(manuscript[s.id])) {
      if (line.kind === "choice")
        list.push({ to: resolveTarget(line.target, slugs), label: line.label, cond: line.cond, effects: line.effects ?? [], divert: false, ...(line.hidden ? { hidden: true } : {}) });
      else {
        const m = DIVERT_RE.exec(line.text);
        if (m) list.push({ to: resolveTarget(m[1], slugs), effects: [], divert: true });
      }
    }
    out.set(s.id, list);
  }
  return out;
}

/** Scènes atteintes depuis `from` (comprise), sans tenir compte des conditions. */
function reachFrom(from: string, exits: ReadonlyMap<string, Exit[]>): Set<string> {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    for (const e of exits.get(queue.shift()!) ?? []) {
      if (!e.to || e.to === END_TARGET || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return seen;
}

/**
 * Points à regarder. `scenes` dans l'ordre du livre (la première est le départ), `labels` les libellés des faits.
 */
export function verifyStory(
  scenes: readonly SceneRef[],
  manuscript: Readonly<Record<string, string>>,
  labels: Readonly<Record<string, string>> = {},
  sections?: { numbers: Readonly<Record<string, number>>; locked: readonly string[] },
  /** Pages de chaque section dans le dernier livre broché composé avec ces numéros (lot 13). */
  spans?: Readonly<Record<number, readonly [number, number]>> | null,
): VerifyPoint[] {
  if (scenes.length === 0) return [];
  const exits = exitsOf(scenes, manuscript);
  const start = scenes[0].id;
  const reachable = reachFrom(start, exits);
  const out: VerifyPoint[] = [];
  const reachCache = new Map<string, Set<string>>();
  const reaches = (from: string, to: string) => {
    let set = reachCache.get(from);
    if (!set) reachCache.set(from, (set = reachFrom(from, exits)));
    return set.has(to);
  };

  // Une fin : un choix « Fin », ou une scène sans aucune sortie (elle finit l'histoire).
  const ends = (id: string) => {
    const list = exits.get(id) ?? [];
    return list.length === 0 || list.some((e) => e.to === END_TARGET);
  };
  if (![...reachable].some(ends)) out.push({ rule: "noEnding", scene: start });
  // Types de fin (lot 14) : dès qu'une fin est marquée, le lecteur doit pouvoir atteindre une bonne fin.
  const kinds = new Map(scenes.map((s) => [s.id, sceneEnding(choicesIn(manuscript[s.id]))]));
  if ([...kinds.values()].some(Boolean) && ![...reachable].some((id) => kinds.get(id) === "good")) out.push({ rule: "noGoodEnding", scene: start });

  for (const s of scenes) {
    const list = exits.get(s.id) ?? [];
    if (s.id !== start && !reachable.has(s.id)) out.push({ rule: "unreachableScene", scene: s.id });
    if (list.some((e) => e.to === null)) out.push({ rule: "brokenChoice", scene: s.id });
    // Tous ses choix demandent quelque chose : si rien n'est acquis, le lecteur reste sans choix.
    if (list.length > 0 && list.every((e) => !e.divert && e.cond?.trim())) out.push({ rule: "lockedScene", scene: s.id });
    // Une scène qu'on n'atteint pas est déjà signalée : sa fin n'est pas la question.
    if (list.length === 0 && reachable.has(s.id)) out.push({ rule: "implicitEnd", scene: s.id });
  }

  // Faits : qui les donne, et depuis où.
  const givers = new Map<string, { from: string; to: string | null }[]>();
  for (const s of scenes)
    for (const e of exits.get(s.id) ?? [])
      for (const effect of e.effects) {
        const m = ASSIGN_RE.exec(effect.trim());
        if (m) givers.set(m[1], [...(givers.get(m[1]) ?? []), { from: s.id, to: e.to }]);
      }
  const sceneNames = new Set(sceneSlugs(scenes).values());
  const seenFact = new Set<string>();
  for (const s of scenes)
    for (const e of exits.get(s.id) ?? [])
      for (const name of requiredNames(e.cond)) {
        const key = `${name}:${s.id}`;
        if (seenFact.has(key)) continue;
        seenFact.add(key);
        const label = factLabel(name, labels);
        // Une condition qui nomme une scène (« a lu cette scène ») n'est pas un fait.
        if (sceneNames.has(name)) continue;
        const from = givers.get(name) ?? [];
        if (from.length === 0) out.push({ rule: "factNeverGiven", scene: s.id, name, label });
        else if (!from.some((g) => reachable.has(g.from) && g.to && g.to !== END_TARGET && reaches(g.to, s.id)))
          out.push({ rule: "factTooLate", scene: s.id, name, label });
      }

  // Le livre-jeu imprimé : un choix dont la condition ou un effet ne se dit pas en une phrase s'imprimerait sans.
  for (const s of scenes)
    for (const e of exits.get(s.id) ?? []) {
      if (e.divert) continue;
      const condOk = condPhrase(e.cond, PROBE_COND, PROBE_NAMES) !== null;
      const effectsOk = e.effects.every((x) => effectPhrase(x, PROBE_EFFECT, (n) => n) !== null);
      if (!condOk || !effectsOk) out.push({ rule: "notPrinted", scene: s.id, name: e.label?.trim() || "…", label: e.label?.trim() || "…" });
    }

  // Numéros du livre (lot 12) : un numéro que plus aucune section ne porte laisse un trou dans le livre imprimé.
  if (sections) for (const n of sectionGaps(sections.numbers)) out.push({ rule: "sectionGap", scene: null, name: String(n), label: String(n) });

  // Renvois cachés (lot 12) : le lecteur calcule le numéro ; la section visée doit le garder. Ils ne se jouent pas
  // dans la page web ni en Ink (une remarque par scène).
  for (const s of scenes) {
    const hidden = (exits.get(s.id) ?? []).filter((e) => e.hidden);
    if (hidden.length === 0) continue;
    for (const e of hidden)
      if (sections && e.to && e.to !== END_TARGET && !sections.locked.includes(e.to) && e.to !== start)
        out.push({ rule: "hiddenUnlocked", scene: s.id, name: e.label?.trim() || "…", label: e.label?.trim() || "…" });
    out.push({ rule: "hiddenNotPlayable", scene: s.id });
  }

  // Double page du livre broché (lot 13) : la suite d'un choix ne doit pas être sous les yeux du lecteur.
  if (sections && spans) {
    const byNumber = new Map(Object.entries(sections.numbers).map(([id, n]) => [n, id]));
    const links = scenes.flatMap((s) =>
      (exits.get(s.id) ?? []).flatMap((e) => (e.to && e.to !== END_TARGET && sections.numbers[s.id] && sections.numbers[e.to] ? [{ from: sections.numbers[s.id], to: sections.numbers[e.to] }] : [])),
    );
    for (const { from, to } of sameSpread(spans, links)) {
      const pair = `${from} \u2192 ${to}`;
      out.push({ rule: "sameSpread", scene: byNumber.get(from) ?? null, name: pair, label: pair });
    }
  }

  const rank = new Map(scenes.map((s, i) => [s.id, i]));
  return out.sort((a, b) => VERIFY_ORDER.indexOf(a.rule) - VERIFY_ORDER.indexOf(b.rule) || (rank.get(a.scene ?? "") ?? 0) - (rank.get(b.scene ?? "") ?? 0));
}

// Gabarits neutres : seule compte la question « cela se dit-il ? ».
const PROBE_COND: CondTexts = { cond: "{conds}", has: "{fact}", hasNot: "{fact}", visited: "{n}", notVisited: "{n}", atLeast: "{fact}", atMost: "{fact}", exactly: "{fact}", notExactly: "{fact}", and: "&", or: "|" };
const PROBE_EFFECT: EffectTexts = { note: "{fact}", unnote: "{fact}", set: "{fact}", add: "{fact}", remove: "{fact}" };
const PROBE_NAMES = { section: () => null, fact: (n: string) => n };

/**
 * Faits qu'une condition demande à coup sûr : un fait seul, un compteur qui doit être au-dessus de zéro, ou chacun des
 * termes d'un « et ». Un « ou » laisse le choix : rien n'y est exigé.
 */
function requiredNames(src: string | undefined): string[] {
  if (!src?.trim()) return [];
  const cond = parseCond(src);
  if (!cond) return [];
  const one = (c: Cond): string[] => {
    if (c.k === "name") return [c.name];
    if (c.k === "cmp") {
      if (c.value === true && c.op === "==") return [c.name];
      if (typeof c.value === "number" && ((c.op === ">" && c.value >= 0) || (c.op === ">=" && c.value > 0) || (c.op === "==" && c.value > 0))) return [c.name];
    }
    return [];
  };
  return cond.k === "and" ? cond.list.flatMap(one) : one(cond);
}

/** Clé stable d'un point (pour « Ignorer » pendant la session). */
export const verifyKey = (p: VerifyPoint) => `${p.rule}:${p.scene ?? ""}:${p.name ?? ""}`;

/** Nombre de fins de chaque type (lot 14) : une scène qui finit l'histoire compte une fois, selon son type. */
export function endingCounts(scenes: readonly SceneRef[], manuscript: Readonly<Record<string, string>>): Record<EndingKind | "neutral", number> {
  const out = { good: 0, bad: 0, neutral: 0 };
  for (const s of scenes) {
    const lines = choicesIn(manuscript[s.id]);
    if (!isEndingScene(lines)) continue;
    out[sceneEnding(lines) ?? "neutral"]++;
  }
  return out;
}
