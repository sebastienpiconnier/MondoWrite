// Faits et compteurs d'un roman interactif (lot 4, docs/plan-roman-interactif.md) : fonctions pures, testées.
//
// Un fait est ce que le lecteur a appris ou obtenu en chemin (« a trouvé la clé ») : une variable Ink booléenne,
// donnée par un choix (`~ cle = true` sous le choix) et demandée par un autre (`{ cle }` ou `{ not cle }`). Un
// compteur est une variable entière (`~ pieces += 1`, `{ pieces >= 3 }`), écrite à la main. Jamais de système de jeu
// livré (caractéristiques, combats, dés) : seulement ce que l'auteur pose lui-même.
//
// Rien n'est déclaré à part : les variables se lisent dans les choix. Seul le libellé lisible d'un fait est gardé, dans
// `storyFacts` de cosmos.json (gardé par `metaKeep`, comme `interactive`).

import { END_TARGET, choicesIn, slugOf, type ChoiceLine } from "./choices";

/** Clé de cosmos.json qui garde les libellés des faits : `{ "cle": "a trouvé la clé" }`. */
export const FACTS_KEY = "storyFacts";

/** Mots d'Ink qui ne sont jamais des variables (ni un nom de fait). */
const INK_WORDS = new Set([
  "true", "false", "not", "and", "or", "mod", "temp", "return", "function", "list", "else", "ref", "has", "hasnt",
  "stopping", "cycle", "shuffle", "once", "var", "const", "include", "external", "done", "end",
  "turns_since", "visit_count", "choice_count", "turns", "random", "seed_random", "read_count", "list_count",
  "list_min", "list_max", "list_all", "list_invert", "list_value", "list_random", "list_range", "int", "float", "floor",
  "ceiling", "pow", "min", "max",
]);

const IDENT_RE = /[\p{L}_][\p{L}\p{N}_]*/gu;
/** Fait demandé simplement : `cle` ou `not cle`. */
const SIMPLE_COND_RE = /^(not\s+)?([\p{L}_][\p{L}\p{N}_]*)$/u;
/** Fait donné simplement : `cle = true`. */
const SIMPLE_EFFECT_RE = /^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*true$/u;
/** Affectation : nom, opérateur, valeur. */
const ASSIGN_RE = /^([\p{L}_][\p{L}\p{N}_]*)\s*(\+=|-=|=|\+\+|--)\s*(.*)$/u;

export type FactKind = "bool" | "int";

export interface Fact {
  name: string;
  label: string;
  kind: FactKind;
  /** Choix qui le donnent ou le changent. */
  given: number;
  /** Choix qui le demandent. */
  needed: number;
}

/** Condition simple : le fait demandé et s'il doit être absent. Null pour une condition écrite à la main. */
export function simpleCond(cond: string | undefined): { name: string; not: boolean } | null {
  const m = SIMPLE_COND_RE.exec((cond ?? "").trim());
  if (!m || INK_WORDS.has(m[2].toLowerCase())) return null;
  return { name: m[2], not: !!m[1] };
}

/** Fait donné simplement par un effet (`cle = true`), sinon null. */
export function simpleEffect(effect: string): string | null {
  const m = SIMPLE_EFFECT_RE.exec(effect.trim());
  return m && !INK_WORDS.has(m[1].toLowerCase()) ? m[1] : null;
}

/** Condition écrite pour un fait demandé. */
export const condFor = (name: string, not: boolean) => (not ? `not ${name}` : name);
/** Effet écrit pour un fait donné. */
export const effectFor = (name: string) => `${name} = true`;

/** Remplace le fait donné simplement par un choix (ou le retire) ; les effets écrits à la main restent. */
export function withGiven(effects: readonly string[] | undefined, name: string | null): string[] {
  // Seul le premier fait donné simplement est celui de « Donne » : un second (la corde et la clé) reste.
  const list = [...(effects ?? [])];
  const at = list.findIndex((e) => simpleEffect(e));
  if (at >= 0) list.splice(at, 1);
  return name ? [effectFor(name), ...list] : list;
}

/** Libellés gardés dans cosmos.json : seulement des textes, sous des noms de variable valides. */
export function readFactLabels(meta: Record<string, unknown> | null | undefined): Record<string, string> {
  const raw = meta?.[FACTS_KEY];
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [name, label] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFactName(name) || typeof label !== "string") continue;
    const clean = cleanFactLabel(label);
    if (clean) out[name] = clean;
  }
  return out;
}

export const isFactName = (name: string) => /^[\p{L}_][\p{L}\p{N}_]{0,63}$/u.test(name) && !INK_WORDS.has(name.toLowerCase());

/** Libellé d'un fait : une ligne, 120 caractères au plus. */
export const cleanFactLabel = (raw: string) => raw.replace(/\s+/g, " ").trim().slice(0, 120);

/** Libellé affiché d'un fait : celui de l'auteur, sinon son nom avec des espaces. */
export const factLabel = (name: string, labels: Readonly<Record<string, string>>) => labels[name] ?? name.replace(/_+/g, " ").trim();

/** Nom d'un nouveau fait tiré de son libellé, jamais celui d'une scène, d'un autre fait ou d'un mot d'Ink. */
export function newFactName(label: string, taken: ReadonlySet<string>): string {
  let base = slugOf(label);
  if (base === "scene") base = "fait";
  if (INK_WORDS.has(base) || base === END_TARGET.toLowerCase()) base = `${base}_fait`;
  let name = base;
  for (let n = 2; taken.has(name) || INK_WORDS.has(name); n++) name = `${base}_${n}`;
  return name;
}

/** Noms des variables lues dans une condition (hors mots d'Ink, nombres et textes entre guillemets). */
export function condNames(cond: string): string[] {
  const bare = cond.replace(/"[^"]*"/g, " ");
  return [...bare.matchAll(IDENT_RE)].map((m) => m[0]).filter((w) => !INK_WORDS.has(w.toLowerCase()));
}

interface Seen {
  kind: FactKind;
  given: number;
  needed: number;
}

/**
 * Faits et compteurs du livre : ceux que les choix donnent ou demandent, et ceux qui n'ont qu'un libellé. Une
 * condition qui nomme une scène (« a déjà lu cette scène », usage d'Ink) n'en fait pas un fait. Triés par libellé.
 */
export function storyFacts(
  manuscript: Readonly<Record<string, string>>,
  sceneIds: readonly string[],
  sceneNames: ReadonlySet<string>,
  labels: Readonly<Record<string, string>>,
  lang?: string,
): Fact[] {
  const seen = new Map<string, Seen>();
  const touch = (name: string) => {
    let s = seen.get(name);
    if (!s) seen.set(name, (s = { kind: "bool", given: 0, needed: 0 }));
    return s;
  };
  const visit = (line: ChoiceLine) => {
    if (line.kind !== "choice") return;
    if (line.cond) {
      const numeric = /[<>]|[!=]=\s*-?\d|-?\d\s*[!=]=/.test(line.cond);
      for (const name of new Set(condNames(line.cond))) {
        if (sceneNames.has(name)) continue;
        const s = touch(name);
        s.needed++;
        if (numeric) s.kind = "int";
      }
    }
    for (const effect of line.effects ?? []) {
      const m = ASSIGN_RE.exec(effect.trim());
      if (!m || INK_WORDS.has(m[1].toLowerCase()) || sceneNames.has(m[1])) continue;
      const s = touch(m[1]);
      s.given++;
      if (m[2] !== "=" || /^-?\d/.test(m[3].trim())) s.kind = "int";
    }
  };
  for (const id of sceneIds) choicesIn(manuscript[id]).forEach(visit);
  for (const name of Object.keys(labels)) if (!sceneNames.has(name)) touch(name);
  return [...seen]
    .map(([name, s]) => ({ name, label: factLabel(name, labels), ...s }))
    .sort((a, b) => a.label.localeCompare(b.label, lang));
}

/** Déclarations Ink, en tête du texte : `VAR cle = false // a trouvé la clé`, `VAR pieces = 0`. */
export const inkDeclarations = (facts: readonly Fact[]): string[] =>
  facts.map((f) => {
    const decl = `VAR ${f.name} = ${f.kind === "int" ? "0" : "false"}`;
    return f.label !== factLabel(f.name, {}) ? `${decl} // ${f.label}` : decl;
  });

/** Valeur lue pendant la lecture : un fait acquis, ou un compteur non nul, se montre. */
export function shownValue(value: unknown): string | null {
  if (value === true) return "";
  if (typeof value === "number" && value !== 0) return String(value);
  return null;
}

// ---------- Réglages d'un choix (« Seulement si », « Donne ») ----------

/** Valeur du réglage « Seulement si » : "" (toujours), `has:nom`, `not:nom`, ou `custom` (écrite à la main). */
export function condValue(cond: string | undefined): string {
  if (!cond?.trim()) return "";
  const s = simpleCond(cond);
  return s ? `${s.not ? "not" : "has"}:${s.name}` : "custom";
}

/** Condition écrite pour une valeur du réglage (la condition à la main reste si `custom`). */
export function condFromValue(value: string, current: string | undefined): string | undefined {
  if (value === "custom") return current;
  const m = /^(has|not):(.+)$/.exec(value);
  return m ? condFor(m[2], m[1] === "not") : undefined;
}

/** Fait donné simplement par un choix, s'il y en a un. */
export const givenFact = (effects: readonly string[] | undefined): string | null => {
  for (const e of effects ?? []) {
    const name = simpleEffect(e);
    if (name) return name;
  }
  return null;
};

/**
 * Effets écrits à la main : tout sauf le fait donné simplement (`givenFact`, le premier). Un second fait donné par le
 * même choix reste ici : l'assistant le lisait mal, la clé de la scène 3 du « Puits » n'apparaissait plus.
 */
export const otherEffects = (effects: readonly string[] | undefined): string[] => {
  let skipped = false;
  return (effects ?? []).filter((e) => {
    if (!skipped && simpleEffect(e)) return !(skipped = true);
    return true;
  });
};
