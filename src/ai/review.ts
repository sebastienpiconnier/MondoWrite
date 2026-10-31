// Relecture par l'IA (1.9.0) : quatre lectures de tout le récit, qui rendent des questions, jamais des
// corrections. Fonctions pures (consignes, découpage en paquets, marqueurs de temps, lecteurs des réponses).
//   - Cohérence scène par scène : les scènes dans l'ordre du récit, par paquets, avec les fiches concernées.
//   - Chronologie : marqueurs de temps relevés sans IA (`timeMarkers`), puis l'IA cherche un ordre impossible.
//   - Voix des personnages : les répliques (scénario) ou les passages dialogués (roman), et ce que dit la fiche.
//   - Lecteur bêta : tout le récit résumé (synopsis et début de chaque scène), « où je décroche ».
// Règles : l'IA questionne, elle n'écrit pas ; tout ce qui revient passe par `parseReview`, qui ne garde que
// des scènes et des cartes connues. Le texte complet des consignes est recopié dans docs/prompts-ia.md.

import type { CardData, CardType, Link } from "../types";
import { plainText } from "../search";
import { bookOrder } from "../book";
import type { Plan } from "../plan";
import { namesOf } from "../manuscript";
import type { ScreenplayElement } from "../screenplay/model";
import { characterName, headingParts, listScenes, sceneSynopsis } from "../screenplay/scenes";
import { sceneBody, sceneText } from "../screenplay/sceneText";
import { brief, clip, extractJson, language, nameCards, nameRule, type CardNames, type Prompt } from "./tasks";

export const REVIEW_TASKS = ["continuity", "timeline", "voices", "beta"] as const;
export type ReviewTask = (typeof REVIEW_TASKS)[number];

/** Taille d'un envoi, en caractères : celle de la cohérence (tient dans le contexte d'un modèle local). */
export const REVIEW_BUDGET = 30_000;
/** Texte d'une scène dans un paquet de cohérence, au plus. */
const SCENE_MAX = 9_000;
/** Questions gardées par réponse. */
const MAX_ITEMS = 12;

/** Une scène telle que la relecture la lit, dans l'ordre du récit. `ref` (« s3 ») sert seulement à l'IA. */
export interface ReviewScene {
  ref: string;
  /** Rang dans le récit, à partir de 1. */
  number: number;
  /** Carte Scène (roman : toujours ; scénario : si l'en-tête est relié). */
  cardId: string | null;
  /** Scénario : index de l'en-tête dans `elements` ; roman : -1. */
  at: number;
  title: string;
  synopsis: string;
  /** Texte brut de la scène (prose, ou scénario lu avec les noms des personnages devant leurs répliques). */
  text: string;
  /** Scénario : moment de l'en-tête (« NUIT »). */
  time: string;
  /** Répliques : scénario, par personnage ; roman, passages entre guillemets ou après un tiret (`who` vide). */
  lines: { who: string; text: string }[];
}

/** Pages du livre qui ne sont pas du récit : rien à relire. */
const QUIET = new Set(["titre", "copyright", "dedicace", "epigraphe", "remerciements", "auteur"]);

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Passages dialogués d'un texte de roman (HTML) : entre « », “ ”, " ", ou paragraphe ouvert par un tiret. */
export function proseLines(html: string): string[] {
  const out: string[] = [];
  for (const raw of html.split(/<\/p>|<br\s*\/?>/i)) {
    const para = squash(plainText(raw));
    if (!para) continue;
    // Tiret de dialogue en tête de paragraphe : toute la réplique (l'incise comprise, on ne sait pas la couper sûrement).
    if (/^[—–-]\s/.test(para)) {
      out.push(clip(para.replace(/^[—–-]\s*/, ""), 400));
      continue;
    }
    for (const m of para.matchAll(/«\s*([^«»]{2,600}?)\s*»|“([^“”]{2,600}?)”|"([^"]{2,600}?)"/g)) {
      const text = squash(m[1] ?? m[2] ?? m[3] ?? "");
      if (text.length >= 2) out.push(clip(text, 400));
    }
  }
  return out;
}

/** Scènes d'un roman, dans l'ordre du livre (`bookOrder`), sans les pages hors récit (titre, dédicace…). */
export function novelScenes(nodes: { id: string; data: CardData; position: { x: number; y: number } }[], plan: Plan, manuscript: Record<string, string>): ReviewScene[] {
  const byId = new Map(nodes.map((n) => [n.id, n.data]));
  const out: ReviewScene[] = [];
  for (const id of bookOrder(nodes, plan)) {
    const card = byId.get(id);
    if (!card || (card.page && QUIET.has(card.page))) continue;
    const html = manuscript[id] ?? "";
    const n = out.length + 1;
    out.push({ ref: `s${n}`, number: n, cardId: id, at: -1, title: card.title.trim(), synopsis: squash(card.fiche?.synopsis ?? ""), text: squash(plainText(html)), time: "", lines: proseLines(html).map((text) => ({ who: "", text })) });
  }
  return out;
}

/** Scènes d'un scénario, dans l'ordre du fichier Fountain. */
export function screenplayScenes(elements: ScreenplayElement[], lang: string): ReviewScene[] {
  return listScenes(elements).map((scene, i) => {
    const body = sceneBody(elements, scene.index);
    const lines: ReviewScene["lines"] = [];
    let who = "";
    for (const el of body) {
      if (el.type === "character") who = characterName(el.text);
      else if (el.type === "dialogue" && who && el.text.trim()) lines.push({ who, text: clip(squash(el.text), 400) });
      else if (el.type !== "parenthetical") who = "";
    }
    return {
      ref: `s${i + 1}`,
      number: scene.number,
      cardId: scene.cardId ?? null,
      at: scene.index,
      title: scene.text.trim(),
      synopsis: squash(sceneSynopsis(elements, scene.index)),
      text: squash(sceneText(body, lang)),
      time: headingParts(scene.text).time,
      lines,
    };
  });
}

/**
 * Découpe une liste en paquets dont la taille (`size`) tient dans `budget`, dans l'ordre. Un élément plus
 * gros que le budget forme un paquet à lui seul (l'appelant l'a déjà borné).
 */
export function packScenes<T>(items: T[], size: (item: T) => number, budget: number): T[][] {
  const packs: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const item of items) {
    const s = size(item);
    if (current.length > 0 && used + s > budget) {
      packs.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += s;
  }
  if (current.length > 0) packs.push(current);
  return packs;
}

// ---------- Cartes en jeu ----------

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "'").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, word: string) => !!word && new RegExp(`(?<![\\p{L}\\p{N}]-?)${escapeRe(word)}(?!-?[\\p{L}\\p{N}])`, "u").test(text);

/** Types dont la fiche peut se contredire avec une scène. */
const CONTINUITY_TYPES: ReadonlySet<CardType> = new Set(["personnage", "lieu", "objet", "secret", "evenement", "groupe"]);

/** Façons dont un texte nomme une carte : celles du manuscrit (titre, prénom, surnoms), et le titre entier des autres types. */
const namesFor = (card: CardData) => (card.type === "personnage" || card.type === "lieu" ? namesOf(card) : card.title.trim() ? [fold(card.title.trim())] : []);

/** Cartes de la bible que ces scènes nomment, ou qu'un fil relie à leur carte Scène. */
export function cardsInScenes(scenes: ReviewScene[], cards: CardData[], links: Pick<Link, "source" | "target">[]): CardData[] {
  const sceneIds = new Set(scenes.map((s) => s.cardId).filter((id): id is string => !!id));
  const linked = new Set(links.flatMap((l) => (sceneIds.has(l.source) ? [l.target] : sceneIds.has(l.target) ? [l.source] : [])));
  const text = fold(scenes.map((s) => [s.title, s.synopsis, s.text].join(" ")).join(" "));
  return cards.filter((c) => CONTINUITY_TYPES.has(c.type) && (linked.has(c.id) || namesFor(c).some((name) => name.length >= 2 && hasWord(text, name))));
}

// ---------- Marqueurs de temps (sans IA) ----------

const NUM_FR = "(?:un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|cent|quelques|plusieurs|\\d+)";
const UNIT_FR = "(?:minutes?|heures?|jours?|nuits?|semaines?|mois|ans|années?|siècles?|saisons?)";
const MONTH_FR = "(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)";
const DAY_FR = "(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)";
const SEASON_FR = "(?:été|hiver|automne|printemps)";
const NUM_EN = "(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|a\\s+hundred|a\\s+few|several|\\d+)";
const UNIT_EN = "(?:minutes?|hours?|days?|nights?|weeks?|months?|years?|decades?|seasons?)";
const MONTH_EN = "(?:january|february|march|april|may|june|july|august|september|october|november|december)";
const DAY_EN = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const SEASON_EN = "(?:summer|winter|autumn|fall|spring)";
const AP = "['’]";

/** Formes reconnues, de la plus longue à la plus courte (à une même place, la première qui convient l'emporte). */
const MARKERS = [
  // Français
  `(?:le|au)\\s+(?:sur)?lendemain(?:\\s+(?:matin|soir|midi|après-midi))?`,
  `l${AP}avant-veille`,
  `la\\s+veille(?:\\s+au\\s+soir)?`,
  `${NUM_FR}\\s+${UNIT_FR}\\s+(?:plus\\s+tard|plus\\s+tôt|après|auparavant|avant|plus\\s+loin)`,
  `(?:il\\s+y\\s+a|depuis|dans|pendant|en|voilà)\\s+${NUM_FR}\\s+${UNIT_FR}`,
  `(?:la|le|l${AP})\\s*(?:semaine|mois|année|an|jour|nuit|soir|matin|été|hiver|automne|printemps)\\s+(?:suivante?|d${AP}après|précédente?|dernière?|prochaine?|même|venue)`,
  `le\\s+même\\s+(?:jour|soir|matin)`,
  `au\\s+même\\s+moment`,
  `à\\s+l${AP}(?:aube|aurore)`,
  `à\\s+la\\s+(?:tombée\\s+de\\s+la\\s+nuit|nuit\\s+tombée)`,
  `au\\s+(?:crépuscule|petit\\s+matin|point\\s+du\\s+jour|lever\\s+du\\s+(?:jour|soleil)|coucher\\s+du\\s+soleil|petit\\s+jour)`,
  `(?:à|vers)\\s+(?:midi|minuit)`,
  `en\\s+(?:fin\\s+de\\s+|début\\s+de\\s+)?(?:matinée|soirée|après-midi|journée)`,
  `(?:dans\\s+la|en\\s+pleine|cette)\\s+nuit(?:-là)?`,
  `(?:ce|cet|cette)\\s+(?:matin|soir|après-midi|semaine|année|hiver|été|automne|printemps)(?:-là)?`,
  `(?:avant-hier|après-demain|aujourd${AP}hui|hier|demain)(?:\\s+(?:matin|soir))?`,
  `${DAY_FR}(?:\\s+(?:matin|soir|prochain|dernier))?`,
  `\\d{1,2}(?:er)?\\s+${MONTH_FR}(?:\\s+\\d{3,4})?`,
  `(?:en|début|fin|mi-|courant|depuis|jusqu${AP}en)\\s*${MONTH_FR}(?:\\s+\\d{3,4})?`,
  `(?:en|à\\s+l${AP}|au|l${AP}|cet\\s+|cet${AP}|tout\\s+l${AP})\\s*${SEASON_FR}`,
  `en\\s+\\d{4}`,
  `\\d{1,2}\\s?h(?:\\s?\\d{2})?`,
  // English
  `the\\s+(?:next|following|previous)\\s+(?:day|morning|evening|night|week|month|year|afternoon|summer|winter|spring|autumn)`,
  `the\\s+day\\s+(?:before|after)(?:\\s+(?:yesterday|tomorrow))?`,
  `the\\s+night\\s+before`,
  `later\\s+that\\s+(?:day|night|evening|morning|week)`,
  `${NUM_EN}\\s+${UNIT_EN}\\s+(?:later|earlier|before|after|ago|on)`,
  `(?:for|in|within)\\s+${NUM_EN}\\s+${UNIT_EN}`,
  `at\\s+(?:dawn|dusk|daybreak|sunrise|sunset|noon|midnight|nightfall|first\\s+light)`,
  `in\\s+the\\s+(?:morning|afternoon|evening|middle\\s+of\\s+the\\s+night)`,
  `(?:that|this)\\s+(?:morning|afternoon|evening|night|week|year|summer|winter|autumn|fall|spring)`,
  `(?:yesterday|today|tomorrow|tonight)(?:\\s+(?:morning|evening|night))?`,
  `${DAY_EN}(?:\\s+(?:morning|afternoon|evening|night))?`,
  `${MONTH_EN}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?`,
  `\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_EN}(?:\\s+\\d{4})?`,
  `(?:in|early|late|mid-|by|since|until)\\s*${MONTH_EN}(?:\\s+\\d{4})?`,
  `(?:in\\s+(?:the\\s+)?|last\\s+|next\\s+|that\\s+)${SEASON_EN}`,
  `in\\s+\\d{4}`,
  `\\d{1,2}(?::\\d{2})?\\s?(?:a\\.m\\.|p\\.m\\.|am|pm)`,
  `(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d{1,2})\\s+o${AP}clock`,
  // Dates écrites en chiffres (les deux langues)
  `\\d{4}-\\d{2}-\\d{2}`,
  `\\d{1,2}/\\d{1,2}/\\d{2,4}`,
];
const MARKER_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${MARKERS.join("|")})(?![\\p{L}\\p{N}])`, "giu");

/** Marqueurs de temps d'un texte, dans l'ordre, sans doublon (« trois jours plus tard », « à l'aube », « the next day »…). */
export function timeMarkers(text: string, max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(MARKER_RE)) {
    const found = squash(m[0]);
    const key = fold(found);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(found);
    if (out.length >= max) break;
  }
  return out;
}

// ---------- Consignes ----------

const story = (kind: "roman" | "scenario") => (kind === "scenario" ? "screenplay" : "novel");

/** Règles communes : des questions, jamais de correction ; scènes par leur titre ; format de la réponse. */
const answerRule = (lang: string, extra = "") =>
  `Do not propose fixes, do not rewrite and do not complete anything: phrase each point as one short question to the writer, in ${language(lang)}. ` +
  nameRule(lang) +
  `Name a scene by its title in quotation marks, never by its ref ("s3"): refs belong only in the "scenes" field. ` +
  `Answer with a JSON object only: {"items": [{"scenes": ["<scene ref>"], "cards": ["<card id>"], "question": "<question>", "quote": "<up to 12 words copied exactly from the scene text, or empty>"${extra}}]}. ` +
  `"scenes" lists the refs of the scenes involved, exactly as given; "cards" the ids of the cards involved (may be empty). At most ${MAX_ITEMS} items. If you find nothing, answer {"items": []}.`;

/** Résumé court des scènes déjà lues (pour la cohérence d'un paquet à l'autre). */
const earlierOf = (scenes: ReviewScene[], max = 3_000) => {
  const out: { ref: string; title: string; synopsis: string }[] = [];
  let size = 0;
  for (const s of [...scenes].reverse()) {
    const item = { ref: s.ref, title: s.title, synopsis: clip(s.synopsis || s.text, 140) };
    size += JSON.stringify(item).length;
    if (size > max) break;
    out.unshift(item);
  }
  return out;
};

/** Cartes d'un paquet de cohérence, bornées. */
const cardBriefs = (cards: CardData[], questions: Record<string, string>, max = 10_000) => {
  const out: ReturnType<typeof brief>[] = [];
  let size = 0;
  for (const c of cards.slice(0, 40)) {
    const b = brief(c, questions);
    size += JSON.stringify(b).length;
    if (out.length > 0 && size > max) break;
    out.push(b);
  }
  return out;
};

/**
 * Cohérence scène par scène : un envoi par paquet de scènes qui tient dans le budget. Chaque paquet porte les
 * fiches des cartes qu'il nomme (ou que ses scènes relient) et le résumé des scènes d'avant.
 */
export function continuityPrompts(
  scenes: ReviewScene[],
  cards: CardData[],
  links: Pick<Link, "source" | "target" | "label">[],
  lang: string,
  kind: "roman" | "scenario",
  questions: Record<string, string> = {},
  budget = REVIEW_BUDGET,
): Prompt[] {
  const written = scenes.filter((s) => s.text || s.synopsis);
  const shown = (s: ReviewScene) => ({ ref: s.ref, title: s.title, ...(s.time ? { time: s.time } : {}), ...(s.synopsis ? { synopsis: clip(s.synopsis, 400) } : {}), text: clip(s.text, SCENE_MAX) });
  // Un tiers du budget pour les fiches et les scènes d'avant, le reste pour le texte.
  const packs = packScenes(written, (s) => JSON.stringify(shown(s)).length, Math.round(budget * 0.6));
  const system =
    `You are a continuity reader for a ${story(kind)}. You get scenes in story order with their text, the sheets of the cards they involve (characters, places, objects, secrets, events, groups) and a short summary of the scenes before them. ` +
    `Look for continuity slips: an age, eye or hair colour or other physical detail that changes; a season, weather, time of day or date that does not fit the scene before; a character who knows something before they could have learnt it, or forgets what they know; a character in two places at the same time; an object where it cannot be. ` +
    `Report only real inconsistencies in what is written (between scenes, or between a scene and a sheet), never missing information, style, taste or plot advice. ` +
    answerRule(lang);
  return packs.map((pack) => {
    const first = scenes.indexOf(pack[0]);
    const involved = cardsInScenes(pack, cards, links);
    const ids = new Set(involved.map((c) => c.id));
    return {
      system,
      user: JSON.stringify({
        earlier: earlierOf(scenes.slice(0, first)),
        cards: cardBriefs(involved, questions),
        links: links.filter((l) => ids.has(l.source) && ids.has(l.target)).map(({ source, target, label }) => ({ source, target, label })),
        scenes: pack.map(shown),
      }),
    };
  });
}

/** Chronologie : les marqueurs de chaque scène (et le moment de l'en-tête d'un scénario). Rien si aucun repère. */
export function timelinePrompts(scenes: ReviewScene[], lang: string, kind: "roman" | "scenario", budget = REVIEW_BUDGET): Prompt[] {
  const rows = scenes.map((s) => ({
    ref: s.ref,
    title: s.title,
    ...(s.time ? { time: s.time } : {}),
    markers: timeMarkers([s.synopsis, s.text].join(" ")),
    ...(s.synopsis ? { synopsis: clip(s.synopsis, 200) } : {}),
    opening: clip(s.text, 300),
  }));
  if (!rows.some((r) => r.markers.length > 0 || r.time)) return [];
  const system =
    `You check the timeline of a ${story(kind)}. For each scene, in story order, you get its title${kind === "scenario" ? ", the time of day written in its heading" : ""}, the time markers found in its text ("three days later", "at dawn", "the next day", dates, seasons, weekdays), its synopsis and its opening. ` +
    `Work out the time line from these markers and report only what cannot hold: an impossible order (a scene marked "the next morning" after one that already happens two days later; night followed by "the same afternoon"), a duration that does not add up (a journey, an age, a pregnancy, a countdown), a date, weekday or season that contradicts another. ` +
    `A flashback or a time jump is fine when the text marks it. Never ask for markers that are missing. ` +
    answerRule(lang);
  return packScenes(rows, (r) => JSON.stringify(r).length, budget - 2_000).map((pack) => ({ system, user: JSON.stringify({ scenes: pack }) }));
}

/** Voix des personnages : ce que la fiche dit de leur voix, et leurs répliques (bornées). */
export function voicesPrompt(scenes: ReviewScene[], cards: CardData[], lang: string, kind: "roman" | "scenario", budget = REVIEW_BUDGET): Prompt | null {
  const characters = cards.filter((c) => c.type === "personnage" && c.title.trim());
  const sheet = (c: CardData) => ({
    id: c.id,
    title: c.title.trim(),
    ...(c.fiche?.voix?.trim() ? { voice: clip(c.fiche.voix.trim(), 400) } : {}),
    ...(c.fiche?.personnalite?.trim() ? { personality: clip(c.fiche.personnalite.trim(), 300) } : {}),
    ...(plainText(c.html).trim() ? { notes: clip(plainText(c.html).trim(), 300) } : {}),
  });
  const system = (kind === "scenario"
    ? `You read the dialogue of a screenplay to help the writer hear their characters. For each character who speaks you get what the writer says of them (sheet field "voice", personality, notes, when a card exists) and lines they speak, each with the ref of its scene. `
    : `You read the dialogue of a novel to help the writer hear their characters. You get the characters' cards (sheet field "voice", personality, notes) and, scene by scene, the passages between quotation marks or after a dialogue dash, with the characters the scene names. The lines are not attributed: attribute one only when the text makes it clear; when unsure, say nothing about it. `) +
    `Report only two kinds of points: two characters who sound alike (same vocabulary, rhythm, verbal tics, register) when nothing the writer wrote says they should; a character whose lines in a scene leave what the writer says of their voice (register, accent, way of speaking). ` +
    `Never rewrite a line and never suggest a better one. Put the scene where it shows in "scenes" and a few words of the line in "quote". ` +
    answerRule(lang);
  let size = 0;
  if (kind === "scenario") {
    const bySpeaker = new Map<string, { ref: string; text: string }[]>();
    for (const s of scenes) for (const l of s.lines) bySpeaker.set(l.who, [...(bySpeaker.get(l.who) ?? []), { ref: s.ref, text: l.text }]);
    const speakers = [...bySpeaker].filter(([, lines]) => lines.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 16);
    if (speakers.length === 0) return null;
    // Une part du budget par personnage : chacun garde des répliques prises dans tout le récit.
    const share = Math.max(600, Math.floor((budget - 4_000) / speakers.length));
    const list = speakers.map(([who, lines]) => {
      const card = characters.find((c) => namesOf(c).includes(fold(who)));
      const step = Math.max(1, Math.ceil((lines.reduce((n, l) => n + l.text.length + 12, 0)) / share));
      const kept: string[] = [];
      let used = 0;
      for (let i = 0; i < lines.length; i += step) {
        const line = `${lines[i].ref}: ${lines[i].text}`;
        if (used + line.length > share) break;
        kept.push(line);
        used += line.length;
      }
      return { name: who, ...(card ? sheet(card) : {}), lines: kept };
    });
    return { system, user: JSON.stringify({ characters: list }) };
  }
  const passages: { ref: string; title: string; names: string[]; lines: string[] }[] = [];
  const cast = characters.slice(0, 30).map(sheet);
  size = JSON.stringify(cast).length;
  for (const s of scenes) {
    if (s.lines.length === 0) continue;
    const text = fold(s.text);
    const names = characters.filter((c) => namesOf(c).some((n) => hasWord(text, n))).map((c) => c.title.trim());
    const item = { ref: s.ref, title: s.title, names, lines: s.lines.slice(0, 12).map((l) => l.text) };
    const length = JSON.stringify(item).length;
    if (size + length > budget - 2_000) break;
    passages.push(item);
    size += length;
  }
  if (passages.length === 0) return null;
  return { system, user: JSON.stringify({ characters: cast, scenes: passages }) };
}

/** Lecteur bêta : tout le récit, une ligne par scène, chaque scène bornée pour que l'ensemble tienne. */
export function betaPrompt(scenes: ReviewScene[], lang: string, kind: "roman" | "scenario", budget = REVIEW_BUDGET): Prompt | null {
  const written = scenes.filter((s) => s.text || s.synopsis);
  if (written.length === 0) return null;
  // Part de chaque scène : ce qui reste du budget une fois comptés la référence, le titre et les clés JSON.
  const fixed = written.reduce((n, s) => n + JSON.stringify({ ref: s.ref, title: s.title, synopsis: "", opening: "" }).length + 1, 0);
  const each = Math.max(20, Math.min(700, Math.floor((budget - 3_000 - fixed) / written.length)));
  const rows = written.map((s) => {
    const synopsis = clip(s.synopsis, Math.round(each * 0.4));
    return { ref: s.ref, title: s.title, ...(synopsis ? { synopsis } : {}), opening: clip(s.text, Math.max(20, each - synopsis.length)) };
  });
  return {
    system:
      `You are a beta reader of a ${story(kind)}. You get the whole story, scene by scene, in story order: the title, synopsis and opening of each scene. ` +
      `Tell the writer, honestly and specifically: where you lose interest (a scene or stretch where the tension drops), what you did not understand (a motive, a jump, someone who appears without introduction), and what you expected that never comes (a promise, a set-up, a question the story raises and drops). ` +
      `Tie each point to the scene where it happens. Do not praise, do not rewrite, do not suggest scenes or events. ` +
      `Give each item a "kind": "lost" (where you lose interest), "unclear" (what you did not understand) or "expected" (what you expected). ` +
      answerRule(lang, `, "kind": "lost" | "unclear" | "expected"`),
    user: JSON.stringify({ scenes: rows }),
  };
}

// ---------- Lecture des réponses ----------

export const BETA_KINDS = ["lost", "unclear", "expected"] as const;
export type BetaKind = (typeof BETA_KINDS)[number];

/** Une scène citée par une question : de quoi y aller et la nommer, même si le texte a bougé depuis. */
export interface SceneRef {
  cardId: string | null;
  at: number;
  number: number;
  title: string;
}

export interface ReviewQuestion {
  /** Clé stable (tâche et question repliée), pour « Ignorer » pendant la session. */
  key: string;
  task: ReviewTask;
  question: string;
  scenes: SceneRef[];
  cards: string[];
  /** Quelques mots exacts de la scène, vérifiés dans son texte : sélectionnés quand on y va. */
  quote?: string;
  kind?: BetaKind;
}

const asList = (value: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value).find(Array.isArray) : null;
  return Array.isArray(list) ? list.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
};
const str = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const foldTitle = (text: string) => fold(text.replace(/\s*\([^()]*\)\s*$/, "").replace(/^["«“\s]+|["»”\s]+$/g, "")).trim();

/** Le passage cité, tel qu'il est écrit dans une des scènes (casse et espaces repliées pour le trouver). */
export function findQuote(quote: string, scenes: ReviewScene[]): string | undefined {
  const wanted = squash(quote.replace(/^["«“\s]+|["»”\s.…]+$/g, ""));
  if (wanted.length < 4) return undefined;
  const lower = wanted.toLowerCase();
  for (const s of scenes) {
    for (const source of [s.text, ...s.lines.map((l) => l.text)]) {
      const at = source.toLowerCase().indexOf(lower);
      // toLowerCase ne change pas la longueur des lettres usuelles ; sinon on renonce à la sélection.
      if (at >= 0 && source.toLowerCase().length === source.length) return source.slice(at, at + wanted.length);
    }
  }
  return undefined;
}

/**
 * Réponse de l'IA pour une relecture : seulement des scènes et des cartes connues (référence « s3 », numéro,
 * ou titre), une question non vide, un passage cité vérifié dans le texte. Les cartes et les scènes citées par
 * leur identifiant dans la question sont renommées par leur titre.
 */
export function parseReview(reply: string, task: ReviewTask, scenes: ReviewScene[], cards: CardData[], lang: string, names?: CardNames): ReviewQuestion[] {
  const byRef = new Map(scenes.map((s) => [s.ref, s]));
  const byTitle = new Map<string, ReviewScene>();
  for (const s of scenes) if (s.title && !byTitle.has(foldTitle(s.title))) byTitle.set(foldTitle(s.title), s);
  const knownCards = new Set(cards.map((c) => c.id));
  const cardByTitle = new Map<string, string>();
  for (const c of cards) if (c.title.trim() && !cardByTitle.has(foldTitle(c.title))) cardByTitle.set(foldTitle(c.title), c.id);
  // Une carte Scène citée par son identifiant vaut sa scène.
  const byCard = new Map(scenes.filter((s) => s.cardId).map((s) => [s.cardId!, s]));

  const scene = (value: unknown): ReviewScene | undefined => {
    const text = str(value && typeof value === "object" ? (value as Record<string, unknown>).ref ?? (value as Record<string, unknown>).id ?? (value as Record<string, unknown>).title : value);
    if (!text) return undefined;
    const ref = /^(?:s|sc[eè]ne\s*|scene\s*)?(\d{1,4})$/i.exec(text);
    if (ref) return byRef.get(`s${Number(ref[1])}`);
    return byCard.get(text) ?? byTitle.get(foldTitle(text));
  };
  const card = (value: unknown): string => {
    const text = str(value && typeof value === "object" ? (value as Record<string, unknown>).id ?? (value as Record<string, unknown>).title : value);
    if (knownCards.has(text)) return text;
    return cardByTitle.get(foldTitle(text)) ?? "";
  };
  const asArray = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]);
  const seen = new Set<string>();

  return asList(extractJson(reply))
    .flatMap((item): ReviewQuestion[] => {
      let question = clip(str(item.question) || str(item.text) || str(item.issue), 400);
      if (!question) return [];
      const listed = [...new Set(asArray(item.cards ?? item.card).map(card).filter(Boolean))];
      // Une carte Scène donnée parmi les cartes vaut sa scène.
      const found = [...new Set([...asArray(item.scenes ?? item.scene).map(scene), ...listed.map((id) => byCard.get(id))].filter((s): s is ReviewScene => !!s))];
      const ids = listed.filter((id) => !byCard.has(id));
      // Une question qui ne se rattache à rien de connu est écartée (voix : une carte suffit).
      if (found.length === 0 && (task !== "voices" || ids.length === 0)) return [];
      // Référence de scène restée dans la question, malgré la consigne : son titre.
      question = question.replace(/(?<![\p{L}\p{N}])[sS](\d{1,4})(?![\p{L}\p{N}])/gu, (m, n: string) => {
        const s = byRef.get(`s${Number(n)}`);
        if (!s) return m;
        return lang.startsWith("fr") ? `«\u00a0${s.title || m}\u00a0»` : `“${s.title || m}”`;
      });
      if (names) question = nameCards(question, cards, names);
      const key = `${task}:${fold(question).replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 120)}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const quote = str(item.quote) ? findQuote(str(item.quote), found.length > 0 ? found : scenes) : undefined;
      const kind = task === "beta" && (BETA_KINDS as readonly string[]).includes(str(item.kind)) ? (str(item.kind) as BetaKind) : undefined;
      return [
        {
          key,
          task,
          question,
          scenes: found.sort((a, b) => a.number - b.number).map((s) => ({ cardId: s.cardId, at: s.at, number: s.number, title: s.title })),
          cards: ids,
          ...(quote ? { quote } : {}),
          ...(kind ? { kind } : {}),
        },
      ];
    })
    .slice(0, MAX_ITEMS);
}


/**
 * Scénario : l'élément où aller pour une scène citée, le texte ayant pu bouger depuis la relecture. L'en-tête
 * relié à la carte, sinon celui qui était à cet index avec ce titre, sinon le premier qui porte ce titre ; dans
 * la scène, l'élément qui contient le passage cité. -1 si la scène n'existe plus.
 */
export function elementFor(elements: ScreenplayElement[], ref: SceneRef, quote?: string): number {
  const heading = (i: number) => elements[i]?.type === "sceneHeading";
  let at = ref.cardId ? elements.findIndex((el) => el.type === "sceneHeading" && el.cardId === ref.cardId) : -1;
  if (at < 0 && heading(ref.at) && elements[ref.at].text.trim() === ref.title) at = ref.at;
  if (at < 0 && ref.title) at = elements.findIndex((el) => el.type === "sceneHeading" && el.text.trim() === ref.title);
  if (at < 0) return -1;
  if (!quote) return at;
  const wanted = quote.toLowerCase();
  for (let i = at + 1; i < elements.length && !heading(i); i++) if (squash(elements[i].text).toLowerCase().includes(wanted)) return i;
  return at;
}
