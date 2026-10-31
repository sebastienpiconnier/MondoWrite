// Assistant personnage : des questions rangées par thème, pour creuser une fiche. Fonctions pures.
// L'assistant questionne, l'auteur écrit. Deux chemins vers les mêmes données : une question liée à un
// champ de la fiche (« Que veut ce personnage ? » → Veut) remplit ce champ ; les autres réponses vont dans
// `reponses` (frontmatter de la carte), montrées repliées dans la Bible. « Je ne sais pas encore » range la
// question dans la carte (champ `questions`), sans rien poser sur le canevas.

import type { CardData, Link } from "./types";
import type { CharacterField } from "./character";

export const ASSISTANT_LEVELS = ["essentiel", "approfondi", "intime"] as const;
export type AssistantLevel = (typeof ASSISTANT_LEVELS)[number];

/** Questions de chaque niveau : clés des textes (`t.assistant.questions`). */
export const ASSISTANT_QUESTIONS = {
  essentiel: ["want", "obstacle", "role", "look", "voice", "strength", "flaw", "change"],
  approfondi: ["need", "past", "secret", "fear", "relation", "habit", "contradiction", "work"],
  intime: ["shame", "loss", "lie", "limit", "joy", "night", "regret", "last"],
} as const satisfies Record<AssistantLevel, readonly string[]>;

export type AssistantQuestion = (typeof ASSISTANT_QUESTIONS)[AssistantLevel][number];

/**
 * Questions par thème. Les textes viennent de `t.assistant.questions` (questions d'origine, par clé) et de
 * `t.assistant.themeQuestions` (clé `<thème>.<rang>`). Questions écrites pour MondoWrite, ouvertes, une à la fois.
 * Ne pas reformuler une question livrée, ni retirer une question du milieu d'une liste de `themeQuestions`
 * (les rangs suivants changeraient de clé) : pour en écarter une, la retirer de THEME_KEYS.
 */
export const THEMES = ["essentiel", "passe", "corps", "voix", "travail", "emotions", "colere", "relations", "espoirs", "pensee", "ombres"] as const;
export type Theme = (typeof THEMES)[number];
/** Thèmes dont les textes sont dans `t.assistant.themeQuestions` (tous sauf « essentiel »). */
export const ASSISTANT_THEMES = ["passe", "corps", "voix", "travail", "emotions", "colere", "relations", "espoirs", "pensee", "ombres"] as const;
export type AssistantTheme = (typeof ASSISTANT_THEMES)[number];

const range = (theme: AssistantTheme, ranks: number[]) => ranks.map((i) => `${theme}.${i}`);

/**
 * Les questions de chaque thème, sans doublon : les questions d'origine (niveaux Essentiel, Approfondi,
 * Intime d'avant) sont rangées dans le thème qui leur correspond, et une question de thème qui les
 * répétait est écartée (passe.4, voix.0, emotions.3, relations.0, pensee.4).
 */
export const THEME_KEYS: Record<Theme, readonly string[]> = {
  essentiel: ["want", "need", "obstacle", "role", "look", "strength", "flaw", "change", "hook"],
  passe: ["past", "loss", "regret", ...range("passe", [0, 1, 2, 3, 5, 6])],
  corps: range("corps", [0, 1, 2, 3, 4, 5]),
  voix: ["voice", ...range("voix", [1, 2, 3, 4, 5, 6])],
  travail: ["work", "habit", ...range("travail", [0, 1, 2, 3, 4, 5])],
  emotions: ["fear", "night", ...range("emotions", [0, 1, 2, 4, 5, 6])],
  colere: range("colere", [0, 1, 2, 3, 4, 5]),
  relations: ["relation", ...range("relations", [1, 2, 3, 4, 5, 6])],
  espoirs: ["joy", "last", ...range("espoirs", [0, 1, 2, 3, 4, 5, 6])],
  pensee: ["contradiction", "lie", ...range("pensee", [0, 1, 2, 3, 5])],
  ombres: ["secret", "shame", "limit", ...range("ombres", [0, 1, 2, 3, 4, 5])],
};

/** Clés des questions d'un thème de `themeQuestions`, d'après le nombre de textes de la langue courante. */
export const themeKeys = (theme: AssistantTheme, texts: Record<AssistantTheme, readonly string[]>) => texts[theme].map((_, i) => `${theme}.${i}`);

/** Textes à plat, par clé (`passe.0`…), pour `bankQuestions`. */
export const flatThemeTexts = (texts: Record<AssistantTheme, readonly string[]>): Record<string, string> =>
  Object.fromEntries(ASSISTANT_THEMES.flatMap((theme) => texts[theme].map((text, i) => [`${theme}.${i}`, text])));

/** Tous les textes de questions d'une langue, par clé. */
export const allQuestionTexts = (a: { questions: Record<string, string>; themeQuestions: Record<AssistantTheme, readonly string[]> }): Record<string, string> => ({
  ...a.questions,
  ...flatThemeTexts(a.themeQuestions),
});

/**
 * Champ de la fiche auquel répond une question : y répondre remplit ce champ, et un champ rempli (à la
 * main ou par une réponse) rend la question « répondue ». Un seul champ par question, et inversement.
 */
export const QUESTION_FIELD: Partial<Record<string, CharacterField>> = {
  want: "objectif",
  need: "besoin",
  past: "blessure",
  voice: "voix",
  strength: "force",
  flaw: "faille",
  fear: "peur",
  secret: "secret",
  role: "role",
  look: "apparence",
  change: "arc",
  relation: "relations",
  // Bible v2 : la réponse de l'auteur devient l'accroche, telle qu'il l'a écrite (l'IA ne l'écrit jamais).
  hook: "accroche",
}

/** Champ où reporter une réponse, s'il existe et qu'il est encore vide. */
export function fieldToFill(key: string | null | undefined, character: Pick<CardData, "fiche">): CharacterField | null {
  const field = key ? QUESTION_FIELD[key] : undefined;
  return field && !character.fiche?.[field]?.trim() ? field : null;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Texte ajouté à la fiche pour une réponse : la question en gras, puis un paragraphe par ligne de réponse. */
export function answerHtml(question: string, answer: string): string {
  const lines = answer.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";
  return `<p><strong>${escape(question)}</strong></p>${lines.map((l) => `<p>${escape(l)}</p>`).join("")}`;
}

/** Fiche complétée par une réponse. Même chaîne si la réponse est vide. */
export function appendAnswer(html: string, question: string, answer: string): string {
  const added = answerHtml(question, answer);
  if (!added) return html;
  return `${html === "<p></p>" ? "" : html}${added}`;
}

/** La fiche répond déjà à cette question (elle y figure en gras, telle qu'elle a été posée). */
export const isAnswered = (html: string, question: string) =>
  html.replace(/[\u00a0\u202f]/g, " ").includes(`<strong>${escape(question).replace(/[\u00a0\u202f]/g, " ")}</strong>`);

/** Titre de la carte Question créée par « Je ne sais pas encore ». */
export const parkedTitle = (name: string, question: string) => (name.trim() ? `${name.trim()} : ${question}` : question);

/**
 * La question attend déjà : dans la carte du personnage (champ `questions`) ou, pour les projets
 * d'avant, dans une carte Question reliée au personnage.
 */
export function isParked(cards: CardData[], links: Pick<Link, "source" | "target">[], characterId: string, question: string): boolean {
  const fold = (t: string) => t.replace(/\s+/g, " ").trim();
  const q = fold(question);
  if (cards.find((c) => c.id === characterId)?.questions?.some((x) => fold(x) === q)) return true;
  const linked = new Set(links.flatMap((l) => (l.source === characterId ? [l.target] : l.target === characterId ? [l.source] : [])));
  return cards.some((c) => c.type === "question" && linked.has(c.id) && fold(c.title).endsWith(q));
}

export type QuestionState = "open" | "answered" | "parked";

export interface AskedQuestion {
  key: string;
  text: string;
  state: QuestionState;
}

/** Les questions d'un niveau pour ce personnage, avec leur état. `texts` : libellés dans la langue courante. */
export function levelQuestions(
  level: AssistantLevel,
  texts: Record<string, string>,
  character: CardData,
  cards: CardData[],
  links: Pick<Link, "source" | "target">[],
): AskedQuestion[] {
  return bankQuestions(ASSISTANT_QUESTIONS[level], texts, character, cards, links);
}

/** Des questions (par clé) pour ce personnage, avec leur état. Sert aux niveaux comme aux thèmes. */
export function bankQuestions(
  keys: readonly string[],
  texts: Record<string, string>,
  character: CardData,
  cards: CardData[],
  links: Pick<Link, "source" | "target">[],
): AskedQuestion[] {
  return keys.filter((key) => texts[key]).map((key) => {
    const text = texts[key];
    const state: QuestionState = hasAnswer(character, key, text) ? "answered" : isParked(cards, links, character.id, text) ? "parked" : "open";
    return { key, text, state };
  });
}

/** Clé d'une réponse à une question hors de la banque (question sur mesure, posée par l'IA). */
export const customKey = (question: string) => `q:${question.trim()}`;

/** Une réponse existe : champ lié rempli, réponse rangée, ou (projets d'avant) question en gras dans le texte. */
export function hasAnswer(character: Pick<CardData, "html" | "fiche" | "reponses">, key: string, text: string): boolean {
  const field = QUESTION_FIELD[key];
  if (field && character.fiche?.[field]?.trim()) return true;
  if (character.reponses?.[key]?.trim()) return true;
  return isAnswered(character.html, text);
}

/**
 * Où va une réponse : le champ lié s'il est vide (la fiche se remplit), sinon `reponses`.
 * Rend le changement à appliquer à la carte, ou null si la réponse est vide.
 */
export function placeAnswer(card: Pick<CardData, "fiche" | "reponses">, key: string, answer: string): { fiche?: Record<string, string>; reponses?: Record<string, string> } | null {
  const text = answer.trim();
  if (!text) return null;
  const field = QUESTION_FIELD[key];
  if (field && !card.fiche?.[field]?.trim()) return { fiche: { ...(card.fiche ?? {}), [field]: text } };
  return { reponses: { ...(card.reponses ?? {}), [key]: text } };
}

/** Réponses lues sur disque : des textes non vides, sous des clés sûres. */
export function readReponses(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim() && key.length <= 400 && !/[\n\r]/.test(key)) out[key] = value.slice(0, 6000);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Clé d'une réponse gardée depuis « Interroger le personnage » : `i:` + la question de l'auteur, sur une ligne
 * (une clé de `reponses` ne contient pas de retour et reste courte, voir `readReponses`).
 */
export const interviewKey = (question: string) => `i:${question.replace(/\s+/g, " ").trim().slice(0, 380)}`;
/** La réponse vient de l'entretien inversé (dite par le personnage, gardée par l'auteur). */
export const isInterviewKey = (key: string) => key.startsWith("i:");

/** Texte d'une question d'après sa clé (banque de la langue courante, question sur mesure `q:` ou de l'auteur `i:`). */
export const questionText = (key: string, texts: Record<string, string>) => texts[key] ?? (key.startsWith("q:") || key.startsWith("i:") ? key.slice(2) : key);

/**
 * Projets d'avant : les réponses écrites dans le texte (la question en gras, la réponse dessous) quittent
 * le texte pour `reponses`, quand la question est connue (dans une des langues). Le texte libre reste.
 * Rend le même HTML et `null` quand il n'y a rien à reprendre.
 */
export function extractAnswers(html: string, keyOf: (text: string) => string | undefined): { html: string; reponses: Record<string, string> } | null {
  if (!/<strong>/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const nodes = Array.from(doc.body.children);
  const reponses: Record<string, string> = {};
  const remove: Element[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const strong = el.tagName === "P" && el.children.length === 1 && el.firstElementChild?.tagName === "STRONG" && el.textContent?.trim() === el.firstElementChild.textContent?.trim();
    const key = strong ? keyOf((el.textContent ?? "").replace(/\s+/g, " ").trim()) : undefined;
    if (!key) continue;
    const parts: string[] = [];
    let j = i + 1;
    for (; j < nodes.length; j++) {
      const next = nodes[j];
      const nextStrong = next.tagName === "P" && next.children.length === 1 && next.firstElementChild?.tagName === "STRONG" && (next.textContent ?? "").trim().endsWith("?");
      if (nextStrong || /^H[1-6]$/.test(next.tagName)) break;
      const text = (next.textContent ?? "").trim();
      if (text) parts.push(text);
    }
    if (parts.length === 0) continue;
    reponses[key] = reponses[key] ? `${reponses[key]}\n${parts.join("\n")}` : parts.join("\n");
    remove.push(...nodes.slice(i, j));
    i = j - 1;
  }
  if (remove.length === 0) return null;
  for (const el of remove) el.remove();
  return { html: doc.body.innerHTML, reponses };
}

/** Prochaine question ouverte après `after` (en boucle), ou null si le niveau est fait. */
export function nextOpen(questions: AskedQuestion[], after: string | null): AskedQuestion | null {
  const start = after ? questions.findIndex((q) => q.key === after) + 1 : 0;
  for (let i = 0; i < questions.length; i++) {
    const q = questions[(start + i) % questions.length];
    if (q.state === "open") return q;
  }
  return null;
}

export interface Answered {
  question: string;
  answer: string;
}

const unescape = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "’").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const textOf = (html: string) => unescape(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/**
 * Le texte d'une fiche séparé en deux : les notes libres, et les réponses aux questions de l'assistant
 * (un paragraphe tout en gras qui finit par « ? », suivi des paragraphes de réponse jusqu'au gras suivant).
 */
export function splitAnswers(html: string): { notes: string; answers: Answered[] } {
  const blocks = html.match(/<(p|h[1-6]|li|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? [];
  const notes: string[] = [];
  const answers: Answered[] = [];
  let current: Answered | null = null;
  for (const block of blocks) {
    const question = block.match(/^<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>$/i);
    const asked = question ? textOf(question[1]) : "";
    if (asked.endsWith("?")) {
      current = { question: asked, answer: "" };
      answers.push(current);
      continue;
    }
    const text = textOf(block);
    if (!text) continue;
    if (current) current.answer = current.answer ? `${current.answer}\n${text}` : text;
    else notes.push(text);
  }
  return { notes: notes.join("\n"), answers: answers.filter((a) => a.answer) };
}
