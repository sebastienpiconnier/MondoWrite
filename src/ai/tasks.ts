// Ce que MondoWrite demande à l'IA, et comment il relit ses réponses. Fonctions pures.
// Règle du produit : l'IA questionne et propose, elle n'écrit jamais à la place de l'auteur.
// Quatre tâches : « Ranger » (proposer un type pour les idées en vrac), l'interview (une question sur
// mesure pour un personnage), la synthèse d'un personnage (remettre en ordre ce que l'auteur a déjà
// écrit, sans rien inventer) et les alertes de cohérence (des contradictions possibles, sous forme de questions).
// Le texte complet de chaque consigne est recopié dans docs/prompts-ia.md : le tenir à jour.

import type { CardData, CardType, Link } from "../types";
import { plainText } from "../search";
import { CHARACTER_FIELDS, ficheText } from "../character";
import { questionText, splitAnswers, type Answered } from "../assistant";

const MAX_CARDS = 80;
const MAX_TEXT = 500;

/** Texte abrégé, sans couper un caractère en deux (une moitié d'emoji seule rend la requête invalide pour Claude). */
const clip = (text: string, max = MAX_TEXT) => {
  if (text.length <= max) return text;
  const end = /[\ud800-\udbff]/.test(text[max - 1]) ? max - 1 : max;
  return `${text.slice(0, end)}…`;
};
/** Réponses de l'auteur aux questions de l'assistant (`reponses`), question en clair. */
const answersOf = (card: CardData, questions: Record<string, string>) =>
  Object.entries(card.reponses ?? {})
    .filter(([, answer]) => answer.trim())
    .map(([key, answer]) => ({ question: questionText(key, questions), answer: clip(answer.trim(), 400) }));

/**
 * Une carte telle que l'IA la lit : identifiant, type, titre, texte (abrégé), fiche d'identité et, quand on
 * donne les textes des questions, les réponses de l'auteur à l'assistant (sinon l'IA les reposerait).
 */
const brief = (card: CardData, questions?: Record<string, string>) => {
  const answers = questions ? answersOf(card, questions) : [];
  return {
    id: card.id,
    type: card.type,
    title: card.title.trim(),
    text: clip(plainText(card.html)),
    ...(card.fiche && Object.keys(card.fiche).length > 0 ? { sheet: card.fiche } : {}),
    ...(answers.length > 0 ? { answers } : {}),
  };
};

/** Nom de la langue de l'interface, pour demander la réponse dans cette langue. */
const LANGUAGE: Record<string, string> = { fr: "français", en: "English" };
const language = (lang: string) => LANGUAGE[lang] ?? lang;

export interface Prompt {
  system: string;
  user: string;
}

/** Premier tableau ou objet JSON trouvé dans une réponse (les modèles l'entourent souvent de texte ou de ```). */
export function extractJson(text: string): unknown {
  const starts = [text.indexOf("["), text.indexOf("{")].filter((i) => i >= 0).sort((a, b) => a - b);
  for (const start of starts) {
    const close = text[start] === "[" ? "]" : "}";
    for (let end = text.lastIndexOf(close); end > start; end = text.lastIndexOf(close, end - 1)) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* on essaie une fin plus proche */
      }
    }
  }
  return null;
}

/** Consigne commune : dans le texte écrit pour l'auteur, une carte se nomme par son titre et son type, jamais par son identifiant. */
const nameRule = (lang: string) =>
  `In any text you write for the writer, never mention a card id: name a card by its title followed by its type in parentheses, the type translated into ${language(lang)} (for example: Inès Morvan (${lang === "fr" ? "personnage" : "character"})). ` +
  `Card ids belong only in the JSON fields meant for them ("id", "cards"). `;

/** Libellés pour nommer une carte dans un texte : type affiché dans la langue de l'interface, titre d'une carte sans titre. */
export interface CardNames {
  type: (type: CardType) => string;
  untitled: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Un texte de l'IA où une carte serait citée par son identifiant (malgré la consigne) : chaque identifiant
 * connu devient « Titre (Type) ». Les formes usuelles autour de l'identifiant partent avec lui : guillemets,
 * crochets, parenthèses appariées, « carte », « id : », et le titre déjà écrit juste avant (« Inès (k3x…) »).
 */
export function nameCards(text: string, cards: Pick<CardData, "id" | "type" | "title">[], names: CardNames): string {
  const byId = new Map(cards.filter((c) => c.id).map((c) => [c.id, c]));
  if (byId.size === 0 || !text) return text;
  const ids = [...byId.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const id = `(${ids})`;
  const tag = `(?:(?:id|ID|Id|identifiant|identifier)\\s*:?\\s*)?`;
  const wrapped = [`\\(\\s*${tag}${id}\\s*\\)`, `\\[\\s*${tag}${id}\\s*\\]`, `"${id}"`, `“${id}”`, `«\\s*${id}\\s*»`, `'${id}'`, `’${id}’`, `\`${id}\``, `\\b${id}\\b`].join("|");
  const re = new RegExp(`(?:\\b(?:id|ID|Id|identifiant|identifier)\\s*:?\\s*)?(?:${wrapped})`, "g");
  const label = (c: Pick<CardData, "type" | "title">) => `${c.title.trim() || names.untitled} (${names.type(c.type)})`;
  return text.replace(re, (match, ...groups: unknown[]) => {
    const found = groups.slice(0, 9).find((g): g is string => typeof g === "string" && byId.has(g));
    const offset = groups[9] as number;
    const card = found ? byId.get(found) : undefined;
    if (!card) return match;
    // Titre déjà écrit juste avant : on ne le répète pas.
    const title = card.title.trim();
    const before = text.slice(0, offset).trimEnd();
    if (title && before.toLowerCase().endsWith(title.toLowerCase())) return `(${names.type(card.type)})`;
    return label(card);
  });
}

const asList = (value: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value).find(Array.isArray) : null;
  return Array.isArray(list) ? list.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
};
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// ---------- Ranger ----------

export interface TidySuggestion {
  id: string;
  type: CardType;
  reason: string;
}

/** Cartes que « Ranger » regarde : les idées en vrac qui ont un titre ou un texte. */
export const tidyCandidates = (cards: CardData[]) => cards.filter((c) => c.type === "idee" && (c.title.trim() || plainText(c.html))).slice(0, MAX_CARDS);

export function tidyPrompt(cards: CardData[], lang: string, kind: "roman" | "scenario"): Prompt {
  return {
    system:
      `You help a writer organise the notes of a ${kind === "scenario" ? "screenplay" : "novel"}. Each note is an untyped idea card. ` +
      `Suggest a type only when the note clearly is one of: personnage (a character), lieu (a place or location), scene (something that happens, a scene), intrigue (a plot line or subplot running through several scenes), theme (a theme), question (an open question the writer asks themself). ` +
      `Leave out notes that should stay plain ideas. Never rewrite, summarise or complete the writer's text. ` +
      nameRule(lang) +
      `Answer with a JSON object only: {"items": [{"id": "<card id>", "type": "<type>", "reason": "<one short sentence in ${language(lang)}>"}]}. ` +
      `Use the card ids exactly as given. If no note should change, answer {"items": []}.`,
    user: JSON.stringify(tidyCandidates(cards).map(({ id, title, html }) => ({ id, title: title.trim(), text: clip(plainText(html)) }))),
  };
}

/** Types que « Ranger » peut proposer : ceux que la consigne nomme (jamais Image, Lien ou Document, qui portent un fichier ou une adresse). */
const TIDY_TYPES: ReadonlySet<CardType> = new Set(["personnage", "lieu", "scene", "intrigue", "theme", "question"]);

export function parseTidy(reply: string, cards: CardData[], names?: CardNames): TidySuggestion[] {
  const known = new Map(tidyCandidates(cards).map((c) => [c.id, c]));
  const seen = new Set<string>();
  return asList(extractJson(reply)).flatMap((item) => {
    const id = str(item.id);
    const type = str(item.type) as CardType;
    if (!known.has(id) || seen.has(id) || !TIDY_TYPES.has(type)) return [];
    seen.add(id);
    const reason = clip(str(item.reason), 200);
    return [{ id, type, reason: names ? nameCards(reason, cards, names) : reason }];
  });
}

// ---------- Interview ----------

/** Une question sur mesure pour ce personnage, d'après sa fiche et les cartes qui lui sont reliées. */
export function interviewPrompt(
  character: CardData,
  cards: CardData[],
  links: Pick<Link, "source" | "target" | "label">[],
  lang: string,
  avoid: string[] = [],
  questions: Record<string, string> = {},
): Prompt {
  const related = links.flatMap((l) => {
    const other = l.source === character.id ? l.target : l.target === character.id ? l.source : null;
    const card = other ? cards.find((c) => c.id === other) : undefined;
    return card ? [{ ...brief(card), link: l.label }] : [];
  });
  return {
    system:
      `You are an interviewer helping a writer discover a character. Ask ONE open question, specific to what the notes say, that the notes do not answer yet. ` +
      `Do not answer it, do not suggest answers, do not invent facts about the character. ` +
      nameRule(lang) +
      `No preamble, no quotation marks: reply with the question only, in ${language(lang)}, in one sentence.`,
    // Déjà posées : celles de la session et celles auxquelles l'auteur a répondu.
    user: JSON.stringify({
      character: { ...brief(character, questions), text: clip(plainText(character.html), 2500) },
      related: related.slice(0, 20),
      alreadyAsked: [...new Set([...answersOf(character, questions).map((a) => a.question), ...avoid])].slice(-24),
    }),
  };
}

/** La question, débarrassée de ce que les modèles ajoutent autour (guillemets, « Question : », lignes en trop). */
export function parseQuestion(reply: string, cards: CardData[] = [], names?: CardNames): string {
  if (names && cards.length > 0) reply = nameCards(reply, cards, names);
  const line = reply.split("\n").map((l) => l.trim()).filter(Boolean).find((l) => l.includes("?")) ?? reply.trim().split("\n")[0] ?? "";
  return clip(line.replace(/^[-*\d.\s]*(question\s*:)?\s*/i, "").replace(/^["«“]\s*|\s*["»”]$/g, "").trim(), 300);
}

// ---------- Synthèse d'un personnage ----------

/**
 * Remettre en ordre ce que l'auteur a écrit d'un personnage (fiche, notes, réponses aux questions) en un
 * court portrait. L'IA ne doit rien ajouter : chaque phrase vient de ce qui est écrit. Le résultat est
 * proposé à l'auteur, qui l'ajoute à la fiche ou l'ignore.
 */
export function synthesisPrompt(character: CardData, cards: CardData[], links: Pick<Link, "source" | "target" | "label">[], lang: string, fieldLabels: Record<string, string>, arcLabels?: Record<string, string>, stored: Answered[] = []): Prompt {
  const related = links.flatMap((l) => {
    const other = l.source === character.id ? l.target : l.target === character.id ? l.source : null;
    const card = other ? cards.find((c) => c.id === other) : undefined;
    return card && card.title.trim() ? [{ title: card.title.trim(), type: card.type, link: l.label }] : [];
  });
  const sheet = Object.fromEntries(CHARACTER_FIELDS.flatMap((key) => (character.fiche?.[key]?.trim() ? [[fieldLabels[key] ?? key, ficheText(key, character.fiche[key].trim(), arcLabels)]] : [])));
  // Les réponses aux questions de l'assistant, à part : noyées dans les notes, un petit modèle les ignorait.
  const split = splitAnswers(character.html);
  const notes = split.notes;
  // Réponses rangées dans la carte (questions en clair), puis celles restées dans le texte (projets d'avant).
  const answers = [...stored, ...split.answers];
  return {
    system:
      `You help a writer see their character clearly. Write a synthesis of the character from three sources written by the writer: "sheet" (standard traits), "answers" (the writer's answers to interview questions about the character) and "notes". ` +
      `The answers are the richest source: use every one of them, they must all be reflected in the synthesis. ` +
      `Use ONLY what these sources say. Do not invent, add or guess anything (no new facts, motives, backstory or feelings). Do not judge or advise. Keep the writer's own words where you can. ` +
      `Structure: one short paragraph per aspect that the sources actually cover (who they are, what they want and what stops them, their inner life and secrets, their relationships, how they change). Skip aspects the sources do not cover. ` +
      `If two statements contradict each other, end with one line starting with "?" that asks the writer which is right. ` +
      `Plain text, no title, no lists, no Markdown, in ${language(lang)}, third person, present tense, at most 220 words.`,
    user: JSON.stringify({
      name: character.title.trim(),
      sheet,
      answers: answers.map((a) => ({ question: a.question, answer: clip(a.answer, 1200) })).slice(0, 40),
      notes: clip(notes, 4000),
      related: related.slice(0, 30),
    }),
  };
}

/** Paragraphes de la synthèse, débarrassés de ce que les modèles ajoutent (titre, Markdown, guillemets). */
export function parseSynthesis(reply: string): string[] {
  return reply
    .split(/\n+/)
    .map((l) => l.replace(/^#+\s*/, "").replace(/^\*\*(.+)\*\*$/, "$1").replace(/[*_`]/g, "").trim())
    .filter((l) => l && !/^(synth[eè]se|summary|portrait)\s*:?$/i.test(l))
    .map((l) => clip(l, 1200))
    .slice(0, 8);
}

// ---------- Décrire un lieu d'après une photo ----------

/**
 * L'auteur demande, pour un lieu, ce que montre une photo qu'il a choisie comme référence. L'IA ne fait que
 * relever ce qui est visible, en notes courtes : pas de prose à coller, pas d'histoire, pas de nom inventé.
 * Proposé, jamais ajouté sans un clic de l'auteur.
 */
export function describePlacePrompt(place: CardData, lang: string): Prompt {
  return {
    system:
      `You help a writer build a place for their story from a reference photo they chose. Look at the photo and note only what is visible or directly suggested by it: ` +
      `the setting, light and time of day, colours, materials and textures, weather, the sounds and smells the scene suggests, the overall atmosphere. ` +
      `Do not invent events, characters, names or history, and do not write story prose: these are notes for the writer, not text for the book. ` +
      `Answer with 5 to 8 short lines, each starting with "- ", in ${language(lang)}, at most 120 words in total.`,
    user: JSON.stringify({ place: place.title.trim(), notes: clip(plainText(place.html), 800) }),
  };
}

/** Les notes de la description : des lignes courtes, débarrassées des puces et du Markdown. */
export function parseNotes(reply: string): string[] {
  return reply
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/[*_`#]/g, "").trim())
    .filter((l) => l.length > 1)
    .map((l) => clip(l, 300))
    .slice(0, 10);
}

// ---------- Décrire une image (carte Image, Lien, Document, Scène…) ----------

/** Même règle que pour un lieu : ce que montre l'image, en notes, rien d'inventé. Pour toute autre carte. */
export function describeImagePrompt(card: CardData, lang: string): Prompt {
  return {
    system:
      `You help a writer who keeps reference images for their story. Look at the image and note only what is visible: ` +
      `what it shows, the setting, light, colours, materials, mood, and any text written in it. ` +
      `Do not invent events, names or history, do not identify real people, and do not write story prose: these are notes for the writer. ` +
      `Answer with 4 to 8 short lines, each starting with "- ", in ${language(lang)}, at most 120 words in total.`,
    user: JSON.stringify({ card: card.title.trim(), notes: clip(plainText(card.html), 800) }),
  };
}

// ---------- Photo d'un personnage : de quoi remplir sa fiche ----------

/** Champs de la fiche d'un personnage qu'une photo peut nourrir. */
export const PHOTO_FIELDS = ["age", "apparence"] as const;
export type PhotoField = (typeof PHOTO_FIELDS)[number];

export interface CharacterPhoto {
  /** Propositions pour la fiche (âge apparent, apparence), à accepter une à une. */
  fields: Partial<Record<PhotoField, string>>;
  /** Autres remarques (expression, style, allure), à ajouter au texte si l'auteur le veut. */
  notes: string[];
}

/**
 * L'auteur a choisi une photo comme référence pour un personnage : l'IA propose l'âge apparent et
 * l'apparence pour sa fiche, et quelques notes. Seulement ce qui se voit : jamais qui est la personne
 * (une photo peut montrer quelqu'un de réel), jamais d'origine, de religion, de santé ou d'orientation
 * devinées, jamais de caractère déduit d'un visage. Proposé, jamais écrit sans un clic de l'auteur.
 */
export function describeCharacterPrompt(character: CardData, lang: string): Prompt {
  return {
    system:
      `You help a writer build a fictional character from a reference photo they chose. Describe only what is visible, as a writer's notes, in ${language(lang)}. ` +
      `Never say who the person is, even if they look famous, and never guess ethnicity, religion, health, disability or sexual orientation. ` +
      `Do not infer personality from the face, do not invent a backstory, and do not write story prose. ` +
      `Answer with a JSON object only: {"fields": {"age": "<apparent age as a range, for example: the thirties>", "apparence": "<one or two sentences: build, hair, face, clothing, posture, what you notice first>"}, "notes": ["<short line>", ...]}. ` +
      `"notes" holds 0 to 5 short lines about expression, style and overall impression. Leave out a field you cannot tell from the photo.`,
    user: JSON.stringify({ character: character.title.trim(), notes: clip(plainText(character.html), 800) }),
  };
}

/** Réponse de l'IA pour une photo de personnage : seuls les champs prévus, textes bornés, rien d'autre. */
export function parseCharacterPhoto(reply: string): CharacterPhoto {
  const raw = extractJson(reply);
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const given = obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields) ? (obj.fields as Record<string, unknown>) : {};
  const fields: Partial<Record<PhotoField, string>> = {};
  for (const key of PHOTO_FIELDS) {
    const value = clip(str(given[key]).replace(/[*_`#]/g, ""), key === "age" ? 60 : 400);
    if (value) fields[key] = value;
  }
  const notes = (Array.isArray(obj.notes) ? obj.notes : [])
    .map((n) => clip(str(n).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/[*_`#]/g, ""), 300))
    .filter((n) => n.length > 1)
    .slice(0, 5);
  return { fields, notes };
}

// ---------- Cohérence ----------

export interface CoherenceAlert {
  /** Cartes concernées (une ou plusieurs). */
  cards: string[];
  /** La contradiction possible, formulée comme une question à l'auteur. */
  question: string;
}

/** Cartes de la bible d'abord (ce qui peut se contredire), puis le reste ; images, liens et documents en dernier. */
const COHERENCE_ORDER: CardType[] = ["personnage", "lieu", "evenement", "scene", "intrigue", "episode", "groupe", "objet", "regle", "secret", "theme", "idee", "question"];
const coherenceRank = (type: CardType) => {
  const i = COHERENCE_ORDER.indexOf(type);
  return i < 0 ? COHERENCE_ORDER.length : i;
};
/** Taille du projet envoyé, en caractères : tient dans la fenêtre de contexte d'un modèle local (OLLAMA_CONTEXT). */
const COHERENCE_BUDGET = 30_000;
const SCENE_TEXT = 900;

/**
 * Consigne de cohérence. `sceneTexts` donne le texte d'une carte Scène (synopsis et début du manuscrit ou du
 * scénario) : depuis octobre 2026 le corps d'une carte Scène est vide, son texte vit dans le manuscrit.
 */
export function coherencePrompt(
  cards: CardData[],
  links: Pick<Link, "source" | "target" | "label">[],
  lang: string,
  sceneTexts: Record<string, string> = {},
  questions: Record<string, string> = {},
): Prompt {
  const briefs = cards
    .map((card, index) => {
      const b = brief(card, questions);
      const own = card.type === "scene" ? sceneTexts[card.id]?.replace(/\s+/g, " ").trim() : "";
      return { index, rank: coherenceRank(card.type), b: own ? { ...b, text: clip([b.text, own].filter(Boolean).join(" "), SCENE_TEXT) } : b };
    })
    .filter(({ b }) => b.title || b.text || b.sheet || b.answers)
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const kept: ReturnType<typeof brief>[] = [];
  let size = 0;
  for (const { b } of briefs) {
    const length = JSON.stringify(b).length;
    if (kept.length >= MAX_CARDS || (kept.length > 0 && size + length > COHERENCE_BUDGET)) break;
    kept.push(b);
    size += length;
  }
  const ids = new Set(kept.map((c) => c.id));
  return {
    system:
      `You are a continuity reader for a writer's story bible. Find statements in the notes that contradict each other (ages, dates, places, relationships, who knows what, physical details). ` +
      `Report only real contradictions between what is written, never missing information, style, or opinions. Do not propose fixes and do not rewrite anything: phrase each one as a short question to the writer, in ${language(lang)}. ` +
      nameRule(lang) +
      `Answer with a JSON object only: {"items": [{"cards": ["<id>", "<id>"], "question": "<question>"}]}, where "cards" lists the ids of the cards involved, exactly as given. If nothing contradicts, answer {"items": []}.`,
    user: JSON.stringify({ cards: kept, links: links.filter((l) => ids.has(l.source) && ids.has(l.target)).map(({ source, target, label }) => ({ source, target, label })) }),
  };
}

/** Titre replié (casse, accents, type entre parenthèses retiré), pour reconnaître une carte citée par son nom. */
const foldTitle = (text: string) =>
  text
    .replace(/\s*\([^()]*\)\s*$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .trim()
    .toLowerCase();

export function parseCoherence(reply: string, cards: CardData[], names?: CardNames): CoherenceAlert[] {
  const known = new Set(cards.map((c) => c.id));
  // Malgré la consigne, un modèle donne souvent le titre de la carte (« Inès (personnage) ») au lieu de son identifiant.
  const byTitle = new Map<string, string>();
  for (const c of cards) {
    const key = foldTitle(c.title);
    if (key && !byTitle.has(key)) byTitle.set(key, c.id);
  }
  const resolve = (value: unknown): string => {
    const text = typeof value === "string" ? value.trim() : value && typeof value === "object" ? str((value as Record<string, unknown>).id) || str((value as Record<string, unknown>).title) : "";
    if (known.has(text)) return text;
    return byTitle.get(foldTitle(text)) ?? "";
  };
  return asList(extractJson(reply))
    .flatMap((item) => {
      const listed = item.cards ?? item.ids ?? item.card ?? item.id;
      const raw = clip(str(item.question) || str(item.text) || str(item.issue), 400);
      let ids = [...new Set((Array.isArray(listed) ? listed : [listed]).map(resolve).filter(Boolean))];
      // Aucune carte reconnue : celles que la question nomme par leur titre.
      if (ids.length === 0 && raw) {
        const folded = foldTitle(raw);
        ids = cards.filter((c) => c.title.trim().length >= 3 && folded.includes(foldTitle(c.title))).map((c) => c.id);
      }
      const question = names ? nameCards(raw, cards, names) : raw;
      return ids.length > 0 && question ? [{ cards: ids, question }] : [];
    })
    .slice(0, 12);
}
