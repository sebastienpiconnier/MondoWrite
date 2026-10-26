// Vérification du texte (onglet « Vérifier » du Scénario et du Manuscrit) : des points à regarder, jamais
// une correction. L'auteur décide pour chacun (aller au passage, renommer, créer la carte, ignorer).
// Tout est calculé ici, sur l'appareil, sans IA ni réseau. Fonctions pures.

import type { ScreenplayElement } from "../screenplay/model";
import type { Layout } from "../screenplay/layout";
import { characterName, headingParts, listScenes, sceneAt } from "../screenplay/scenes";
import { wrap } from "../screenplay/paginate";
import type { CardData } from "../types";
import { foldName, similarNames } from "./names";
import { promises, whoKnows, type LoggedChange } from "../changes";

/** Clés des règles : fixes, jamais traduites (les libellés sont dans `t.review.rules`). */
export type RuleKey = "similarNames" | "longAction" | "extraSpaces" | "headingFormat" | "emptyElement" | "unknownCharacter" | "speaksBeforeKnowing" | "unkeptPromise";

export const RULE_ORDER: RuleKey[] = ["similarNames", "unknownCharacter", "speaksBeforeKnowing", "unkeptPromise", "longAction", "headingFormat", "emptyElement", "extraSpaces"];

export interface Finding {
  /** Identifiant stable du point (pour « Ignorer » pendant la session). */
  key: string;
  rule: RuleKey;
  /** Scénario : index de l'élément. Roman : -1. */
  at: number;
  /** Scénario : numéro de la scène (0 avant la première). */
  scene: number;
  /** Roman : carte Scène concernée. Scénario : carte de la scène, si elle en a une. */
  sceneId: string | null;
  /** Extrait montré à l'auteur. */
  text: string;
  /** Roman : passage exact à retrouver dans le texte de la scène (sélectionné quand on y va). */
  needle?: string;
  /** similarNames : le nom le moins employé d'abord, puis l'autre ; unknownCharacter : le nom. */
  names?: string[];
  /** similarNames : nombre d'emplois de chacun ; longAction : nombre de lignes. */
  counts?: number[];
}

/** Au-delà, un paragraphe d'action se lit mal (usage des lecteurs de scénario). */
export const MAX_ACTION_LINES = 4;

const SPACES = / {2,}/;

/** Personnages qui parlent, avec leur nombre de répliques et le premier élément où ils parlent. */
export function speakers(elements: ScreenplayElement[], locale = "fr"): Map<string, { lines: number; first: number }> {
  const out = new Map<string, { lines: number; first: number }>();
  elements.forEach((el, i) => {
    if (el.type !== "character") return;
    const name = characterName(el.text).toLocaleUpperCase(locale);
    if (!name) return;
    const known = out.get(name);
    if (known) known.lines++;
    else out.set(name, { lines: 1, first: i });
  });
  return out;
}

/** Une carte Personnage porte-t-elle ce nom (titre entier, ou un de ses surnoms) ? */
const hasCard = (name: string, cards: CardData[]) => {
  const key = foldName(name);
  return cards.some(
    (c) =>
      c.type === "personnage" &&
      [c.title, ...(c.fiche?.surnoms ?? "").split(/[,;]/)].some((n) => n.trim() && foldName(n) === key),
  );
};

/** Points à regarder dans un scénario. */
export function checkScreenplay(elements: ScreenplayElement[], layout: Layout, cards: CardData[], locale = "fr"): Finding[] {
  const scenes = listScenes(elements);
  const sceneOf = (i: number) => sceneAt(scenes, i);
  const make = (rule: RuleKey, at: number, extra: Partial<Finding> = {}): Finding => {
    const scene = sceneOf(at);
    return { key: `${rule}:${at}:${(extra.names ?? []).join("|")}`, rule, at, scene: scene?.number ?? 0, sceneId: scene?.cardId ?? null, text: elements[at]?.text ?? "", ...extra };
  };
  const out: Finding[] = [];

  // Noms presque identiques : on signale le moins employé, à côté de celui qu'il ressemble.
  const who = speakers(elements, locale);
  const names = [...who.keys()];
  const seen = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (!similarNames(names[i], names[j])) continue;
      // Le bon nom est celui qui a sa carte, sinon le plus employé.
      const weight = (n: string) => (hasCard(n, cards) ? 1e6 : 0) + who.get(n)!.lines;
      const [rare, common] = weight(names[i]) <= weight(names[j]) ? [names[i], names[j]] : [names[j], names[i]];
      const pair = `${rare}|${common}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      out.push(make("similarNames", who.get(rare)!.first, { names: [rare, common], counts: [who.get(rare)!.lines, who.get(common)!.lines] }));
    }
  }

  // Personnage qui parle sans carte (il n'apparaît ni dans la Bible ni sur le canevas).
  // Un nom déjà signalé comme variante d'un autre ne l'est pas deux fois : « Renommer partout » suffit.
  const variants = new Set([...seen].map((pair) => pair.split("|")[0]));
  for (const [name, { first }] of who) if (!hasCard(name, cards) && !variants.has(name)) out.push(make("unknownCharacter", first, { names: [name] }));

  elements.forEach((el, i) => {
    const text = el.text;
    if (el.type === "action" && text.trim()) {
      const lines = wrap(text, layout.columns.action).length;
      if (lines > MAX_ACTION_LINES) out.push(make("longAction", i, { counts: [lines] }));
    }
    if (el.type === "sceneHeading") {
      if (!text.trim()) out.push(make("emptyElement", i));
      else if (!el.forced) {
        const parts = headingParts(text);
        if (!parts.prefix || !parts.time) out.push(make("headingFormat", i));
      }
    }
    if (el.type === "character") {
      const next = elements[i + 1];
      if (!next || (next.type !== "dialogue" && next.type !== "parenthetical")) out.push(make("emptyElement", i));
    }
    if ((el.type === "action" || el.type === "dialogue" || el.type === "character" || el.type === "parenthetical" || el.type === "sceneHeading") && SPACES.test(text)) {
      out.push(make("extraSpaces", i));
    }
  });
  return sortFindings(out);
}

/** Texte brut d'un HTML d'éditeur, espaces gardées telles quelles (sauf les fins de paragraphe). */
export function rawText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "’")
    .replace(/&amp;/g, "&");
}

const WORD = /\p{Lu}[\p{L}’'-]{3,}/gu;

/** Extrait autour d'une position : quelques mots de chaque côté, sur une ligne. */
export function excerpt(text: string, at: number, length: number, around = 30): string {
  const start = Math.max(0, at - around);
  const end = Math.min(text.length, at + length + around);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

/**
 * Points à regarder dans le manuscrit d'un roman, scène par scène (dans l'ordre du livre) : un nom écrit
 * presque comme celui d'une carte Personnage ou Lieu (« Inés » pour « Inès »), espaces en trop.
 */
export function checkManuscript(manuscript: Record<string, string>, order: string[], cards: CardData[]): Finding[] {
  const out: Finding[] = [];
  // Mots des noms des cartes (« Inès Morvan » → « Inès », « Morvan »), tels qu'écrits.
  const nameWords = new Set<string>();
  for (const c of cards) {
    if (c.type !== "personnage" && c.type !== "lieu") continue;
    for (const w of c.title.match(WORD) ?? []) nameWords.add(w);
  }
  const words = [...nameWords];
  order.forEach((id, n) => {
    const html = manuscript[id];
    if (!html) return;
    const text = rawText(html);
    const flagged = new Set<string>();
    for (const m of text.matchAll(WORD)) {
      const w = m[0];
      if (nameWords.has(w) || flagged.has(w)) continue;
      const near = words.find((name) => similarNames(w, name));
      if (!near) continue;
      flagged.add(w);
      out.push({ key: `similarNames:${id}:${w}`, rule: "similarNames", at: -1, scene: n + 1, sceneId: id, text: w, needle: w, names: [w, near] });
    }
    for (const m of text.matchAll(/ {2,}| +(?=[,.])/g)) {
      const at = m.index ?? 0;
      // Passage à retrouver : les espaces et quelques lettres autour, sans sortir du paragraphe.
      const lineStart = text.lastIndexOf("\n", at) + 1;
      const lineEnd = text.indexOf("\n", at) === -1 ? text.length : text.indexOf("\n", at);
      const needle = text.slice(Math.max(lineStart, at - 12), Math.min(lineEnd, at + m[0].length + 12));
      out.push({ key: `extraSpaces:${id}:${at}`, rule: "extraSpaces", at: -1, scene: n + 1, sceneId: id, text: excerpt(text, at, m[0].length), needle });
    }
  });
  return sortFindings(out);
}

/** Par règle (dans l'ordre de `RULE_ORDER`), puis dans l'ordre du texte. */
function sortFindings(list: Finding[]): Finding[] {
  return list.sort((a, b) => RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) || a.scene - b.scene || a.at - b.at);
}

/** Les points groupés par règle, sans ceux que l'auteur a ignorés. */
export function groupFindings(list: Finding[], ignored: ReadonlySet<string>): { rule: RuleKey; items: Finding[] }[] {
  const groups = new Map<RuleKey, Finding[]>();
  for (const f of list) {
    if (ignored.has(f.key)) continue;
    groups.set(f.rule, [...(groups.get(f.rule) ?? []), f]);
  }
  return RULE_ORDER.filter((r) => groups.has(r)).map((rule) => ({ rule, items: groups.get(rule)! }));
}

/**
 * Points tirés de « Ce qui change » (lot 5), toujours des questions, jamais des fautes :
 * - une promesse (« promet ») qu'aucune scène ne tient ;
 * - scénario : un personnage nomme dans ses répliques une chose (une carte citée) avant la scène où il
 *   l'apprend. C'est peut-être voulu (il ment, il devine) : « Ignorer » suffit.
 * `order` : les scènes dans l'ordre du journal ; `elements` : le scénario (absent pour un roman).
 */
export function checkChanges(log: LoggedChange[], order: string[], cards: CardData[], elements?: ScreenplayElement[]): Finding[] {
  const out: Finding[] = [];
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title.trim() ?? "";
  const scenes = elements ? listScenes(elements) : [];
  const headingOf = (sceneId: string) => scenes.find((s) => s.cardId === sceneId);
  for (const p of promises(log)) {
    if (p.kept) continue;
    const h = headingOf(p.made.sceneId);
    out.push({
      key: `unkeptPromise:${p.made.sceneId}:${p.key}`,
      rule: "unkeptPromise",
      at: h ? h.index : -1,
      scene: h ? h.number : p.made.index + 1,
      sceneId: p.made.sceneId,
      text: p.made.text,
      names: [p.made.who.map(titleOf).join(", "), p.text],
    });
  }
  if (!elements) return out;
  // Rang de chaque scène du scénario dans le journal.
  const rank = new Map(order.map((id, i) => [id, i]));
  for (const row of whoKnows(log)) {
    const thing = row.key.startsWith("@") ? row.key.slice(1) : null;
    const name = thing ? titleOf(thing) : "";
    if (!thing || name.length < 3) continue;
    const needle = foldName(name);
    for (const [who, learned] of row.learned) {
      const speaker = foldName(titleOf(who));
      if (!speaker) continue;
      let current = "";
      elements.forEach((el, i) => {
        if (el.type === "character") current = foldName(characterName(el.text));
        if (el.type !== "dialogue" || current !== speaker) return;
        const scene = sceneAt(scenes, i);
        const at = scene?.cardId ? rank.get(scene.cardId) : undefined;
        if (at === undefined || at >= learned.index || !foldName(el.text).includes(needle)) return;
        out.push({
          key: `speaksBeforeKnowing:${i}:${who}:${thing}`,
          rule: "speaksBeforeKnowing",
          at: i,
          scene: scene?.number ?? 0,
          sceneId: scene?.cardId ?? null,
          text: el.text,
          names: [titleOf(who), name, String(learned.index + 1)],
        });
      });
    }
  }
  return out;
}
