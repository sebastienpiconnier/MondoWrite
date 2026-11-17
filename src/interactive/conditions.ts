// Conditions et effets d'un choix, lus plutôt que copiés (novembre 2026, retours du « Puits ») : de quoi vérifier ce
// qu'écrit un assistant externe (`set_choices`) et dire en clair, dans le livre-jeu imprimé, une condition faite de
// plusieurs faits ou d'un compteur. Seule une petite partie d'Ink est reconnue : faits, compteurs comparés à un
// nombre, `and`, `or`, `not` et parenthèses. Le reste n'est pas une erreur pour l'app (Ink le lit), seulement une
// condition que le livre imprimé ne sait pas écrire. Fonctions pures, testées.

import { isFactName } from "./facts";

export type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type Cond =
  | { k: "name"; name: string }
  | { k: "not"; a: Cond }
  | { k: "and" | "or"; list: Cond[] }
  | { k: "cmp"; name: string; op: CmpOp; value: number | boolean };

type Token = { t: "id"; v: string } | { t: "num"; v: number | boolean } | { t: "op"; v: string };

const WORDS: Record<string, string> = { and: "&&", or: "||", not: "!" };

function tokenize(src: string): Token[] | null {
  const out: Token[] = [];
  const re = /\s*(?:([\p{L}_][\p{L}\p{N}_]*)|(\d+)|(&&|\|\||==|!=|<=|>=|[()<>!]))/uy;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) return null;
    i = re.lastIndex;
    if (m[1]) {
      const word = m[1].toLowerCase();
      if (WORDS[word]) out.push({ t: "op", v: WORDS[word] });
      else if (word === "true" || word === "false") out.push({ t: "num", v: word === "true" });
      else out.push({ t: "id", v: m[1] });
    } else if (m[2]) out.push({ t: "num", v: Number(m[2]) });
    else out.push({ t: "op", v: m[3] });
  }
  return out;
}

/** Condition lue, ou null si elle sort de ce que MondoWrite sait lire (fonction, texte, opération…). */
export function parseCond(src: string | undefined): Cond | null {
  const tokens = tokenize((src ?? "").trim());
  if (!tokens || tokens.length === 0) return null;
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;

  function atom(): Cond | null {
    const tok = peek();
    if (!tok) return null;
    if (tok.t === "op" && tok.v === "(") {
      i++;
      const inner = or();
      if (!inner || !isOp(")")) return null;
      i++;
      return inner;
    }
    if (tok.t !== "id" || !isFactName(tok.v)) return null;
    i++;
    const next = peek();
    if (next?.t === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(next.v)) {
      i++;
      const num = peek();
      if (num?.t !== "num") return null;
      i++;
      return { k: "cmp", name: tok.v, op: next.v as CmpOp, value: num.v };
    }
    return { k: "name", name: tok.v };
  }
  function unary(): Cond | null {
    if (isOp("!")) {
      i++;
      const a = unary();
      return a ? { k: "not", a } : null;
    }
    return atom();
  }
  function chain(kind: "and" | "or", op: string, next: () => Cond | null): Cond | null {
    const first = next();
    if (!first) return null;
    const list = [first];
    while (isOp(op)) {
      i++;
      const more = next();
      if (!more) return null;
      list.push(more);
    }
    return list.length === 1 ? first : { k: kind, list };
  }
  const and = () => chain("and", "&&", unary);
  const or = (): Cond | null => chain("or", "||", and);

  const cond = or();
  return cond && i === tokens.length ? cond : null;
}

/** Noms lus dans une condition (faits, compteurs, scènes). */
export function condIdentifiers(cond: Cond): string[] {
  switch (cond.k) {
    case "name":
    case "cmp":
      return [cond.name];
    case "not":
      return condIdentifiers(cond.a);
    default:
      return cond.list.flatMap(condIdentifiers);
  }
}

/** Effet lu : un fait donné ou retiré, un compteur posé, augmenté ou diminué. */
export type Effect = { name: string; op: "set"; value: boolean | number } | { name: string; op: "add" | "sub"; value: number };

/** Effet d'un choix (`cle = true`, `flamme = 3`, `flamme -= 1`, `pieces++`), ou null s'il n'est pas reconnu. */
export function parseEffect(src: string): Effect | null {
  const s = src.trim().replace(/^~\s*/, "");
  let m = /^([\p{L}_][\p{L}\p{N}_]*)\s*(\+\+|--)$/u.exec(s);
  if (m && isFactName(m[1])) return { name: m[1], op: m[2] === "++" ? "add" : "sub", value: 1 };
  m = /^([\p{L}_][\p{L}\p{N}_]*)\s*(\+=|-=|=)\s*(true|false|\d{1,6})$/u.exec(s);
  if (!m || !isFactName(m[1])) return null;
  // `x = x + 2` n'est pas reconnu ici (le livre-jeu le lit à part) : on écrit toujours `x += 2`.
  if (m[2] === "=") return { name: m[1], op: "set", value: m[3] === "true" ? true : m[3] === "false" ? false : Number(m[3]) };
  if (m[3] === "true" || m[3] === "false") return null;
  return { name: m[1], op: m[2] === "+=" ? "add" : "sub", value: Number(m[3]) };
}

/** Effet écrit dans la syntaxe du bloc `choix`. */
export function effectSource(e: Effect): string {
  if (e.op === "set") return `${e.name} = ${e.value}`;
  return `${e.name} ${e.op === "add" ? "+=" : "-="} ${e.value}`;
}

// ---------- Le livre-jeu imprimé ----------

/** Phrases d'une condition imprimée, dans la langue du livre. */
export interface CondTexts {
  /** « Si {conds}, » */
  cond: string;
  has: string;
  hasNot: string;
  visited: string;
  notVisited: string;
  atLeast: string;
  atMost: string;
  exactly: string;
  notExactly: string;
  /** « et », « ou » (sans espaces autour) */
  and: string;
  or: string;
}

/** Ce que la phrase sait d'un nom : une scène (son numéro de section), sinon un fait (son libellé déjà cité). */
export interface CondNames {
  section: (name: string) => number | null;
  fact: (name: string) => string;
}

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);

/** Liste lue « a, b et c ». */
const joined = (parts: string[], word: string) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} ${word} ${parts[parts.length - 1]}`);

/** Une comparaison ramenée à « au moins », « au plus », « exactement », « pas » ; null si elle ne se dit pas. */
function cmpClause(name: string, op: CmpOp, value: number | boolean, negate: boolean, texts: CondTexts, names: CondNames): string | null {
  const flip: Record<CmpOp, CmpOp> = { "==": "!=", "!=": "==", "<": ">=", "<=": ">", ">": "<=", ">=": "<" };
  const o = negate ? flip[op] : op;
  if (typeof value === "boolean") {
    const has = (o === "==") === value;
    if (o !== "==" && o !== "!=") return null;
    return simpleClause(name, !has, texts, names);
  }
  const section = names.section(name);
  if (section !== null) {
    // Une scène comparée à 0 : « déjà passé par », comme Ink compte les passages.
    if ((o === ">" && value === 0) || (o === ">=" && value === 1) || (o === "!=" && value === 0)) return fill(texts.visited, { n: String(section) });
    if ((o === "==" || o === "<=") && value === 0) return fill(texts.notVisited, { n: String(section) });
    return null;
  }
  const fact = names.fact(name);
  switch (o) {
    case ">":
      return fill(texts.atLeast, { fact, n: String(value + 1) });
    case ">=":
      return fill(texts.atLeast, { fact, n: String(value) });
    case "<":
      return value >= 1 ? fill(texts.atMost, { fact, n: String(value - 1) }) : null;
    case "<=":
      return fill(texts.atMost, { fact, n: String(value) });
    case "==":
      return fill(texts.exactly, { fact, n: String(value) });
    case "!=":
      return fill(texts.notExactly, { fact, n: String(value) });
  }
}

function simpleClause(name: string, not: boolean, texts: CondTexts, names: CondNames): string {
  const section = names.section(name);
  if (section !== null) return fill(not ? texts.notVisited : texts.visited, { n: String(section) });
  return fill(not ? texts.hasNot : texts.has, { fact: names.fact(name) });
}

function clause(c: Cond, texts: CondTexts, names: CondNames): string | null {
  switch (c.k) {
    case "name":
      return simpleClause(c.name, false, texts, names);
    case "cmp":
      return cmpClause(c.name, c.op, c.value, false, texts, names);
    case "not":
      if (c.a.k === "name") return simpleClause(c.a.name, true, texts, names);
      if (c.a.k === "cmp") return cmpClause(c.a.name, c.a.op, c.a.value, true, texts, names);
      return null;
    default:
      return null;
  }
}

/**
 * La condition dite au lecteur (« Si vous avez noté « clé » et que… », sans la virgule finale près), "" pour une
 * condition vide, null si elle ne se dit pas simplement (des `et` et des `ou` mêlés, une négation d'un groupe…).
 */
export function condPhrase(src: string | undefined, texts: CondTexts, names: CondNames): string | null {
  if (!src?.trim()) return "";
  const cond = parseCond(src);
  if (!cond) return null;
  let parts: (string | null)[];
  let word = texts.and;
  if (cond.k === "and" || cond.k === "or") {
    parts = cond.list.map((c) => clause(c, texts, names));
    word = cond.k === "and" ? texts.and : texts.or;
  } else parts = [clause(cond, texts, names)];
  if (parts.some((p) => p === null)) return null;
  return fill(texts.cond, { conds: joined(parts as string[], word) });
}

/** Phrases d'un effet imprimé. */
export interface EffectTexts {
  note: string;
  unnote: string;
  set: string;
  add: string;
  remove: string;
}

/** L'effet dit au lecteur (« notez « clé » », « retirez 1 à « flamme » »), ou null s'il ne se dit pas. */
export function effectPhrase(src: string, texts: EffectTexts, fact: (name: string) => string): string | null {
  let e = parseEffect(src);
  if (!e) {
    // Forme longue écrite à la main : `x = x + 2`.
    const m = /^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*\1\s*(\+|-)\s*(\d+)$/u.exec(src.trim());
    if (m) e = { name: m[1], op: m[2] === "+" ? "add" : "sub", value: Number(m[3]) };
  }
  if (!e) return null;
  const f = fact(e.name);
  if (e.op === "add") return fill(texts.add, { fact: f, n: String(e.value) });
  if (e.op === "sub") return fill(texts.remove, { fact: f, n: String(e.value) });
  if (e.value === true) return fill(texts.note, { fact: f });
  if (e.value === false) return fill(texts.unnote, { fact: f });
  return fill(texts.set, { fact: f, n: String(e.value) });
}
