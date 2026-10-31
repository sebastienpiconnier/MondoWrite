// « Du vrac aux cartes » (1.8.0) : l'auteur colle un texte en vrac (notes, compte rendu de brainstorm, dictée) et
// l'IA propose de le découper en cartes (type, titre court, passage du texte) reliées par des fils. Fonctions pures.
// Règle du produit : le texte des cartes est celui de l'auteur, découpé, jamais réécrit. La consigne l'exige et la
// relecture le garantit : chaque passage proposé est retrouvé dans le texte collé (espaces, ponctuation, casse et
// accents repliés) et c'est le passage d'origine, tel que l'auteur l'a écrit, qui entre dans la carte. Un passage
// introuvable est écarté. Seul le titre vient de l'IA. La consigne complète est recopiée dans docs/prompts-ia.md.

import type { CardData, CardType, ProjectKind } from "../types";
import { typesFor } from "../types";
import { extractJson, nameCards, type CardNames, type Prompt } from "./tasks";

/** Longueur au-delà de laquelle le texte est refusé (l'auteur le colle en plusieurs fois) : une réponse plus longue dépasserait le délai des services. */
export const VRAC_MAX = 8000;
/** Cartes proposées au plus pour un texte. */
export const VRAC_MAX_CARDS = 40;
/** Cartes existantes montrées à l'IA (titres seulement), pour qu'elle puisse y tirer des fils. */
const MAX_EXISTING = 150;
const TITLE_MAX = 80;
const LABEL_MAX = 40;

/** Types que l'IA peut proposer : ceux du projet, sauf Image, Lien et Document (ils portent un fichier ou une adresse). */
export function vracTypes(kind: ProjectKind, film = false): CardType[] {
  return typesFor(kind, false, film).filter((t) => t !== "image" && t !== "lien" && t !== "document");
}

/** Limite de longueur de la réponse : le JSON recopie le texte, il grandit avec lui. */
export const vracMaxTokens = (text: string) => Math.min(8000, 1500 + Math.ceil(text.length / 2));

const LANGUAGE: Record<string, string> = { fr: "français", en: "English" };

/** Ce que veut dire chaque type, pour la consigne (seuls ceux du projet sont nommés). */
const TYPE_HINTS: Partial<Record<CardType, string>> = {
  idee: "a loose idea that fits no other type",
  personnage: "a character",
  lieu: "a place or location",
  scene: "a scene: something that happens at a given moment, only if the text really describes one",
  intrigue: "a plot line or subplot running through several scenes",
  episode: "an episode of a series",
  groupe: "a group, family, organisation or faction",
  objet: "an object that matters to the story",
  evenement: "an event of the story world, past or offstage",
  regle: "a rule of the story world: magic, society, technology",
  secret: "a secret someone keeps",
  theme: "a theme",
  question: "an open question the writer asks themself",
};

export function vracPrompt(text: string, existing: Pick<CardData, "id" | "type" | "title">[], lang: string, kind: ProjectKind, types: CardType[]): Prompt {
  const known = existing.filter((c) => c.title.trim()).slice(0, MAX_EXISTING);
  return {
    system:
      `You help a writer turn raw notes for a ${kind === "scenario" ? "screenplay" : "novel"} (a brainstorm, a dictation, a list) into cards. ` +
      `Split the text into passages, one per card. Each card gets a type, a short title and its text. ` +
      `Types (use these keys only): ${types.map((t) => `${t} (${TYPE_HINTS[t] ?? t})`).join("; ")}. ` +
      `The "text" of a card MUST be copied word for word from the writer's text: an exact, continuous excerpt. Never rewrite, rephrase, summarise, correct, translate or complete it, and never add words. ` +
      `A passage goes in one card only. Leave out filler that belongs in no card. ` +
      `The "title" is the only thing you write: at most 6 words, in the language of the text, taken from the passage (for a character or a place, its name). ` +
      `Then suggest links between cards that the text itself connects (a character lives in a place, a secret is kept by someone), with an optional "label" of 1 to 4 words in ${LANGUAGE[lang] ?? lang}. ` +
      `A link may also point to an existing card of the project, by its "id" from the list "existing" (for example when the text names a character who already has a card); do not create a new card for something that already has one, link to it instead. ` +
      `Answer with a JSON object only: {"cards": [{"key": "n1", "type": "<type>", "title": "<title>", "text": "<exact excerpt>"}], "links": [{"from": "<key or existing id>", "to": "<key or existing id>", "label": "<label>"}]}. ` +
      `Keys are "n1", "n2"… Use existing ids exactly as given. At most ${VRAC_MAX_CARDS} cards. If nothing in the text makes a card, answer {"cards": [], "links": []}.`,
    user: JSON.stringify({ text, existing: known.map((c) => ({ id: c.id, type: c.type, title: c.title.trim() })) }),
  };
}

// ---------- Retrouver un passage dans le texte de l'auteur ----------

/** Texte replié : lettres et chiffres seuls, en minuscules, sans accents, et la place de chacun dans l'original. */
interface Folded {
  text: string;
  at: number[];
}
export function fold(text: string): Folded {
  let out = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
    for (const c of base) {
      if (/[\p{L}\p{N}]/u.test(c)) {
        out += c;
        at.push(i);
      }
    }
    i += ch.length;
  }
  return { text: out, at };
}

const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);
/** Marques de liste ou ponctuation d'ouverture qu'on reprend avec le passage quand elles le précèdent sur sa ligne. */
const LEAD_RE = /^[\t ]*(?:[-*+•]|\d{1,3}[.)])?[\t ]*["«“‘'(\[¡¿—–-]*[\t ]*$/u;

/** Bornes [début, fin) dans l'original d'un passage trouvé dans le texte replié, étendues à sa ponctuation et à sa marque de liste. */
function span(source: string, folded: Folded, from: number, to: number): { start: number; end: number } {
  let start = folded.at[from];
  let end = folded.at[to - 1] + 1;
  // Fin du dernier caractère (paire de substitution) et fin du mot.
  while (end < source.length && /[\udc00-\udfff\p{M}]/u.test(source[end])) end++;
  // Ponctuation de fin (point, guillemet fermant…), sans passer la ligne ; en français, l'espace avant « ? ! : ; »
  // et le guillemet fermant vient avec eux.
  for (;;) {
    while (end < source.length && !/\s/.test(source[end]) && !isWordChar(source[end])) end++;
    const spaced = /^[ \u00a0\u202f]+[?!:;»”…]/u.exec(source.slice(end, end + 8));
    if (!spaced) break;
    end += spaced[0].length;
  }
  // Ponctuation d'ouverture et marque de liste en tête de ligne.
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  if (LEAD_RE.test(source.slice(lineStart, start))) start = lineStart;
  else while (start > lineStart && /["«“‘'(\[¡¿]/u.test(source[start - 1])) start--;
  return { start, end };
}

const ALIGN = 24;

/** Le passage replié `want` dans `text`, à partir de `from` : tel quel, sinon de son début à sa fin. */
function find(text: string, want: string, from: number): [number, number] | null {
  const exact = text.indexOf(want, from);
  if (exact >= 0) return [exact, exact + want.length];
  if (want.length < ALIGN * 2) return null;
  const head = want.slice(0, ALIGN);
  const tail = want.slice(-ALIGN);
  for (let s = text.indexOf(head, from); s >= 0; s = text.indexOf(head, s + 1)) {
    const e = text.indexOf(tail, s + ALIGN);
    if (e < 0) break;
    const length = e + ALIGN - s;
    // Un passage d'une longueur voisine seulement : sinon ce n'est plus le même passage.
    if (length >= want.length * 0.75 && length <= want.length * 1.35) return [s, e + ALIGN];
  }
  return null;
}

/**
 * Le passage de l'auteur que l'IA a voulu recopier : là où il se trouve, tel quel ; à défaut, le passage qui va de
 * son début à sa fin (l'IA a pu changer un mot au milieu : c'est le texte d'origine qui est gardé). Null si on ne
 * le retrouve pas. `after` (position dans le texte replié) : chercher d'abord après le passage précédent, les
 * passages venant d'ordinaire dans l'ordre du texte.
 */
export function locate(source: string, excerpt: string, folded = fold(source), after = 0): { start: number; end: number; folded: number } | null {
  const want = fold(excerpt).text;
  if (!want) return null;
  const found = find(folded.text, want, after) ?? (after > 0 ? find(folded.text, want, 0) : null);
  return found ? { ...span(source, folded, found[0], found[1]), folded: found[1] } : null;
}

// ---------- Relire la réponse ----------

export interface VracCard {
  /** Clé de la proposition (« new:0 », « new:1 »…), qui sert aux fils. */
  key: string;
  type: CardType;
  title: string;
  /** Passage du texte de l'auteur, tel qu'il l'a écrit. */
  text: string;
}
export interface VracLink {
  /** Clé d'une carte proposée (« new:2 ») ou identifiant d'une carte du projet. */
  from: string;
  to: string;
  label: string;
}
export interface VracProposal {
  cards: VracCard[];
  links: VracLink[];
  /** Passages proposés que la relecture n'a pas retrouvés dans le texte (écartés). */
  rejected: number;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const oneLine = (s: string, max: number) => {
  const line = s.replace(/\s+/g, " ").replace(/^["«“]\s*|\s*["»”]$/g, "").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};
const listOf = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);

/** Titre de secours : les premiers mots du passage. */
const firstWords = (text: string) => oneLine(text.replace(/^[\s\-*+•\d.)]+/, "").split(/\s+/).slice(0, 6).join(" "), TITLE_MAX);

/**
 * Réponse de l'IA relue : seulement des types permis (un autre devient Idée, le texte reste à l'auteur), des passages
 * retrouvés dans le texte (remplacés par l'original), sans doublon, et des fils entre deux cartes connues dont une au
 * moins est proposée.
 */
export function parseVrac(reply: string, source: string, existing: Pick<CardData, "id" | "type" | "title">[], types: readonly CardType[], names?: CardNames): VracProposal {
  const raw = extractJson(reply);
  const obj = raw && typeof raw === "object" ? (Array.isArray(raw) ? { cards: raw } : (raw as Record<string, unknown>)) : {};
  const allowed = new Set(types);
  const folded = fold(source);
  const cards: VracCard[] = [];
  const keys = new Map<string, string>();
  const taken: { start: number; end: number }[] = [];
  let rejected = 0;
  let after = 0;
  for (const item of listOf(obj.cards)) {
    if (cards.length >= VRAC_MAX_CARDS) break;
    const where = locate(source, str(item.text), folded, after);
    if (!where) {
      rejected++;
      continue;
    }
    after = where.folded;
    // Le même passage proposé deux fois (ou un passage contenu dans un autre) : une seule carte.
    if (taken.some((t) => where.start >= t.start && where.end <= t.end)) continue;
    taken.push(where);
    const text = source.slice(where.start, where.end).trim();
    const type = str(item.type) as CardType;
    const key = `new:${cards.length}`;
    const given = str(item.key);
    if (given && !keys.has(given)) keys.set(given, key);
    // Sans clé, l'IA peut citer la carte par son rang (« 1 » pour la première).
    const rank = String(cards.length + 1);
    if (!keys.has(rank)) keys.set(rank, key);
    cards.push({ key, type: allowed.has(type) ? type : "idee", title: oneLine(str(item.title), TITLE_MAX) || firstWords(text), text });
  }
  const known = new Set(existing.map((c) => c.id));
  const ref = (v: unknown) => {
    const s = str(v);
    return keys.get(s) ?? (known.has(s) ? s : null);
  };
  const links: VracLink[] = [];
  const pair = new Set<string>();
  for (const item of listOf(obj.links)) {
    const from = ref(item.from ?? item.source);
    const to = ref(item.to ?? item.target);
    if (!from || !to || from === to) continue;
    // Un fil touche au moins une carte nouvelle : relier deux cartes existantes n'est pas l'objet de cette fonction.
    if (!from.startsWith("new:") && !to.startsWith("new:")) continue;
    const id = [from, to].sort().join("|");
    if (pair.has(id)) continue;
    pair.add(id);
    const label = oneLine(str(item.label), LABEL_MAX);
    links.push({ from, to, label: names ? nameCards(label, existing, names) : label });
  }
  return { cards, links, rejected };
}

/** Fils qui restent quand l'auteur décoche des cartes : un fil vers une carte décochée part avec elle. */
export function keptLinks(links: readonly VracLink[], unchecked: ReadonlySet<string>): VracLink[] {
  return links.filter((l) => !unchecked.has(l.from) && !unchecked.has(l.to));
}

// ---------- Disposition sur le canevas ----------

/**
 * Hauteur supposée d'une carte d'après la longueur de son texte (elle se replie au-delà de 220 px de texte). Au doigt,
 * les boutons de la carte passent sur une seconde ligne : `touch` réserve cette ligne.
 */
export function vracCardHeight(text: string, touch = false): number {
  const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 28)), 0);
  return Math.min(380, Math.max(170, 130 + lines * 22)) + (touch ? 56 : 0);
}

/** Grille des cartes créées : colonnes à peu près carrées (4 au plus), chaque rangée aussi haute que sa plus haute carte. */
export function vracGrid(heights: number[], width: number, gap = 24): { cells: { x: number; y: number }[]; width: number; height: number } {
  const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(heights.length))));
  const cells: { x: number; y: number }[] = [];
  let y = 0;
  for (let row = 0; row * columns < heights.length; row++) {
    const inRow = heights.slice(row * columns, row * columns + columns);
    inRow.forEach((_, i) => cells.push({ x: i * (width + gap), y }));
    y += Math.max(...inRow) + gap;
  }
  return { cells, width: columns * (width + gap) - gap, height: Math.max(0, y - gap) };
}
