// « Interroger le personnage » (lot 1.8.0) : l'entretien inversé. L'auteur pose ses questions, l'IA répond à la
// première personne, dans la voix du personnage, SEULEMENT avec ce que l'auteur a écrit de lui (fiche, notes,
// réponses déjà données, fils, scènes où il paraît). Ce qu'aucun texte ne dit, le personnage ne le sait pas ou ne
// veut pas le dire : jamais un fait inventé. Fonctions pures. La consigne est recopiée dans docs/prompts-ia.md.
// Rien n'entre dans le projet sans un clic de l'auteur (« Garder », clé `i:` de `reponses`).

import type { CardData, Link } from "../types";
import type { ScreenplayElement } from "../screenplay/model";
import { plainText } from "../search";
import { CHARACTER_FIELDS, ficheText } from "../character";
import { namesOf } from "../manuscript";
import { characterName } from "../screenplay/scenes";
import { scenesWith } from "../review/filter";
import { foldName } from "../review/names";
import { questionText } from "../assistant";
import { clip, language, type Prompt } from "./tasks";

/** Échanges de la conversation renvoyés au modèle (les plus récents). */
export const INTERROGATE_HISTORY = 6;
/** Longueur de réponse demandée au service (en jetons) : une réponse courte. */
export const INTERROGATE_TOKENS = 350;
/** Longueur gardée d'une réponse, en caractères. */
export const ANSWER_MAX = 700;
/** Longueur d'une question de l'auteur. */
export const QUESTION_MAX = 300;
/** Extraits des scènes : longueur de chacun, nombre par scène, nombre de scènes, total. */
const PASSAGE = 420;
const PER_SCENE = 2;
const MAX_SCENES = 14;
const SCENES_BUDGET = 7000;
/** Une scène de scénario : son action et ses répliques, au plus. */
const SCRIPT_SCENE = 900;

export interface Exchange {
  question: string;
  answer: string;
}

export interface ScenePassages {
  /** Titre de la scène (roman) ou en-tête (scénario). */
  scene: string;
  /** Roman : paragraphes qui le nomment. Scénario : action de la scène. */
  passages?: string[];
  /** Scénario : ses répliques (didascalies comprises). */
  lines?: string[];
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Paragraphes d'un HTML d'éditeur, en texte brut. */
const paragraphs = (html: string) => (html.match(/<(p|li|h[1-6]|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [html]).map((b) => oneLine(plainText(b))).filter(Boolean);

/** Garde des scènes tant que le total tient dans le budget. */
function withinBudget(scenes: ScenePassages[]): ScenePassages[] {
  const out: ScenePassages[] = [];
  let size = 0;
  for (const s of scenes) {
    const length = JSON.stringify(s).length;
    if (out.length >= MAX_SCENES || (out.length > 0 && size + length > SCENES_BUDGET)) break;
    out.push(s);
    size += length;
  }
  return out;
}

/**
 * Roman : les passages du manuscrit qui nomment le personnage (titre, prénom, surnoms, comme la Bible), au plus
 * deux paragraphes par scène, dans l'ordre du récit, bornés.
 */
export function novelPassages(character: CardData, manuscript: Record<string, string>, order: string[], cards: Pick<CardData, "id" | "title">[]): ScenePassages[] {
  const names = namesOf(character);
  if (names.length === 0) return [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}]-?)(?:${[...names].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})(?!-?[\\p{L}\\p{N}])`, "u");
  const titleOf = new Map(cards.map((c) => [c.id, c.title.trim()]));
  const scenes: ScenePassages[] = [];
  for (const id of order) {
    const html = manuscript[id];
    if (!html) continue;
    const found = paragraphs(html).filter((p) => re.test(fold(p))).slice(0, PER_SCENE).map((p) => clip(p, PASSAGE));
    if (found.length > 0) scenes.push({ scene: titleOf.get(id) ?? "", passages: found });
  }
  return withinBudget(scenes);
}

/**
 * Scénario : les scènes où il parle ou est nommé dans l'action (même lecture que le filtre par personnage), avec
 * l'en-tête, l'action et ses propres répliques, bornées.
 */
export function screenplayPassages(character: CardData, elements: Pick<ScreenplayElement, "type" | "text">[]): ScenePassages[] {
  const names = namesOf(character);
  if (names.length === 0) return [];
  const keys = new Set(names.map(foldName));
  const headings = [...new Set(names.flatMap((n) => scenesWith(elements, n)))].sort((a, b) => a - b);
  const scenes: ScenePassages[] = [];
  for (const start of headings) {
    const passages: string[] = [];
    const lines: string[] = [];
    let speaking = false;
    let size = 0;
    for (let i = start + 1; i < elements.length && elements[i].type !== "sceneHeading"; i++) {
      const el = elements[i];
      const text = oneLine(el.text);
      if (el.type === "character") speaking = keys.has(foldName(characterName(el.text)));
      else if (el.type !== "parenthetical" && el.type !== "dialogue") speaking = false;
      if (!text || size >= SCRIPT_SCENE) continue;
      if (el.type === "action") passages.push(clip(text, 300));
      else if (speaking && (el.type === "dialogue" || el.type === "parenthetical")) lines.push(clip(text, 300));
      else continue;
      size += text.length;
    }
    scenes.push({ scene: oneLine(elements[start].text), ...(passages.length > 0 ? { passages } : {}), ...(lines.length > 0 ? { lines } : {}) });
  }
  return withinBudget(scenes);
}

/** Ce que le modèle reçoit en plus de la carte : les textes des questions (pour les réponses rangées), libellés. */
export interface InterrogateContext {
  lang: string;
  kind: "roman" | "scenario";
  /** Textes des questions de l'assistant, par clé (`allQuestionTexts`). */
  questions: Record<string, string>;
  /** Libellés des champs de la fiche, dans la langue de l'interface. */
  fieldLabels: Record<string, string>;
  arcLabels?: Record<string, string>;
  /** Scènes où il paraît (`novelPassages` ou `screenplayPassages`). */
  scenes: ScenePassages[];
}

/**
 * La consigne : répondre en personnage, à la première personne, avec seulement ce qui est écrit. `history` : les
 * échanges précédents de la conversation (les plus récents gardés), `question` : la question de l'auteur.
 */
export function interrogatePrompt(
  character: CardData,
  cards: CardData[],
  links: Pick<Link, "source" | "target" | "label">[],
  history: Exchange[],
  question: string,
  ctx: InterrogateContext,
): Prompt {
  const name = character.title.trim();
  const sheet = Object.fromEntries(
    CHARACTER_FIELDS.flatMap((key) => (key !== "principal" && character.fiche?.[key]?.trim() ? [[ctx.fieldLabels[key] ?? key, clip(ficheText(key, character.fiche[key].trim(), ctx.arcLabels), 600)]] : [])),
  );
  const answers = Object.entries(character.reponses ?? {})
    .filter(([, a]) => a.trim())
    .map(([key, a]) => ({ question: questionText(key, ctx.questions), answer: clip(a.trim(), 400) }))
    .slice(0, 30);
  const titleOf = new Map(cards.map((c) => [c.id, c]));
  // Les fils, avec leur sens : « Inès — mère de → Yann ». Seulement vers des cartes qui ont un titre.
  const related = links.flatMap((l) => {
    const out = l.source === character.id;
    const other = titleOf.get(out ? l.target : l.target === character.id ? l.source : "");
    if (!other || !other.title.trim()) return [];
    const otherName = other.title.trim();
    return [{ from: out ? name : otherName, link: oneLine(l.label ?? ""), to: out ? otherName : name, type: other.type, about: clip(oneLine(plainText(other.html)), 200) }];
  });
  const story = ctx.kind === "scenario" ? "screenplay" : "novel";
  return {
    system:
      `You are ${name || "a character"}, a character in a writer's ${story}. The writer is interviewing you to understand you better. ` +
      `Answer the writer's question in the first person, in your own voice (follow the "voice" of your sheet if there is one), in ${language(ctx.lang)}, in one to four short sentences, at most 80 words. ` +
      `Everything you know about yourself is in the material below, all written by the writer: your sheet, your notes, your earlier answers, your links to other people and places, and the scenes where you appear. Never go beyond it. ` +
      `If the material does not answer the question, say in character that you do not know, or that you would rather not say. Never invent a fact: no age, past event, place, date, name, relationship or feeling that the material does not state. Never mention a person or place whose name is not in the material. ` +
      `Do not give the writer advice, do not narrate, do not talk about yourself in the third person, never mention cards, ids or types. ` +
      `Reply with your answer only: no quotation marks, no name before it, no stage directions.`,
    user: JSON.stringify({
      you: {
        name,
        ...(Object.keys(sheet).length > 0 ? { sheet } : {}),
        notes: clip(oneLine(plainText(character.html)), 2500),
        ...(answers.length > 0 ? { earlierAnswers: answers } : {}),
      },
      links: related.slice(0, 20),
      scenes: ctx.scenes,
      conversation: history.slice(-INTERROGATE_HISTORY).map((e) => ({ writer: clip(e.question, QUESTION_MAX), you: clip(e.answer, 500) })),
      question: clip(oneLine(question), QUESTION_MAX),
    }),
  };
}

export interface Interrogation {
  /** La réponse, en texte brut, bornée. */
  text: string;
  /** Noms propres de la réponse qu'aucun texte du projet ne contient (peut-être inventés). */
  unknown: string[];
}

/** Mots qu'une majuscule ne rend pas « nom propre » (jours et mois anglais, pronom « I »). */
const COMMON = new Set(
  "i monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december ok".split(" "),
);
/** Un mot qui suit l'un de ces signes commence une phrase : sa majuscule ne dit rien. */
const STARTS = /[.!?…:;«“"(\[—–-]$/;

/**
 * Les noms propres d'un texte qui n'apparaissent nulle part dans `known` (textes du projet et de la question) :
 * un mot à majuscule qui ne commence pas une phrase. Repliés pour la comparaison, rendus tels qu'écrits.
 */
export function unknownNames(text: string, known: string): string[] {
  const corpus = ` ${fold(known).replace(/[^\p{L}\p{N}'’-]+/gu, " ")} `;
  const out: string[] = [];
  for (const m of text.matchAll(/\p{L}[\p{L}\p{M}'’-]*/gu)) {
    const word = m[0].replace(/['’-]+$/, "");
    if (!/^\p{Lu}/u.test(word)) continue;
    const before = text.slice(0, m.index).trimEnd();
    if (!before || STARTS.test(before)) continue;
    const key = fold(word);
    if (COMMON.has(key) || /^i['’]/.test(key) || word.length < 2 || (word === word.toUpperCase() && word.length <= 3)) continue;
    if (corpus.includes(` ${key} `) || out.some((w) => fold(w) === key)) continue;
    // Un nom composé (« Saint-Ouen ») est connu si chacune de ses parties l'est.
    if (key.includes("-") && key.split("-").every((part) => part.length < 2 || corpus.includes(` ${part} `))) continue;
    out.push(word);
  }
  return out.slice(0, 5);
}

/**
 * La réponse du modèle, relue : texte brut seulement (Markdown, guillemets, « Nom : », didascalie de tête
 * retirés), bornée, avec ses noms propres inconnus du projet. `known` : tout ce que le modèle a reçu.
 */
export function parseInterrogation(reply: string, character: Pick<CardData, "title">, known: string): Interrogation {
  const name = character.title.trim();
  const first = name.split(/\s+/)[0] ?? "";
  const prefixes = [name, first, "réponse", "answer", "moi", "me"].filter((p) => p.length > 0).map(escapeRe).join("|");
  const prefix = new RegExp(`^(?:${prefixes})\\s*(?:\\([^)]*\\))?\\s*[:：]\\s*`, "iu");
  const text = reply
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((l) => l.replace(/[*_`#>]+/g, "").trim())
    .filter(Boolean)
    .map((l) => l.replace(prefix, "").replace(/^\((?:[^()]{1,60})\)\s*/, "").trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  // Guillemets autour de toute la réponse.
  const unquoted = text.replace(/^(?:["“«]\s*)([\s\S]*?)(?:\s*["”»])$/u, "$1").trim();
  const bounded = bound(unquoted, ANSWER_MAX);
  return { text: bounded, unknown: bounded ? unknownNames(bounded, known) : [] };
}

/** Texte coupé à la dernière fin de phrase avant la limite (sinon au dernier mot), suivi de « … ». */
function bound(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("… "));
  if (end > max / 2) return cut.slice(0, end + 1);
  return `${clip(cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max), max)}…`;
}

/** Tout ce qui « existe » dans le projet pour la relecture : la consigne envoyée, et les titres et textes des cartes. */
export const knownText = (prompt: Prompt, cards: Pick<CardData, "title" | "html">[]) =>
  `${prompt.user} ${cards.map((c) => `${c.title} ${plainText(c.html)}`).join(" ")}`;
