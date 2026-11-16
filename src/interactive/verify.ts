// Vérificateur d'un roman interactif (lot 5, docs/plan-roman-interactif.md) : des points à regarder, posés dans
// l'onglet « Vérifier » du Manuscrit et sur la carte des choix. Jamais une correction. Fonctions pures, testées.
//
// Le chemin du lecteur se suit par les choix (et les renvois `-> nom` écrits à la main), depuis la première scène,
// sans tenir compte des conditions : une scène est « atteignable » s'il existe un chemin, même s'il demande un fait.

import { END_TARGET, choicesIn, resolveTarget, sceneSlugs, type SceneRef } from "./choices";
import { factLabel, simpleCond } from "./facts";

export type VerifyRule = "unreachableScene" | "brokenChoice" | "noEnding" | "lockedScene" | "factNeverGiven" | "factTooLate" | "implicitEnd";

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
export const VERIFY_ORDER: readonly VerifyRule[] = ["noEnding", "unreachableScene", "brokenChoice", "lockedScene", "factNeverGiven", "factTooLate", "implicitEnd"];

const DIVERT_RE = /^\s*->\s*([\p{L}\p{N}_]+)\s*$/u;
const ASSIGN_RE = /^([\p{L}_][\p{L}\p{N}_]*)\s*(?:\+=|-=|=|\+\+|--)/u;

interface Exit {
  to: string | null;
  cond?: string;
  effects: string[];
  divert: boolean;
}

/** Sorties de chaque scène : ses choix et ses renvois. */
function exitsOf(scenes: readonly SceneRef[], manuscript: Readonly<Record<string, string>>): Map<string, Exit[]> {
  const slugs = sceneSlugs(scenes);
  const out = new Map<string, Exit[]>();
  for (const s of scenes) {
    const list: Exit[] = [];
    for (const line of choicesIn(manuscript[s.id])) {
      if (line.kind === "choice") list.push({ to: resolveTarget(line.target, slugs), cond: line.cond, effects: line.effects ?? [], divert: false });
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
export function verifyStory(scenes: readonly SceneRef[], manuscript: Readonly<Record<string, string>>, labels: Readonly<Record<string, string>> = {}): VerifyPoint[] {
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
    for (const e of exits.get(s.id) ?? []) {
      const c = simpleCond(e.cond);
      if (!c || c.not) continue;
      const key = `${c.name}:${s.id}`;
      if (seenFact.has(key)) continue;
      seenFact.add(key);
      const label = factLabel(c.name, labels);
      // Une condition qui nomme une scène (« a lu cette scène ») n'est pas un fait.
      if (sceneNames.has(c.name)) continue;
      const from = givers.get(c.name) ?? [];
      if (from.length === 0) out.push({ rule: "factNeverGiven", scene: s.id, name: c.name, label });
      else if (!from.some((g) => reachable.has(g.from) && g.to && g.to !== END_TARGET && reaches(g.to, s.id)))
        out.push({ rule: "factTooLate", scene: s.id, name: c.name, label });
    }

  const rank = new Map(scenes.map((s, i) => [s.id, i]));
  return out.sort((a, b) => VERIFY_ORDER.indexOf(a.rule) - VERIFY_ORDER.indexOf(b.rule) || (rank.get(a.scene ?? "") ?? 0) - (rank.get(b.scene ?? "") ?? 0));
}

/** Clé stable d'un point (pour « Ignorer » pendant la session). */
export const verifyKey = (p: VerifyPoint) => `${p.rule}:${p.scene ?? ""}:${p.name ?? ""}`;
