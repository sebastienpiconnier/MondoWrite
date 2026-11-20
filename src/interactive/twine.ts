// Roman interactif, #96 : la logique de Twine lue à l'import Twee (SugarCube et Harlowe). Le texte d'un passage est
// découpé en morceaux (texte, liens, macros), puis parcouru : les cas simples deviennent des faits, des conditions et
// des choix ; une macro que MondoWrite ne sait pas convertir sort de la prose et reste en commentaire Ink (`// …`) dans
// le bloc de choix, pour que le texte reste propre, que rien ne soit perdu et que l'histoire se compile toujours.
//
// Convertis :
// - `<<set $x to true>>`, `<<set $x += 1>>`, `(set: $x to it + 1)`, `(put: 3 into $x)` : effets ; dans un passage, ceux
//   du choix qui y mène (de tous ses choix d'entrée), dans le corps d'un lien, ceux de ce lien ;
// - un lien dans `<<if>>` / `(if:)[…]` (et `elseif`, `else`, `unless`) : un choix à condition, si la condition se lit
//   (faits, `not`, compteurs comparés à un nombre, `and`, `or`) ;
// - le setter d'un lien SugarCube (`[[Prendre|Atelier][$corde to true]]`) : effets du choix ;
// - `<<link "texte" "cible">>`, `<<button>>`, `<<goto "cible">>`, `(link-goto:)`, `(click-goto:)`, `(link-reveal-goto:)`,
//   `(link: "texte")[(goto: "cible")]`, `(goto:)` : des choix.
// Un `<<if>>` qui contient de la prose garde ses balises en commentaire : son texte est lu sans condition.
//
// Fonctions pures, testées.

import { cleanLabel, type Choice } from "./choices";
import { effectSource, parseCond, parseEffect } from "./conditions";
import { isFactName } from "./facts";

const NAME = String.raw`[\p{L}_][\p{L}\p{N}_]*`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VAR_RE = new RegExp(String.raw`^\$(${NAME})$`, "u");

/**
 * Variable de Twine (`$cle`) en nom de fait ; null pour une variable temporaire (`_x`). Un nom qui est un mot d'Ink
 * (`$or`, l'or du héros) reçoit `_var` : `or_var`.
 */
export function twineVar(raw: string): string | null {
  const m = VAR_RE.exec(raw.trim());
  return m ? factOf(m[1]) : null;
}

const factOf = (name: string) => (isFactName(name) ? name : isFactName(`${name}_var`) ? `${name}_var` : null);

// ---------- Conditions ----------

const COND_TOKEN = new RegExp(String.raw`\s*(?:(\$${NAME})|(\d+)|("[^"]*"|'[^']*'|\x60[^\x60]*\x60)|(${NAME})|(===|!==|==|!=|>=|<=|&&|\|\||[()<>!]))`, "uy");
const WORD_OPS: Record<string, string> = { is: "==", eq: "==", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=", and: "and", or: "or", not: "not", true: "true", false: "false" };
const SYMBOL_OPS: Record<string, string> = { "===": "==", "==": "==", "!==": "!=", "!=": "!=", "&&": "and", "||": "or", "!": "not" };

/**
 * Condition de SugarCube ou de Harlowe (`$cle`, `not $cle`, `$or gte 3`, `$x is not true`, `$a and $b`) écrite en
 * condition Ink ; null si elle sort de ce que MondoWrite relit (texte, fonction, variable temporaire…).
 */
export function twineCond(src: string): string | null {
  const s = src.trim();
  if (!s) return null;
  const out: string[] = [];
  COND_TOKEN.lastIndex = 0;
  let i = 0;
  while (i < s.length) {
    if (/^\s*$/.test(s.slice(i))) break;
    COND_TOKEN.lastIndex = i;
    const m = COND_TOKEN.exec(s);
    if (!m) return null;
    i = COND_TOKEN.lastIndex;
    if (m[1]) {
      const name = twineVar(m[1]);
      if (!name) return null;
      out.push(name);
    } else if (m[2]) out.push(m[2]);
    else if (m[3]) return null;
    else if (m[4]) {
      const word = m[4].toLowerCase();
      const op = WORD_OPS[word];
      if (!op) return null;
      // Harlowe : `is not` est une différence, pas un `not` qui suit.
      if (op === "not" && out[out.length - 1] === "==") out[out.length - 1] = "!=";
      else out.push(op);
    } else out.push(SYMBOL_OPS[m[5]] ?? m[5]);
  }
  const ink = out
    .join(" ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")")
    .replace(new RegExp(String.raw`(${NAME}) (==|!=) (true|false)\b`, "gu"), (_, name: string, op: string, v: string) => ((op === "==") === (v === "true") ? name : `not ${name}`))
    .replace(/\bnot not /g, "");
  return parseCond(ink) ? ink : null;
}

/** Une condition niée, la plus simple possible. */
export function negateCond(cond: string): string {
  const c = cond.trim();
  const m = new RegExp(String.raw`^not (${NAME})$`, "u").exec(c);
  if (m) return m[1];
  if (new RegExp(String.raw`^${NAME}$`, "u").test(c)) return `not ${c}`;
  return `not (${c})`;
}

/** Plusieurs conditions qui doivent toutes tenir. */
export function allConds(conds: readonly string[]): string | undefined {
  if (conds.length === 0) return undefined;
  if (conds.length === 1) return conds[0];
  return conds.map((c) => (/\s(and|or)\s/.test(c) ? `(${c})` : c)).join(" and ");
}

// ---------- Effets ----------

/** Une affectation de Twine en effet MondoWrite (`cle = true`, `or += 2`), ou null. */
function oneEffect(name: string, op: string, value: string, twine: string): string | null {
  const v = value.trim();
  let effect: string | null = null;
  if (op === "++" || op === "--") effect = `${name} ${op === "++" ? "+=" : "-="} 1`;
  else if (op === "+=" || op === "-=") effect = `${name} ${op} ${v}`;
  else {
    const self = new RegExp(String.raw`^(?:it|\$${escapeRe(twine)})\s*([+-])\s*(\d+)$`, "u").exec(v);
    effect = self ? `${name} ${self[1]}= ${self[2]}` : `${name} = ${v}`;
  }
  const parsed = parseEffect(effect);
  return parsed ? effectSource(parsed) : null;
}

/** Parties séparées par une virgule ou un point-virgule hors des guillemets et des parenthèses. */
function splitTop(src: string, seps: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of src) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && seps.includes(ch)) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const SET_RE = new RegExp(String.raw`^\$(${NAME})\s*(?:(\+\+|--)|(to|=|\+=|-=)\s*([\s\S]+))$`, "u");
const PUT_RE = new RegExp(String.raw`^([\s\S]+?)\s+into\s+\$(${NAME})$`, "u");

/** Effets d'un `<<set>>` de SugarCube ou d'un `(set:)` / `(put:)` de Harlowe ; null si l'un d'eux ne se lit pas. */
export function twineEffects(args: string, macro: "set" | "put" = "set"): string[] | null {
  const parts = splitTop(args, macro === "set" ? ",;" : ",");
  if (parts.length === 0) return null;
  const out: string[] = [];
  for (const part of parts) {
    let effect: string | null = null;
    if (macro === "put") {
      const m = PUT_RE.exec(part);
      const name = m && factOf(m[2]);
      if (m && name) effect = oneEffect(name, "to", m[1], m[2]);
    } else {
      const m = SET_RE.exec(part);
      const name = m && factOf(m[1]);
      if (m && name) effect = oneEffect(name, m[2] ?? m[3], m[4] ?? "", m[1]);
    }
    if (!effect) return null;
    out.push(effect);
  }
  return out;
}

// ---------- Liens ----------

/** Un lien de Twine : `[[texte->cible]]`, `[[cible<-texte]]`, `[[texte|cible]]`, `[[cible]]`, et son setter SugarCube. */
export function readTweeLink(inner: string): { label: string; target: string; setter?: string } {
  const at = inner.indexOf("][");
  const body = at >= 0 ? inner.slice(0, at) : inner;
  const setter = at >= 0 ? inner.slice(at + 2).replace(/\]\[/g, ";") : undefined;
  const extra = setter !== undefined ? { setter } : {};
  let m = /^([\s\S]*)->([\s\S]+)$/.exec(body);
  if (m) return { label: m[1].trim(), target: m[2].trim(), ...extra };
  m = /^([\s\S]+?)<-([\s\S]*)$/.exec(body);
  if (m) return { label: m[2].trim(), target: m[1].trim(), ...extra };
  m = /^([\s\S]*?)\|([\s\S]+)$/.exec(body);
  if (m) return { label: m[1].trim(), target: m[2].trim(), ...extra };
  return { label: body.trim(), target: body.trim(), ...extra };
}

// ---------- Découpage ----------

type Node =
  | { k: "text"; s: string }
  | { k: "link"; inner: string; src: string }
  /** Macro de SugarCube ; `body` pour une macro à balise fermante, `close` sa balise. */
  | { k: "sc"; name: string; args: string; src: string; body?: string; close?: string }
  /** Macro de Harlowe (nom sans tiret ni casse) et son crochet éventuel. */
  | { k: "hw"; name: string; args: string; src: string; hook?: string };

const LINK_AT = /\[\[([\s\S]*?)\]\](?!\])/y;
const SC_AT = /<<\s*(\/?)\s*([A-Za-z][\w-]*|=|-)([\s\S]*?)>>/y;
const HW_AT = /\(([A-Za-z][\w-]*):/y;


/** Fin d'une macro conteneur de SugarCube (`<</if>>` ou `<<endif>>`), en tenant compte des imbrications. */
function sugarClose(src: string, from: number, name: string): { start: number; end: number } | null {
  const re = new RegExp(String.raw`<<\s*(\/)?\s*(end)?${escapeRe(name)}(?![\w-])[\s\S]*?>>`, "gi");
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1] || m[2]) depth--;
    else depth++;
    if (depth === 0) return { start: m.index, end: re.lastIndex };
  }
  return null;
}

/** Position après la parenthèse ou le crochet fermant qui répond à celui de `open` (guillemets sautés pour `(`). */
function matching(src: string, open: number, o: string, c: string, quotes: boolean): number {
  let depth = 0;
  let quote = "";
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (quotes && (ch === '"' || ch === "'")) quote = ch;
    else if (ch === o) depth++;
    else if (ch === c && --depth === 0) return i + 1;
  }
  return -1;
}

const hwName = (name: string) => name.toLowerCase().replace(/[-_]/g, "");

/** Texte d'un passage en morceaux. `harlowe` : lire aussi les macros `(nom: …)` (sinon du texte entre parenthèses). */
export function tweeNodes(src: string, harlowe: boolean): Node[] {
  const nodes: Node[] = [];
  let text = "";
  const flush = () => {
    if (text) nodes.push({ k: "text", s: text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.startsWith.bind(src);
    // Commentaires : HTML, SugarCube (`/* */`), TwineScript (`/% %/`).
    const comment = rest("<!--", i) ? "-->" : rest("/*", i) ? "*/" : rest("/%", i) ? "%/" : null;
    if (comment) {
      const end = src.indexOf(comment, i + 2);
      i = end < 0 ? src.length : end + comment.length;
      continue;
    }
    if (rest("[[", i)) {
      LINK_AT.lastIndex = i;
      const m = LINK_AT.exec(src);
      if (m) {
        flush();
        nodes.push({ k: "link", inner: m[1], src: m[0] });
        i = LINK_AT.lastIndex;
        continue;
      }
    }
    if (rest("<<", i)) {
      SC_AT.lastIndex = i;
      const m = SC_AT.exec(src);
      if (m) {
        flush();
        const end = SC_AT.lastIndex;
        const name = (m[1] ? "/" : "") + m[2].toLowerCase();
        const close = m[1] || name === "=" || name === "-" ? null : sugarClose(src, end, m[2]);
        if (close) {
          nodes.push({ k: "sc", name, args: m[3].trim(), src: src.slice(i, close.end), body: src.slice(end, close.start), close: src.slice(close.start, close.end) });
          i = close.end;
        } else {
          nodes.push({ k: "sc", name, args: m[3].trim(), src: m[0] });
          i = end;
        }
        continue;
      }
    }
    if (harlowe && src[i] === "(") {
      HW_AT.lastIndex = i;
      const m = HW_AT.exec(src);
      const end = m ? matching(src, i, "(", ")", true) : -1;
      if (m && end > 0) {
        flush();
        const node: Extract<Node, { k: "hw" }> = { k: "hw", name: hwName(m[1]), args: src.slice(HW_AT.lastIndex, end - 1).trim(), src: src.slice(i, end) };
        i = end;
        // Crochet collé à la macro (`(if: $x)[…]`), mais pas un lien `[[…]]` seul.
        const gap = /^[ \t]*/.exec(src.slice(i))![0].length;
        const at = i + gap;
        if (src[at] === "[" && (!src.startsWith("[[", at) || src.startsWith("[[[", at))) {
          const close = matching(src, at, "[", "]", false);
          if (close > 0) {
            node.hook = src.slice(at + 1, close - 1);
            i = close;
          }
        }
        nodes.push(node);
        continue;
      }
    }
    text += src[i];
    i++;
  }
  flush();
  return nodes;
}

// ---------- Parcours ----------

/** Morceau de liste d'arguments SugarCube : texte entre guillemets, lien, ou autre chose (expression). */
type Arg = { str: string } | { link: string } | { other: string };
const SC_ARG = /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\[\[([\s\S]*?)\]\](?!\])|(\S+))/y;

function sugarArgs(args: string): Arg[] {
  const out: Arg[] = [];
  let i = 0;
  while (i < args.length && !/^\s*$/.test(args.slice(i))) {
    SC_ARG.lastIndex = i;
    const m = SC_ARG.exec(args);
    if (!m) break;
    i = SC_ARG.lastIndex;
    if (m[1] !== undefined || m[2] !== undefined) out.push({ str: (m[1] ?? m[2]).replace(/\\(.)/g, "$1") });
    else if (m[3] !== undefined) out.push({ link: m[3] });
    else out.push({ other: m[4] });
  }
  return out;
}

/** Arguments de Harlowe séparés par des virgules : le texte de chacun, ou null s'il n'est pas entre guillemets. */
function harloweStrings(args: string): (string | null)[] {
  return splitTop(args, ",").map((a) => /^(["'])([\s\S]*)\1$/.exec(a)?.[2] ?? null);
}

/** Une condition et son bloc `if`, pour savoir s'il faut en garder les balises. */
interface Block {
  prose: boolean;
  lossy: boolean;
  slots: number[];
}

/** Une branche d'un bloc conditionnel. */
interface Branch {
  head: string;
  cond: string | null | undefined;
  nodes: Node[];
}

/** Liens de Harlowe dont le crochet peut contenir un `(goto:)`. */
const LINK_MACROS = new Set(["link", "linkreveal", "linkrepeat", "linkrerun", "linkundo"]);

interface Ctx {
  conds: (string | null)[];
  blocks: Block[];
  /** Corps d'un lien macro : ses effets et sa cible. */
  link?: { effects: string[]; target?: string };
}

/** Ce qu'un passage donne : prose (liens marqués), choix, lignes gardées, effets d'entrée. */
export interface TweeScene {
  paragraphs: string[];
  choices: Choice[];
  /** Commentaires Ink des macros gardées telles quelles. */
  raw: string[];
  /** Effets posés par le passage lui-même : ceux du choix qui y mène. */
  entry: { effects: string[]; src: string }[];
  converted: number;
  kept: number;
}

const LABEL_OPEN = "\u0001";
const LABEL_CLOSE = "\u0002";
const SEPARATORS = /[\s|•·*\-–—]+/g;

/** Ligne de commentaire Ink pour une macro gardée (une ligne, au plus 200 caractères). */
export function rawComment(src: string): string {
  const one = src.replace(/\s+/g, " ").trim();
  return `// ${one.length > 200 ? `${one.slice(0, 199)}…` : one}`;
}

/** Lit le texte d'un passage. */
export function readPassage(body: string, harlowe: boolean): TweeScene {
  let prose = "";
  const choices: Choice[] = [];
  const seen = new Map<string, Choice>();
  const slots: (string | null)[] = [];
  const entry: TweeScene["entry"] = [];
  let converted = 0;
  let kept = 0;

  const slot = (src: string) => slots.push(rawComment(src)) - 1;
  const keep = (src: string, ctx: Ctx) => {
    slot(src);
    kept++;
    for (const b of ctx.blocks) b.lossy = true;
  };
  const addText = (s: string, ctx: Ctx) => {
    prose += s;
    if (s.replace(SEPARATORS, "")) for (const b of ctx.blocks) b.prose = true;
  };
  const condOf = (ctx: Ctx): string | undefined => {
    ctx.conds.forEach((c, n) => {
      if (c === null) ctx.blocks[n].lossy = true;
    });
    const cond = allConds(ctx.conds.filter((c): c is string => c !== null));
    return cond && parseCond(cond) ? cond : undefined;
  };
  const addChoice = (label: string, target: string, effects: string[], ctx: Ctx, shown: boolean) => {
    if (!target) return;
    const cond = condOf(ctx);
    // Le texte d'un lien entre dans la prose (« Tu peux pousser la grille ») sauf sous une condition : il n'y serait
    // pas toujours.
    if (shown && label && !ctx.conds.length) prose += `${LABEL_OPEN}${label}${LABEL_CLOSE}`;
    const key = `${label}\u0000${target}\u0000${cond ?? ""}`;
    const same = seen.get(key);
    if (same) {
      if (effects.length) same.effects = [...new Set([...(same.effects ?? []), ...effects])];
      return;
    }
    const choice: Choice = { kind: "choice", label: cleanLabel(label), target, ...(cond ? { cond } : {}), ...(effects.length ? { effects } : {}) };
    seen.set(key, choice);
    choices.push(choice);
  };
  const addEffects = (effects: string[], src: string, ctx: Ctx) => {
    if (ctx.link) {
      ctx.link.effects.push(...effects);
      converted++;
    } else if (ctx.conds.length) keep(src, ctx);
    else entry.push({ effects, src });
  };
  const goTo = (target: string, ctx: Ctx) => {
    if (ctx.link) ctx.link.target = target;
    else addChoice("", target, [], ctx, false);
    converted++;
  };

  /**
   * Un bloc conditionnel : ses branches et leurs balises. `cond` : condition lue, null si elle ne se lit pas,
   * undefined pour un `else` (seule la négation des branches d'avant compte).
   */
  const ifBlock = (branches: Branch[], close: string | null, ctx: Ctx) => {
    if (ctx.link) {
      keep(branches.map((b) => b.head).join(" ") + (close ? ` ${close}` : ""), ctx);
      return;
    }
    const block: Block = { prose: false, lossy: false, slots: [] };
    const before: (string | null)[] = [];
    for (const b of branches) {
      block.slots.push(slot(b.head));
      const parts = [...before.map((c) => (c == null ? null : negateCond(c))), ...(b.cond === undefined ? [] : [b.cond])];
      const cond = parts.some((p) => p === null) ? null : (allConds(parts as string[]) ?? null);
      walk(b.nodes, { ...ctx, conds: [...ctx.conds, cond], blocks: [...ctx.blocks, block] });
      if (b.cond !== undefined) before.push(b.cond);
    }
    if (close) block.slots.push(slot(close));
    if (block.prose || block.lossy) {
      kept++;
      for (const b of ctx.blocks) b.lossy = true;
    } else {
      converted++;
      for (const n of block.slots) slots[n] = null;
    }
  };

  /** Branches d'un `<<if>>` de SugarCube : coupées aux `<<elseif>>` et `<<else>>` de son niveau. */
  const sugarIf = (node: Extract<Node, { k: "sc" }>, ctx: Ctx) => {
    const body = node.body ?? "";
    const re = /<<\s*(\/?)\s*(if|elseif|else|endif)(?![\w-])([\s\S]*?)>>/gi;
    const branches: Branch[] = [];
    let head = `<<if ${node.args}>>`;
    let cond: string | null | undefined = twineCond(node.args);
    let from = 0;
    let depth = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      const name = m[2].toLowerCase();
      if (m[1] || name === "endif") depth--;
      else if (name === "if") depth++;
      else if (depth === 0) {
        branches.push({ head, cond, nodes: tweeNodes(body.slice(from, m.index), harlowe) });
        const args = m[3].trim();
        const elseIf = name === "elseif" || /^if\b/i.test(args);
        head = m[0];
        cond = elseIf ? twineCond(args.replace(/^if\b/i, "")) : undefined;
        from = re.lastIndex;
      }
    }
    branches.push({ head, cond, nodes: tweeNodes(body.slice(from), harlowe) });
    ifBlock(branches, node.close ?? null, ctx);
  };

  const sugar = (node: Extract<Node, { k: "sc" }>, ctx: Ctx) => {
    const { name } = node;
    if (name === "set") {
      const effects = twineEffects(node.args);
      if (effects) addEffects(effects, node.src, ctx);
      else keep(node.src, ctx);
      return;
    }
    if (name === "if" && node.body !== undefined) return sugarIf(node, ctx);
    if (name === "goto") {
      const [arg] = sugarArgs(node.args);
      const target = arg && "str" in arg ? arg.str : arg && "link" in arg ? readTweeLink(arg.link).target : "";
      if (target) goTo(target, ctx);
      else keep(node.src, ctx);
      return;
    }
    if ((name === "link" || name === "button") && node.body !== undefined && !ctx.link) {
      const args = sugarArgs(node.args);
      let label = "";
      let target: string | undefined;
      const effects: string[] = [];
      let ok = args.length > 0 && args.length <= 2 && !args.some((a) => "other" in a);
      if (ok && "link" in args[0]) {
        const l = readTweeLink(args[0].link);
        label = l.label;
        target = l.target;
        if (l.setter !== undefined) {
          const e = twineEffects(l.setter);
          if (e) effects.push(...e);
          else ok = false;
        }
      } else if (ok && "str" in args[0]) {
        label = args[0].str;
        const second = args[1];
        if (second) target = "str" in second ? second.str : "link" in second ? readTweeLink(second.link).target : undefined;
      }
      if (ok && !target && !/<<\s*goto\b/i.test(node.body)) ok = false;
      if (!ok) return keep(node.src, ctx);
      const link = { effects, target };
      walk(tweeNodes(node.body, harlowe), { ...ctx, link });
      if (!link.target) return keep(node.src, ctx);
      addChoice(label, link.target, link.effects, ctx, true);
      converted++;
      return;
    }
    if (name === "script") return keep(node.src, ctx);
    // Mise en forme sans logique : le contenu compte, la balise s'efface.
    if (name === "nobr" || name === "silently") return walk(tweeNodes(node.body ?? "", harlowe), ctx);
    // Autre macro : gardée ; le texte qu'elle enveloppe reste lu.
    if (node.body !== undefined) {
      keep(node.src.slice(0, node.src.length - node.body.length - (node.close?.length ?? 0)), ctx);
      walk(tweeNodes(node.body, harlowe), ctx);
      if (node.close) slot(node.close);
      return;
    }
    keep(node.src, ctx);
  };

  /** Macro de Harlowe ; `chain` : les `(else-if:)` et `(else:)` qui suivent un `(if:)`. */
  const harloweMacro = (node: Extract<Node, { k: "hw" }>, ctx: Ctx, chain: Extract<Node, { k: "hw" }>[]) => {
    const { name } = node;
    if (name === "set" || name === "put") {
      const effects = twineEffects(node.args, name);
      if (effects) addEffects(effects, node.src, ctx);
      else keep(node.src, ctx);
      return;
    }
    if ((name === "if" || name === "unless") && node.hook !== undefined) {
      const first = twineCond(node.args);
      const branches: Branch[] = [{ head: node.src, cond: name === "unless" && first ? negateCond(first) : first, nodes: tweeNodes(node.hook, harlowe) }];
      for (const n of chain) branches.push({ head: n.src, cond: n.name === "else" ? undefined : twineCond(n.args), nodes: tweeNodes(n.hook ?? "", harlowe) });
      ifBlock(branches, null, ctx);
      return;
    }
    const strings = harloweStrings(node.args);
    if (name === "goto") {
      const target = strings.length === 1 ? strings[0] : null;
      if (target) goTo(target, ctx);
      else keep(node.src, ctx);
      return;
    }
    if ((name === "linkgoto" || name === "clickgoto" || name === "linkrevealgoto") && !ctx.link) {
      const [a, b] = strings;
      const target = strings.length === 1 && name === "linkgoto" ? a : strings.length === 2 ? b : null;
      if (!target || (name !== "clickgoto" && a === null)) {
        keep(node.src, ctx);
        if (node.hook) walk(tweeNodes(node.hook, harlowe), ctx);
        return;
      }
      const link = { effects: [] as string[], target };
      if (node.hook) walk(tweeNodes(node.hook, harlowe), { ...ctx, link });
      // `(click-goto:)` rend cliquable un texte déjà dans la prose : il n'y est pas recopié.
      addChoice(a ?? "", link.target, link.effects, ctx, name !== "clickgoto");
      converted++;
      return;
    }
    if (LINK_MACROS.has(name) && !ctx.link && node.hook !== undefined) {
      const [label] = strings;
      if (strings.length === 1 && label !== null && /\(\s*go-?to\s*:/i.test(node.hook)) {
        const link = { effects: [] as string[], target: undefined as string | undefined };
        walk(tweeNodes(node.hook, harlowe), { ...ctx, link });
        if (link.target) {
          addChoice(label, link.target, link.effects, ctx, true);
          converted++;
          return;
        }
      }
    }
    // Autre macro : gardée ; le texte de son crochet reste lu.
    keep(node.src, ctx);
    if (node.hook) walk(tweeNodes(node.hook, harlowe), ctx);
  };

  function walk(nodes: Node[], ctx: Ctx) {
    for (let n = 0; n < nodes.length; n++) {
      const node = nodes[n];
      if (node.k === "text") addText(node.s, ctx);
      else if (node.k === "link") {
        const l = readTweeLink(node.inner);
        let effects: string[] = [];
        if (l.setter !== undefined) {
          const e = twineEffects(l.setter);
          if (e) {
            effects = e;
            converted++;
          } else keep(node.src, ctx);
        }
        if (ctx.link) {
          // Lien dans le corps d'un lien : il suffit de garder la cible.
          ctx.link.target ??= l.target;
          continue;
        }
        addChoice(l.label, l.target, effects, ctx, true);
      } else if (node.k === "sc") sugar(node, ctx);
      else {
        // Harlowe : un `(if:)` prend les `(else-if:)` et `(else:)` qui le suivent (séparés au plus par des blancs).
        const chain: Extract<Node, { k: "hw" }>[] = [];
        if ((node.name === "if" || node.name === "unless") && node.hook !== undefined) {
          let at = n + 1;
          while (at < nodes.length) {
            const next = nodes[at];
            if (next.k === "text" && !next.s.trim()) {
              at++;
              continue;
            }
            if (next.k === "hw" && (next.name === "elseif" || next.name === "else") && next.hook !== undefined) {
              chain.push(next);
              n = at;
              at++;
              if (next.name === "else") break;
              continue;
            }
            break;
          }
        }
        harloweMacro(node, ctx, chain);
      }
    }
  }

  walk(tweeNodes(body, harlowe), { conds: [], blocks: [] });

  const paragraphs: string[] = [];
  const marked = new RegExp(`${LABEL_OPEN}[^${LABEL_CLOSE}]*${LABEL_CLOSE}`, "g");
  for (const line of prose.split("\n")) {
    const hasLinks = line.includes(LABEL_OPEN);
    // Ligne faite seulement de liens (et de séparateurs) : ce sont des choix, pas du texte.
    if (hasLinks && !line.replace(marked, "").replace(SEPARATORS, "")) continue;
    const text = line.replace(new RegExp(`[${LABEL_OPEN}${LABEL_CLOSE}]`, "g"), "").replace(/[ \t]{2,}/g, " ").trim();
    if (text) paragraphs.push(text);
  }
  return { paragraphs, choices, raw: slots.filter((s): s is string => s !== null), entry, converted, kept };
}
