// Lot IA 2 (1.9.0), « Structure et Bible » : quatre aides qui proposent sans rien écrire d'elles-mêmes. Fonctions pures.
// - Ranger les fils : des fils manquants entre cartes existantes, chacun justifié par un passage de l'auteur.
// - Une question pour une case vide du gabarit (Plan d'un roman, séquencier d'un scénario).
// - Rétro-bible : compléter les champs VIDES d'une fiche (personnage, lieu) avec ce que le texte dit déjà.
// - Dépouillement d'un scénario : accessoires, costumes, figurants, véhicules, effets, tirés des lignes d'action.
// Règle du produit : l'IA propose, l'auteur décide. Tout ce qui revient du modèle passe par un `parse…` strict :
// identifiants de cartes connus, champs permis, et chaque proposition qui s'appuie sur le texte doit citer un passage
// retrouvé dans le texte de l'auteur (`locate` de vrac.ts), sinon elle est écartée. Les consignes complètes sont
// recopiées dans docs/prompts-ia.md (section « Structure et Bible ») : les tenir à jour.

import type { CardData, CardType, Link, ProjectKind } from "../types";
import type { ScreenplayElement } from "../screenplay/model";
import { plainText } from "../search";
import { BREAKDOWN_FIELDS, isPrincipal, type BreakdownField, type SheetField } from "../character";
import { namesOf } from "../manuscript";
import { headingParts } from "../screenplay/scenes";
import { clip, extractJson, language, nameCards, nameRule, parseQuestion, type CardNames, type Prompt } from "./tasks";
import { fold, locate } from "./vrac";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const listOf = (v: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v).find(Array.isArray) : null;
  return Array.isArray(list) ? list.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
};
/** Une ligne, sans guillemets autour ni Markdown, bornée. */
const oneLine = (s: string, max: number) => {
  const line = s
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^["«“]\s*|\s*["»”]$/g, "")
    .trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};
/** Repli pour comparer deux entrées (casse, accents, ponctuation). */
const folded = (s: string) => fold(s).text;

/** Passage retrouvé dans `source` : le texte d'origine, tel que l'auteur l'a écrit, ou null. */
export function quoteIn(source: string, quote: string, max = 220): string | null {
  const q = quote.trim();
  // Un mot ou deux ne justifient rien : au moins huit lettres ou chiffres.
  if (fold(q).text.length < 8) return null;
  const where = locate(source, q);
  if (!where) return null;
  return oneLine(source.slice(where.start, where.end), max) || null;
}

/** Titre replié, pour reconnaître une carte que le modèle cite par son nom au lieu de son identifiant. */
const foldTitle = (text: string) => folded(text.replace(/\s*\([^()]*\)\s*$/, ""));

function resolver(cards: Pick<CardData, "id" | "title">[]) {
  const known = new Set(cards.map((c) => c.id));
  const byTitle = new Map<string, string>();
  for (const c of cards) {
    const key = foldTitle(c.title);
    if (key && !byTitle.has(key)) byTitle.set(key, c.id);
  }
  return (v: unknown) => {
    const s = str(v);
    if (known.has(s)) return s;
    return byTitle.get(foldTitle(s)) ?? "";
  };
}

/** Paragraphes d'un HTML d'éditeur, en texte brut. */
export function htmlParagraphs(html: string): string[] {
  return html
    .split(/<\/(?:p|li|h[1-6]|blockquote)>|<br\s*\/?>/i)
    .map((part) => plainText(part))
    .filter(Boolean);
}

/**
 * Paragraphes d'une scène de scénario : l'en-tête, chaque action, chaque réplique précédée du nom (« INÈS : … »,
 * didascalies comprises). `actionsOnly` : en-tête et actions seulement (dépouillement).
 */
export function screenplayParagraphs(elements: ScreenplayElement[], lang = "en", actionsOnly = false): string[] {
  const colon = lang.startsWith("fr") ? " :" : ":";
  const out: string[] = [];
  let speech: string[] | null = null;
  const flush = () => {
    if (speech && speech.length > 1) out.push(speech.join(" "));
    speech = null;
  };
  for (const el of elements) {
    const text = el.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (el.type === "character") {
      flush();
      if (!actionsOnly) speech = [`${text.toUpperCase()}${colon}`];
    } else if ((el.type === "dialogue" || el.type === "parenthetical") && speech) {
      speech.push(text);
    } else {
      flush();
      if (el.type === "sceneHeading" || el.type === "action") out.push(text);
    }
  }
  flush();
  return out;
}

// ---------- Ranger les fils ----------

/** Une carte telle que « Ranger les fils » la lit : son texte est titre, notes, fiche et, pour une scène, son texte. */
export interface WireCard {
  id: string;
  type: CardType;
  title: string;
  text: string;
}
export interface WireSuggestion {
  from: string;
  to: string;
  label: string;
  /** Passage de l'auteur qui justifie le fil, tel qu'il l'a écrit. */
  quote: string;
}

const WIRE_MAX_CARDS = 80;
const WIRE_TEXT = 700;
const WIRE_BUDGET = 30_000;
const WIRE_LABEL = 40;
/** Fils proposés au plus. */
export const WIRES_MAX = 30;

/** Ce que l'auteur a écrit d'une carte, en texte : titre, notes, valeurs de la fiche, texte de la scène. */
export function wireCardOf(card: CardData, sceneText = ""): WireCard {
  const sheet = Object.values(card.fiche ?? {}).filter((v) => v.trim() && v.length > 2);
  return { id: card.id, type: card.type, title: card.title.trim(), text: [plainText(card.html), ...sheet, sceneText].filter(Boolean).join("\n").trim() };
}

/** Cartes envoyées : celles qui ont un titre (un fil relie des choses nommées), texte abrégé, dans un budget. */
export function wireCandidates(cards: WireCard[]): WireCard[] {
  const kept: WireCard[] = [];
  let size = 0;
  for (const c of cards) {
    if (!c.title || c.type === "image" || c.type === "document") continue;
    const brief = { ...c, text: clip(c.text, WIRE_TEXT) };
    const length = JSON.stringify(brief).length;
    if (kept.length >= WIRE_MAX_CARDS || (kept.length > 0 && size + length > WIRE_BUDGET)) break;
    kept.push(brief);
    size += length;
  }
  return kept;
}

export function wiresPrompt(cards: WireCard[], links: Pick<Link, "source" | "target" | "label">[], lang: string, kind: ProjectKind): Prompt {
  const sent = wireCandidates(cards);
  const ids = new Set(sent.map((c) => c.id));
  return {
    system:
      `You help a writer connect the cards of a ${kind === "scenario" ? "screenplay" : "novel"}. Each card has an id, a type, a title and the writer's text. ` +
      `Find links that are missing between two cards: only when the writer's text already states the connection (for example "Inès works at the lighthouse" links Inès to the lighthouse). Never guess, never infer a link the text does not state. ` +
      `Leave out pairs that already appear in "links", in either direction. ` +
      `Give each link a short label of 1 to 4 words in ${language(lang)}, read from the first card to the second (for example: ${lang === "fr" ? "« travaille à », « frère de », « se passe à »" : '"works at", "brother of", "takes place in"'}). ` +
      `For each link, copy in "quote" the exact words of the writer's text that state it: a short continuous excerpt (5 to 25 words), copied word for word from the text of one of the two cards. ` +
      nameRule(lang) +
      `Answer with a JSON object only: {"items": [{"from": "<card id>", "to": "<card id>", "label": "<label>", "quote": "<exact excerpt>"}]}. ` +
      `Use the card ids exactly as given. At most ${WIRES_MAX} links. If no link is missing, answer {"items": []}.`,
    user: JSON.stringify({
      cards: sent,
      links: links.filter((l) => ids.has(l.source) && ids.has(l.target)).map(({ source, target, label }) => ({ source, target, label })),
    }),
  };
}

/**
 * Réponse relue : deux cartes connues et distinctes, pas déjà reliées (dans un sens ou l'autre), une seule
 * proposition par paire, et un passage retrouvé dans le texte de l'une des deux cartes (sinon écartée).
 */
export function parseWires(reply: string, cards: WireCard[], links: Pick<Link, "source" | "target">[], names?: CardNames): { items: WireSuggestion[]; rejected: number } {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const resolve = resolver(cards);
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const taken = new Set(links.map((l) => pairKey(l.source, l.target)));
  const items: WireSuggestion[] = [];
  let rejected = 0;
  for (const item of listOf(extractJson(reply))) {
    if (items.length >= WIRES_MAX) break;
    const from = resolve(item.from ?? item.source);
    const to = resolve(item.to ?? item.target);
    if (!from || !to || from === to) continue;
    const key = pairKey(from, to);
    if (taken.has(key)) continue;
    const a = byId.get(from)!;
    const b = byId.get(to)!;
    const quote = quoteIn(`${a.title}\n${a.text}`, str(item.quote)) ?? quoteIn(`${b.title}\n${b.text}`, str(item.quote));
    if (!quote) {
      rejected++;
      continue;
    }
    taken.add(key);
    const label = oneLine(str(item.label), WIRE_LABEL);
    items.push({ from, to, label: names ? nameCards(label, cards, names) : label, quote });
  }
  return { items, rejected };
}

// ---------- Une question pour une case vide du gabarit ----------

export interface BeatScene {
  id: string;
  title: string;
  synopsis: string;
}
export interface BeatRow {
  key: string;
  label: string;
  hint: string;
  scenes: BeatScene[];
}
export interface BeatContext {
  kind: ProjectKind;
  /** Nom du gabarit, dans la langue de l'interface. */
  template: string;
  beat: { label: string; hint: string };
  /** Cases voisines (deux avant, deux après), avec leurs scènes. */
  before: BeatRow[];
  after: BeatRow[];
  /** Toute la structure, en une ligne par case : nom et nombre de scènes. */
  outline: { label: string; scenes: number }[];
  characters: { id: string; title: string; about: string }[];
  logline: string;
}

const NEIGHBOURS = 2;
const NEIGHBOUR_SCENES = 6;
const MAX_CHARACTERS = 8;

/** Personnages à montrer : les principaux, sinon les premiers du projet ; ce que l'auteur en dit en une ligne. */
export function beatCharacters(cards: CardData[]): BeatContext["characters"] {
  const people = cards.filter((c) => c.type === "personnage" && c.title.trim());
  const main = people.filter(isPrincipal);
  return (main.length > 0 ? main : people).slice(0, MAX_CHARACTERS).map((c) => ({
    id: c.id,
    title: c.title.trim(),
    about: clip([c.fiche?.accroche, c.fiche?.role, c.fiche?.objectif].filter((v) => v?.trim()).join(" · ") || plainText(c.html), 240),
  }));
}

/** Contexte d'une case : ses voisines et la structure entière. Null si la case n'est pas dans `rows`. */
export function beatContext(rows: BeatRow[], key: string, rest: Pick<BeatContext, "kind" | "template" | "characters" | "logline">): BeatContext | null {
  const at = rows.findIndex((r) => r.key === key);
  if (at < 0) return null;
  const trim = (r: BeatRow): BeatRow => ({ ...r, scenes: r.scenes.slice(0, NEIGHBOUR_SCENES).map((s) => ({ ...s, synopsis: clip(s.synopsis, 300) })) });
  return {
    ...rest,
    beat: { label: rows[at].label, hint: rows[at].hint },
    before: rows.slice(Math.max(0, at - NEIGHBOURS), at).map(trim),
    after: rows.slice(at + 1, at + 1 + NEIGHBOURS).map(trim),
    outline: rows.map((r) => ({ label: r.label, scenes: r.scenes.length })),
  };
}

export function beatQuestionPrompt(ctx: BeatContext, lang: string): Prompt {
  const scenes = (rows: BeatRow[]) => rows.map((r) => ({ beat: r.label, scenes: r.scenes.map((s) => ({ title: s.title, synopsis: s.synopsis })) }));
  return {
    system:
      `You help a writer plan a ${ctx.kind === "scenario" ? "screenplay" : "novel"} with a structure template (${ctx.template}). One beat of the template has no scene yet. ` +
      `Ask ONE open question that helps the writer find what could happen in this beat, specific to this story: use the neighbouring beats, their scenes and the characters. ` +
      `Do not answer it, do not suggest a scene, do not invent facts, names or events. ` +
      nameRule(lang) +
      `Answer with a JSON object only: {"question": "<one sentence in ${language(lang)}, ending with a question mark>", "cards": ["<id of a character the question is about>"]}. "cards" may be empty.`,
    user: JSON.stringify({
      emptyBeat: ctx.beat,
      before: scenes(ctx.before),
      after: scenes(ctx.after),
      structure: ctx.outline,
      characters: ctx.characters,
      ...(ctx.logline ? { logline: clip(ctx.logline, 400) } : {}),
    }),
  };
}

/** La question et les cartes qu'elle concerne (identifiants connus, ou cartes nommées dans la question). */
export function parseBeatQuestion(reply: string, cards: Pick<CardData, "id" | "type" | "title">[], names?: CardNames): { question: string; cards: string[] } | null {
  const raw = extractJson(reply);
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const text = obj ? str(obj.question) || str(obj.text) : reply;
  const question = parseQuestion(text, cards as CardData[], names);
  if (!question || !question.includes("?")) return null;
  const resolve = resolver(cards);
  const listed = obj && Array.isArray(obj.cards) ? obj.cards.map(resolve).filter(Boolean) : [];
  // Malgré la consigne, la carte peut n'être que nommée dans la question.
  const q = folded(question);
  const named = cards.filter((c) => c.title.trim().length >= 3 && c.type !== "scene" && q.includes(folded(c.title))).map((c) => c.id);
  return { question, cards: [...new Set([...listed, ...named])].slice(0, 6) };
}

// ---------- Rétro-bible : ce que le texte dit déjà ----------

/**
 * Champs qu'une lecture du texte peut remplir : des faits, pas des interprétations (ni besoin, ni blessure, ni
 * arc), et jamais un champ à choix ou réservé (principal, type d'arc, certitude).
 */
export const RETRO_FIELDS = {
  personnage: ["role", "genre", "age", "metier", "surnoms", "origine", "apparence", "personnalite", "voix", "objectif", "peur", "secret", "relations"],
  lieu: ["epoque", "ambiance", "evenements"],
} as const satisfies Partial<Record<CardType, readonly SheetField[]>>;
export type RetroType = keyof typeof RETRO_FIELDS;
export const isRetroType = (type: CardType): type is RetroType => type in RETRO_FIELDS;

/** Champs de la fiche encore vides que la rétro-bible peut proposer. */
export function retroEmptyFields(card: Pick<CardData, "type" | "fiche">): SheetField[] {
  if (!isRetroType(card.type)) return [];
  return (RETRO_FIELDS[card.type] as readonly SheetField[]).filter((key) => !card.fiche?.[key]?.trim());
}

/** Une scène, en paragraphes : `heading` (scénario) sert à reconnaître le décor d'un lieu. */
export interface RetroScene {
  id: string;
  heading?: string;
  paragraphs: string[];
}

const hasName = (text: string, name: string) => new RegExp(`(?<![\\p{L}\\p{N}]-?)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!-?[\\p{L}\\p{N}])`, "u").test(text);
const foldWords = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Paragraphes qui parlent de cette carte, dans l'ordre du récit : ceux qui la nomment (titre, prénom, surnoms) ;
 * pour un lieu d'un scénario, aussi les premières actions des scènes dont l'en-tête est ce décor.
 */
export function retroPassages(card: CardData, scenes: RetroScene[]): string[] {
  const names = namesOf(card);
  if (names.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (p: string) => {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  for (const scene of scenes) {
    const place = card.type === "lieu" && scene.heading ? foldWords(headingParts(scene.heading).location) : "";
    const here = !!place && names.some((n) => place === n || hasName(place, n) || hasName(n, place));
    let actions = 0;
    for (const p of scene.paragraphs) {
      const f = foldWords(p);
      if (names.some((n) => hasName(f, n))) push(p);
      else if (here && actions < 3 && p !== scene.heading) {
        push(p);
        actions++;
      }
    }
  }
  return out;
}

/** Taille d'un paquet de lecture, en caractères, et nombre de paquets lus au plus pour une fiche. */
export const RETRO_PACKET = 9000;
export const RETRO_MAX_PACKETS = 6;

/** Les passages en paquets d'au plus `size` caractères (un passage trop long est abrégé, jamais coupé entre deux paquets). */
export function packets(passages: string[], size = RETRO_PACKET): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const raw of passages) {
    const p = raw.length > size ? raw.slice(0, size) : raw;
    if (current.length > 0 && length + p.length + 2 > size) {
      out.push(current.join("\n\n"));
      current = [];
      length = 0;
    }
    current.push(p);
    length += p.length + 2;
  }
  if (current.length > 0) out.push(current.join("\n\n"));
  return out;
}

export function retroPrompt(card: CardData, fields: { key: SheetField; label: string }[], packet: string, lang: string, kind: ProjectKind): Prompt {
  const what = card.type === "lieu" ? (kind === "scenario" ? "location" : "place") : "character";
  return {
    system:
      `You help a writer fill the story bible of a ${kind === "scenario" ? "screenplay" : "novel"} from what their own text already says. You read excerpts about one ${what}. ` +
      `For each field listed in "fields", give a value ONLY if the excerpts state it clearly. Never guess, never infer from hints, never invent. Leave out a field the excerpts do not state. ` +
      `A value is a short note in ${language(lang)} (a few words, at most one sentence), close to the writer's words. ` +
      `For each value, copy in "quote" the exact words of the excerpts that state it: a short continuous excerpt (5 to 30 words), copied word for word. ` +
      `Answer with a JSON object only: {"items": [{"field": "<field key>", "value": "<value>", "quote": "<exact excerpt>"}]}. Use the field keys exactly as given. If the excerpts state nothing, answer {"items": []}.`,
    user: JSON.stringify({
      [what]: card.title.trim(),
      fields: fields.map((f) => ({ key: f.key, meaning: f.label })),
      excerpts: packet,
    }),
  };
}

export interface RetroProposal {
  field: SheetField;
  value: string;
  /** Passage du texte de l'auteur qui fonde la valeur, tel qu'il l'a écrit. */
  quote: string;
}

/** Longueur d'une valeur proposée (l'âge et les champs courts tiennent sur une ligne). */
const RETRO_VALUE = 240;

/** Réponse relue : seulement les champs demandés (encore vides), une valeur bornée et une citation retrouvée dans le paquet. */
export function parseRetro(reply: string, fields: readonly SheetField[], packet: string): { items: RetroProposal[]; rejected: number } {
  const allowed = new Set<string>(fields);
  const items: RetroProposal[] = [];
  let rejected = 0;
  for (const item of listOf(extractJson(reply))) {
    const field = str(item.field) as SheetField;
    const value = oneLine(str(item.value), RETRO_VALUE);
    if (!allowed.has(field) || !value) continue;
    const quote = quoteIn(packet, str(item.quote), 260);
    if (!quote) {
      rejected++;
      continue;
    }
    items.push({ field, value, quote });
  }
  return { items, rejected };
}

/** Propositions d'un paquet ajoutées aux précédentes : au plus trois valeurs différentes par champ. */
export function mergeRetro(acc: RetroProposal[], next: RetroProposal[]): RetroProposal[] {
  const out = [...acc];
  for (const p of next) {
    const same = out.filter((x) => x.field === p.field);
    if (same.length >= 3 || same.some((x) => folded(x.value) === folded(p.value))) continue;
    out.push(p);
  }
  return out;
}

// ---------- Dépouillement d'un scénario ----------

/** Une scène à dépouiller : sa carte, son en-tête et ses lignes d'action. */
export interface BreakdownScene {
  id: string;
  heading: string;
  /** En-tête et actions, une par ligne. */
  text: string;
}

/** Entrées d'un champ de dépouillement (une par ligne). */
export const breakdownEntries = (value: string | undefined) =>
  (value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** Le champ, plus ces entrées (sans doublon, casse et accents ignorés). Même texte si rien n'est ajouté. */
export function addEntries(value: string | undefined, entries: string[]): string {
  const list = breakdownEntries(value);
  const seen = new Set(list.map(folded));
  let changed = false;
  for (const e of entries) {
    const entry = oneLine(e, 80);
    if (!entry || seen.has(folded(entry))) continue;
    seen.add(folded(entry));
    list.push(entry);
    changed = true;
  }
  return changed ? list.join("\n") : (value ?? "");
}

/** Taille d'une requête de dépouillement (plusieurs scènes à la fois) et nombre de scènes au plus par requête. */
export const BREAKDOWN_BUDGET = 8000;
const BREAKDOWN_SCENES = 12;

/** Les scènes en lots pour l'IA : une scène n'est jamais coupée entre deux lots. */
export function breakdownBatches(scenes: BreakdownScene[], budget = BREAKDOWN_BUDGET): BreakdownScene[][] {
  const out: BreakdownScene[][] = [];
  let current: BreakdownScene[] = [];
  let size = 0;
  for (const s of scenes) {
    if (!s.text.trim()) continue;
    const scene = s.text.length > budget ? { ...s, text: s.text.slice(0, budget) } : s;
    if (current.length > 0 && (size + scene.text.length > budget || current.length >= BREAKDOWN_SCENES)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(scene);
    size += scene.text.length;
  }
  if (current.length > 0) out.push(current);
  return out;
}

const BREAKDOWN_HINTS: Record<BreakdownField, string> = {
  accessoires: "props: objects handled or used by characters",
  costumes: "wardrobe: clothes, uniforms, make-up that the action describes",
  figurants: "extras: background people, crowds, unnamed passers-by (not speaking characters)",
  vehicules: "vehicles: cars, boats, bikes, aircraft",
  effets: "effects: special or visual effects, stunts, weather, fire, explosions, sound effects",
};

export function breakdownPrompt(scenes: BreakdownScene[], lang: string): Prompt {
  return {
    system:
      `You help a screenwriter break down a screenplay for production. For each scene, read its action lines and list the elements a production team must prepare, in five categories: ` +
      `${BREAKDOWN_FIELDS.map((k) => `${k} (${BREAKDOWN_HINTS[k]})`).join("; ")}. ` +
      `List only what the action lines actually mention, never what a scene might need. One element per entry, named in a few words in the language of the screenplay. ` +
      `For each entry, copy in "quote" the exact words of the scene's action lines that mention it (3 to 20 words, copied word for word). ` +
      `Answer with a JSON object only: {"items": [{"scene": "<scene id>", "category": "<category key>", "entry": "<element>", "quote": "<exact excerpt>"}]}. ` +
      `Use the scene ids and category keys exactly as given. If nothing needs preparing, answer {"items": []}. Write in ${language(lang)} only if the screenplay is in ${language(lang)}.`,
    user: JSON.stringify({ scenes: scenes.map((s) => ({ id: s.id, heading: s.heading, action: s.text })) }),
  };
}

export interface BreakdownProposal {
  scene: string;
  field: BreakdownField;
  entry: string;
  quote: string;
}

/**
 * Réponse relue : une scène de ce lot, une catégorie connue, une entrée courte qui n'est pas déjà dans la fiche
 * de la scène (ni proposée deux fois), et une citation retrouvée dans les lignes d'action de cette scène.
 */
export function parseBreakdown(reply: string, scenes: BreakdownScene[], fiches: Record<string, Record<string, string> | undefined> = {}): { items: BreakdownProposal[]; rejected: number } {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const fields = new Set<string>(BREAKDOWN_FIELDS);
  const seen = new Set<string>();
  for (const s of scenes) for (const f of BREAKDOWN_FIELDS) for (const e of breakdownEntries(fiches[s.id]?.[f])) seen.add(`${s.id}|${f}|${folded(e)}`);
  const items: BreakdownProposal[] = [];
  let rejected = 0;
  for (const item of listOf(extractJson(reply))) {
    const scene = byId.get(str(item.scene ?? item.id));
    const field = str(item.category ?? item.field) as BreakdownField;
    const entry = oneLine(str(item.entry ?? item.item), 80);
    if (!scene || !fields.has(field) || !entry) continue;
    const key = `${scene.id}|${field}|${folded(entry)}`;
    if (seen.has(key)) continue;
    const quote = quoteIn(scene.text, str(item.quote), 160);
    if (!quote) {
      rejected++;
      continue;
    }
    seen.add(key);
    items.push({ scene: scene.id, field, entry, quote });
  }
  return { items, rejected };
}

/** Dépouillement de tout le scénario, par catégorie : chaque entrée (première écriture gardée) et ses scènes, dans l'ordre. */
export function breakdownByCategory(scenes: Pick<CardData, "id" | "fiche">[], lang = "fr"): Record<BreakdownField, { entry: string; scenes: string[] }[]> {
  const out = Object.fromEntries(BREAKDOWN_FIELDS.map((f) => [f, [] as { entry: string; scenes: string[] }[]])) as Record<BreakdownField, { entry: string; scenes: string[] }[]>;
  for (const field of BREAKDOWN_FIELDS) {
    const index = new Map<string, { entry: string; scenes: string[] }>();
    for (const s of scenes) {
      for (const e of breakdownEntries(s.fiche?.[field])) {
        const key = folded(e);
        const row = index.get(key) ?? { entry: e, scenes: [] };
        if (!index.has(key)) index.set(key, row);
        if (!row.scenes.includes(s.id)) row.scenes.push(s.id);
      }
    }
    out[field] = [...index.values()].sort((a, b) => a.entry.localeCompare(b.entry, lang));
  }
  return out;
}
