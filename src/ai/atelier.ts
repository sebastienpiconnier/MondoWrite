// Mode Atelier (1.8.0) : ce que MondoWrite demande à l'IA quand l'auteur l'autorise, pour ce projet, à proposer
// du texte, et comment il relit ses réponses. Fonctions pures. Rien n'entre dans le projet sans un clic de
// l'auteur ; ce qu'il accepte est marqué et journalisé (atelier.ts). Toute réponse est relue en texte brut :
// jamais de HTML, jamais de Markdown, des longueurs bornées.
// Le texte complet de chaque consigne est recopié dans docs/prompts-ia.md (« Mode Atelier ») : le tenir à jour.

import type { CardData } from "../types";
import { plainText } from "../search";
import { extractJson, type Prompt } from "./tasks";

const LANGUAGE: Record<string, string> = { fr: "French", en: "English" };
const language = (lang: string) => LANGUAGE[lang] ?? lang;

/** Texte abrégé, sans couper un caractère en deux. */
const clip = (text: string, max: number) => {
  if (text.length <= max) return text;
  const end = /[\ud800-\udbff]/.test(text[max - 1]) ? max - 1 : max;
  return `${text.slice(0, end)}…`;
};
/** Fin d'un texte (la suite d'une scène se décide sur ses dernières lignes). */
const tail = (text: string, max: number) => (text.length <= max ? text : `…${text.slice(text.length - max)}`);

/**
 * Une ligne de texte brut tirée d'une réponse : sans Markdown, sans puce ni numéro, sans guillemets autour,
 * sans balise. Les guillemets du texte lui-même (une réplique citée) restent.
 */
export function plainLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let s = value
    .replace(/<[^>]*>/g, "")
    .replace(/\r?\n+/g, " ")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/[*_`#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const pairs: [string, string][] = [['"', '"'], ["“", "”"], ["«", "»"], ["'", "'"]];
  for (const [a, b] of pairs) {
    if (s.length > 2 && s.startsWith(a) && s.endsWith(b) && !s.slice(1, -1).includes(a) && !s.slice(1, -1).includes(b)) s = s.slice(1, -1).trim();
  }
  return clip(s, max);
}

/** Règle commune : jamais d'identifiant de carte dans le texte, pas de Markdown, la langue de l'auteur. */
const common = (lang: string) =>
  `Write in ${language(lang)}. Plain text only: no Markdown, no HTML, no quotation marks around your answer, no commentary. ` +
  `Never mention a card id. `;

// ---------- a. Trois variantes ----------

export type VariantKind = "prose" | "dialogue" | "action";
/** Plus longue sélection acceptée (une phrase, une réplique, un court paragraphe). */
export const VARIANT_MAX = 600;

/**
 * Trois reformulations d'un passage choisi par l'auteur. Même sens, même point de vue, même temps, même voix :
 * l'auteur choisit, rien de nouveau dans l'histoire. Le texte autour sert seulement à garder le ton.
 */
export function variantsPrompt(text: string, kind: VariantKind, lang: string, context: { before?: string; after?: string; speaker?: string } = {}): Prompt {
  const what = kind === "dialogue" ? "a line of dialogue from a screenplay" : kind === "action" ? "a line of action (scene description) from a screenplay" : "a sentence or short passage from a novel";
  return {
    system:
      `You help a writer who asked, for this project, for alternative wordings of ${what} they wrote. ` +
      `Give exactly three rewordings of the passage. Keep its meaning, its point of view, its tense, its person and the voice of the text; ` +
      `do not add events, names or information, and do not explain. Each rewording is about as long as the passage. ` +
      common(lang) +
      `Answer with a JSON object only: {"variants": ["<rewording 1>", "<rewording 2>", "<rewording 3>"]}.`,
    user: JSON.stringify({
      passage: clip(text.trim(), VARIANT_MAX),
      ...(context.speaker ? { speaker: context.speaker } : {}),
      ...(context.before ? { textBefore: tail(context.before, 600) } : {}),
      ...(context.after ? { textAfter: clip(context.after, 400) } : {}),
    }),
  };
}

/** Les trois variantes : des textes bruts, distincts entre eux et du passage, bornés à trois fois sa longueur. */
export function parseVariants(reply: string, original: string): string[] {
  const raw = extractJson(reply);
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? (raw as Record<string, unknown>).variants : null;
  const items: unknown[] = Array.isArray(list) ? list : reply.split(/\n+/);
  const max = Math.min(1500, Math.max(120, original.trim().length * 3));
  // Deux textes qui ne diffèrent que par la ponctuation finale sont le même texte.
  const key = (t: string) => t.replace(/\s+/g, " ").trim().replace(/\s*[.!?…]+$/, "").toLowerCase();
  const seen = new Set([key(original)]);
  // Une sélection sans ponctuation finale (le début d'une phrase) : la variante n'en ajoute pas, sinon « .. ».
  const bare = !/[.!?…:;»”"')\]]\s*$/.test(original);
  const out: string[] = [];
  for (const item of items) {
    const raw = plainLine(item, max);
    const line = bare ? raw.replace(/\s*[.!?…]+$/, "") : raw;
    if (line.length < 2 || seen.has(key(line))) continue;
    seen.add(key(line));
    out.push(line);
    if (out.length === 3) break;
  }
  return out;
}

// ---------- b. Synopsis d'une scène ----------

/** Résumé d'une scène tiré de son texte seul : ce qui s'y passe, rien d'interprété ni d'ajouté. */
export function synopsisPrompt(title: string, text: string, lang: string, kind: "roman" | "scenario"): Prompt {
  return {
    system:
      `You help a writer keep track of their ${kind === "scenario" ? "screenplay" : "novel"}. Summarise the scene below in one or two sentences, ` +
      `present tense, at most 40 words: what happens and what changes. Use only what the text says; do not interpret, judge or add anything. ` +
      common(lang),
    user: JSON.stringify({ scene: title.trim(), text: clip(text.trim(), 12000) }),
  };
}

/** Le synopsis : un seul paragraphe de texte brut, sans « Synopsis : » devant, 400 caractères au plus. */
export function parseSynopsis(reply: string): string {
  const first = reply
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find(Boolean);
  return plainLine((first ?? "").replace(/^(?:synopsis|résumé|summary)\s*:\s*/i, ""), 400);
}

// ---------- c. Trois directions ----------

/** Trois pistes d'une ligne pour la suite d'une scène : des possibilités, pas de prose à coller. */
export function directionsPrompt(scene: { title: string; synopsis?: string; text: string }, lang: string, kind: "roman" | "scenario", cards: Pick<CardData, "type" | "title">[] = []): Prompt {
  const known = cards
    .filter((c) => c.title.trim() && ["personnage", "lieu", "intrigue", "objet", "secret"].includes(c.type))
    .slice(0, 40)
    .map((c) => ({ type: c.type, title: c.title.trim() }));
  return {
    system:
      `You help a writer who is stuck at the end of a scene of their ${kind === "scenario" ? "screenplay" : "novel"}. ` +
      `Suggest exactly three different directions for what could happen next, each in one short line (at most 25 words): a lead, not prose for the book. ` +
      `Make them genuinely different (for example: an escalation, a reversal, a quiet turn). Use the characters and places the writer already has when they fit; do not invent backstory. ` +
      common(lang) +
      `Answer with a JSON object only: {"directions": ["<line 1>", "<line 2>", "<line 3>"]}.`,
    user: JSON.stringify({ scene: scene.title.trim(), ...(scene.synopsis?.trim() ? { synopsis: scene.synopsis.trim() } : {}), endOfScene: tail(scene.text.trim(), 3000), ...(known.length > 0 ? { cards: known } : {}) }),
  };
}

/** Les trois pistes : des lignes brutes, distinctes, 200 caractères au plus. */
export function parseDirections(reply: string): string[] {
  const raw = extractJson(reply);
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? (raw as Record<string, unknown>).directions : null;
  const items: unknown[] = Array.isArray(list) ? list : reply.split(/\n+/);
  const out: string[] = [];
  for (const item of items) {
    const line = plainLine(item, 200);
    if (line.length > 2 && !out.some((o) => o.toLowerCase() === line.toLowerCase())) out.push(line);
    if (out.length === 3) break;
  }
  return out;
}

// ---------- d. Brouillon de la couverture ----------

/** Champs de la couverture que l'Atelier peut proposer. */
export const PITCH_DRAFT_FIELDS = ["tagline", "logline", "resume", "comps", "intention"] as const;
export type PitchDraftField = (typeof PITCH_DRAFT_FIELDS)[number];
const PITCH_LIMITS: Record<PitchDraftField, number> = { tagline: 160, logline: 400, resume: 2500, comps: 400, intention: 2500 };
const PITCH_GUIDE: Record<PitchDraftField, string> = {
  tagline: "a one-line hook for the cover, at most 15 words",
  logline: "one sentence: who wants what, against what obstacle, with what at stake",
  resume: "a summary of the story in one or two short paragraphs, in the present tense, ending included if the cards say it",
  comps: "two or three comparable published works or films, as \"Title (Author or director)\", separated by commas",
  intention: "a short statement of intent, in the first person, about why this story and what it is about, using only what the cards say",
};

/**
 * Brouillon des champs vides de la couverture, d'après les cartes et ce que l'auteur a déjà rempli. Un brouillon,
 * que l'auteur acceptera champ par champ : rien d'inventé au-delà de ce que disent les cartes.
 */
export function pitchDraftPrompt(
  project: { title: string; kind: "roman" | "scenario"; filled: Record<string, string> },
  fields: readonly PitchDraftField[],
  cards: CardData[],
  lang: string,
): Prompt {
  const brief = cards
    .filter((c) => c.title.trim() || plainText(c.html).trim())
    .slice(0, 80)
    .map((c) => ({ type: c.type, title: c.title.trim(), text: clip(plainText(c.html).trim(), 300) }));
  const wanted = Object.fromEntries(fields.map((f) => [f, PITCH_GUIDE[f]]));
  return {
    system:
      `You help a writer draft the cover page of their ${project.kind === "scenario" ? "screenplay" : "novel"} project, which they will rework. ` +
      `Draft only the fields asked for, from what the cards and the fields already filled say. Do not invent characters, events or an ending the cards do not give. ` +
      `Leave out a field you cannot draft honestly. ` +
      common(lang) +
      `Answer with a JSON object only, with these keys: ${JSON.stringify(wanted)}.`,
    user: JSON.stringify({ title: project.title.trim(), ...(Object.keys(project.filled).length > 0 ? { alreadyFilled: project.filled } : {}), cards: brief }),
  };
}

/** Le brouillon : seulement les champs demandés, en texte brut borné (paragraphes gardés pour le résumé et la note). */
export function parsePitchDraft(reply: string, fields: readonly PitchDraftField[]): Partial<Record<PitchDraftField, string>> {
  const raw = extractJson(reply);
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Partial<Record<PitchDraftField, string>> = {};
  for (const key of fields) {
    const value = obj[key];
    if (typeof value !== "string") continue;
    const text =
      key === "resume" || key === "intention"
        ? value
            .split(/\n\s*\n/)
            .map((p) => plainLine(p, PITCH_LIMITS[key]))
            .filter(Boolean)
            .join("\n\n")
        : plainLine(value, PITCH_LIMITS[key]);
    if (text.length > 1) out[key] = clip(text, PITCH_LIMITS[key]);
  }
  return out;
}

// ---------- e. Fiche d'un personnage secondaire ----------

/**
 * Champs de la fiche d'un personnage que l'Atelier peut proposer. Ni genre, ni origine, ni rien que la consigne
 * interdit de deviner ; ni les champs à choix (arc, principal, certitude), qui restent à l'auteur.
 */
export const SHEET_DRAFT_FIELDS = ["accroche", "role", "age", "metier", "surnoms", "apparence", "personnalite", "voix", "objectif", "peur", "secret", "relations"] as const;
export type SheetDraftField = (typeof SHEET_DRAFT_FIELDS)[number];

/**
 * Propositions pour la fiche d'un personnage secondaire, tirées de ses notes et de ses fils. Comme pour une photo
 * (describeCharacterPrompt) : jamais d'origine, de religion, de santé, de handicap ni d'orientation inventés.
 */
export function sheetDraftPrompt(
  character: CardData,
  links: { label: string; title: string; type: string }[],
  fields: readonly SheetDraftField[],
  labels: Record<string, string>,
  lang: string,
): Prompt {
  const wanted = Object.fromEntries(fields.map((f) => [f, labels[f] ?? f]));
  return {
    system:
      `You help a writer flesh out a minor character of their story, from the few notes they wrote and the character's links to other cards. ` +
      `Suggest a short value for some of the sheet fields below (a few words, at most two sentences each), consistent with the notes and links. ` +
      `Never invent or guess ethnicity, origin, religion, health, disability or sexual orientation, and do not change what the notes already say. ` +
      `Leave out a field you have no basis for. ` +
      common(lang) +
      `Answer with a JSON object only: {"fields": {<key>: "<value>"}}, keys among: ${JSON.stringify(wanted)}.`,
    user: JSON.stringify({
      character: character.title.trim(),
      notes: clip(plainText(character.html).trim(), 1500),
      ...(character.fiche && Object.keys(character.fiche).length > 0 ? { sheet: character.fiche } : {}),
      ...(links.length > 0 ? { links: links.slice(0, 30) } : {}),
    }),
  };
}

/** Propositions pour la fiche : seulement les champs permis et demandés, en texte brut borné. */
export function parseSheetDraft(reply: string, fields: readonly SheetDraftField[]): Partial<Record<SheetDraftField, string>> {
  const raw = extractJson(reply);
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const given = obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields) ? (obj.fields as Record<string, unknown>) : obj;
  const out: Partial<Record<SheetDraftField, string>> = {};
  for (const key of fields) {
    if (!(SHEET_DRAFT_FIELDS as readonly string[]).includes(key)) continue;
    const value = plainLine(given[key], key === "age" ? 60 : 400);
    if (value.length > 1) out[key] = value;
  }
  return out;
}
