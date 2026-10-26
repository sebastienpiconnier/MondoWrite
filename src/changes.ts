// « Ce qui change » (Bible v2, lot 5) : la seule saisie nouvelle, sur la carte Scène. Quelques lignes libres,
// avec mentions @ : « @Inès apprend que @Yann a survécu. », « @Inès perd la clé du phare. ». Tout le reste se
// calcule ici, sans donnée propre : le journal des changements dans l'ordre du récit, l'état d'un personnage
// à une scène (où il est, ce qu'il porte, ce qu'il sait), « qui sait quoi », les objets et les promesses.
// Fonctions pures, sans DOM : le HTML lu est celui de nos éditeurs (paragraphes, mentions `data-mention`).
//
// Sur disque (cartes/<id>.md), une ligne facultative du frontmatter, un élément par ligne, en Markdown :
//   changes: ["[@Inès](cosmos:k3x9a7bq2m) apprend que [@Yann](cosmos:p4t8w2zq1c) a survécu."]
// En mémoire, `changes` est le HTML de l'éditeur (un paragraphe par ligne).

import { storyScenes, type Positioned } from "./book";
import { planOrder, type Plan } from "./plan";
import { listScenes } from "./screenplay/scenes";
import type { ScreenplayElement } from "./screenplay/model";

/** Verbes reconnus : clés internes, jamais affichées ni écrites. */
export const CHANGE_VERBS = ["apprend", "recoit", "perd", "serend", "promet", "tient"] as const;
export type ChangeVerb = (typeof CHANGE_VERBS)[number];

export type ChangeToken = { text: string } | { id: string; title: string };

export interface Change {
  /** Personnages (cartes citées) avant le verbe : ceux à qui la chose arrive. */
  who: string[];
  verb: ChangeVerb | null;
  /** Ce qui suit le verbe, en texte (les mentions y gardent leur titre). */
  what: string;
  /** Cartes citées après le verbe. */
  refs: string[];
  /** La ligne entière, en texte. */
  text: string;
}

export interface LoggedChange extends Change {
  sceneId: string;
  /** Rang de la scène dans le récit (0 = première). */
  index: number;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, k: string) => ENTITIES[k]).replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));

/** Paragraphes d'un HTML d'éditeur, chacun en jetons (texte et mentions). Les lignes vides sont ignorées. */
export function changeLines(html: string | undefined): ChangeToken[][] {
  if (!html) return [];
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/g) ?? [html];
  const lines: ChangeToken[][] = [];
  for (const p of paragraphs) {
    const inner = p.replace(/^<p[^>]*>|<\/p>$/g, "").replace(/<br\s*\/?>/g, " ");
    const tokens: ChangeToken[] = [];
    const re = /<span[^>]*data-mention="([^"]+)"[^>]*>@?([\s\S]*?)<\/span>/g;
    let at = 0;
    for (let m = re.exec(inner); m; m = re.exec(inner)) {
      const before = decode(inner.slice(at, m.index).replace(/<[^>]+>/g, ""));
      if (before) tokens.push({ text: before });
      tokens.push({ id: m[1], title: decode(m[2].replace(/<[^>]+>/g, "")) });
      at = m.index + m[0].length;
    }
    const rest = decode(inner.slice(at).replace(/<[^>]+>/g, ""));
    if (rest) tokens.push({ text: rest });
    if (tokens.some((t) => ("id" in t ? true : t.text.trim()))) lines.push(tokens);
  }
  return lines;
}

const tokenText = (t: ChangeToken) => ("id" in t ? t.title : t.text);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// Verbes au singulier et au pluriel, en français et en anglais. Ordre : les plus longs d'abord.
const VERB_RE: [ChangeVerb, RegExp][] = [
  // « se rend à », « va au », « part pour » : la préposition est mangée avec le verbe.
  // « Va » ou « goes » seuls ne suffisent pas (« va mieux ») : il leur faut la préposition.
  ["serend", /^(?:se\s+rend(?:ent)?(?:\s+(?:à|au|aux|chez|vers|en|dans))?|part(?:ent)?\s+pour|(?:va|vont)\s+(?:à|au|aux|chez|vers|en|dans)|(?:goes|go|heads?|travels?)\s+(?:to|towards?|into))(?=[\s.,;!]|$)/i],
  ["apprend", /^(?:apprend(?:nent)?|découvre(?:nt)?|learns?|finds?\s+out|discovers?)\b/i],
  ["recoit", /^(?:reçoi(?:t|vent)|recoi(?:t|vent)|obtien(?:t|nent)|trouve(?:nt)?|prend(?:nent)?|gets?|receives?|finds?|takes?)\b/i],
  ["perd", /^(?:perd(?:ent)?|donne(?:nt)?|laisse(?:nt)?|loses?|gives?\s+away|leaves?\s+behind)\b/i],
  ["promet", /^(?:promet(?:tent)?|promises?)\b/i],
  ["tient", /^(?:tien(?:t|nent)(?:\s+(?:sa|leur|la)\s+promesse)?|keeps?(?:\s+(?:his|her|their|the)\s+promise)?)\b/i],
];
// Liaisons entre deux personnages avant le verbe : « @Inès et @Yann apprennent… ».
const JOIN_RE = /^[\s,]*(?:et|and|&)?[\s,]*$/i;

/** Lit une ligne : qui (mentions en tête), le verbe, puis ce qui suit. Sans verbe reconnu : une simple note. */
export function parseChange(tokens: ChangeToken[]): Change {
  const text = clean(tokens.map(tokenText).join(""));
  const who: string[] = [];
  let i = 0;
  // Mentions en tête, reliées par « et » ou des virgules.
  while (i < tokens.length) {
    const t = tokens[i];
    if ("id" in t) {
      who.push(t.id);
      i++;
    } else if (who.length > 0 && JOIN_RE.test(t.text) && tokens[i + 1] && "id" in tokens[i + 1]) i++;
    else break;
  }
  const restTokens = tokens.slice(i);
  const rest = restTokens.map(tokenText).join("");
  const lead = rest.replace(/^[\s,:]+/, "");
  for (const [verb, re] of VERB_RE) {
    const m = lead.match(re);
    if (!m || who.length === 0) continue;
    const skip = rest.length - lead.length + m[0].length;
    // Ce qui suit le verbe, avec les mentions qui s'y trouvent.
    let pos = 0;
    const refs: string[] = [];
    let what = "";
    for (const t of restTokens) {
      const s = tokenText(t);
      const end = pos + s.length;
      if (end > skip) {
        what += pos >= skip ? s : s.slice(skip - pos);
        if ("id" in t) refs.push(t.id);
      }
      pos = end;
    }
    return { who, verb, what: clean(what).replace(/[.;!]+$/, ""), refs, text };
  }
  return { who, verb: null, what: text, refs: tokens.filter((t): t is { id: string; title: string } => "id" in t).map((t) => t.id).filter((id) => !who.includes(id)), text };
}

export interface SceneChanges {
  id: string;
  changes?: string;
}

/** Tous les changements, dans l'ordre du récit (`order` : identifiants des scènes). */
export function changeLog(scenes: SceneChanges[], order: string[]): LoggedChange[] {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const log: LoggedChange[] = [];
  order.forEach((sceneId, index) => {
    for (const line of changeLines(byId.get(sceneId)?.changes)) log.push({ ...parseChange(line), sceneId, index });
  });
  return log;
}

/** Nombre de lignes d'une scène (compteur de la carte). */
export const changeCount = (html: string | undefined) => changeLines(html).length;

/** Clé d'une chose (apprise, reçue, promise) : la première carte citée, sinon le texte sans casse ni accents. */
export function thingKey(c: Pick<Change, "refs" | "what">): string {
  if (c.refs.length > 0) return `@${c.refs[0]}`;
  return c.what
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^(?:que|qu'|qu’|that|le|la|les|l'|l’|un|une|des|du|de|the|a|an)\s*/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface CharacterState {
  /** Dernier lieu où il se rend (carte citée ou texte), ou null. */
  place: { id: string | null; text: string } | null;
  /** Ce qu'il porte : reçu et pas encore perdu. */
  carries: { key: string; text: string }[];
  /** Ce qu'il sait. */
  knows: { key: string; text: string; sceneId: string }[];
  /** Ce que d'autres ont appris, et pas lui. */
  ignores: { key: string; text: string }[];
}

/** État d'un personnage après la scène de rang `index` (comprise). */
export function stateAt(characterId: string, log: LoggedChange[], index: number): CharacterState {
  const state: CharacterState = { place: null, carries: [], knows: [], ignores: [] };
  const learnedByOthers = new Map<string, string>();
  for (const c of log) {
    if (c.index > index) break;
    const mine = c.who.includes(characterId);
    const key = thingKey(c);
    if (c.verb === "apprend") {
      if (mine) {
        if (!state.knows.some((k) => k.key === key)) state.knows.push({ key, text: c.what, sceneId: c.sceneId });
      } else if (!learnedByOthers.has(key)) learnedByOthers.set(key, c.what);
    }
    if (!mine) continue;
    if (c.verb === "serend") state.place = { id: c.refs[0] ?? null, text: c.what };
    if (c.verb === "recoit" && !state.carries.some((k) => k.key === key)) state.carries.push({ key, text: c.what });
    if (c.verb === "perd") state.carries = state.carries.filter((k) => k.key !== key);
  }
  state.ignores = [...learnedByOthers].filter(([key]) => !state.knows.some((k) => k.key === key)).map(([key, text]) => ({ key, text }));
  return state;
}

export interface KnowledgeRow {
  key: string;
  text: string;
  /** Pour chaque personnage qui l'apprend : la première scène (rang et identifiant). */
  learned: Map<string, { index: number; sceneId: string }>;
}

/** « Qui sait quoi » : une ligne par chose apprise, dans l'ordre où elle apparaît pour la première fois. */
export function whoKnows(log: LoggedChange[]): KnowledgeRow[] {
  const rows = new Map<string, KnowledgeRow>();
  for (const c of log) {
    if (c.verb !== "apprend") continue;
    const key = thingKey(c);
    const row = rows.get(key) ?? { key, text: c.what, learned: new Map() };
    for (const who of c.who) if (!row.learned.has(who)) row.learned.set(who, { index: c.index, sceneId: c.sceneId });
    rows.set(key, row);
  }
  return [...rows.values()];
}

export interface ObjectTrack {
  key: string;
  text: string;
  /** Chaque passage de main en main, dans l'ordre du récit. */
  moves: { who: string[]; verb: "recoit" | "perd"; index: number; sceneId: string }[];
}

/** Les objets : ce qui est reçu ou perdu, avec ses porteurs au fil des scènes. */
export function objectTracks(log: LoggedChange[]): ObjectTrack[] {
  const tracks = new Map<string, ObjectTrack>();
  for (const c of log) {
    if (c.verb !== "recoit" && c.verb !== "perd") continue;
    const key = thingKey(c);
    const track = tracks.get(key) ?? { key, text: c.what, moves: [] };
    track.moves.push({ who: c.who, verb: c.verb, index: c.index, sceneId: c.sceneId });
    tracks.set(key, track);
  }
  return [...tracks.values()];
}

export interface Promise_ {
  key: string;
  text: string;
  made: LoggedChange;
  kept: LoggedChange | null;
}

/** Les promesses (« promet ») et la scène qui les tient (« tient », même chose citée), ou null. */
export function promises(log: LoggedChange[]): Promise_[] {
  const out: Promise_[] = [];
  for (const c of log) {
    if (c.verb === "promet") out.push({ key: thingKey(c), text: c.what, made: c, kept: null });
    if (c.verb === "tient") {
      const key = thingKey(c);
      const open = out.find((p) => !p.kept && (p.key === key || (!c.what && p.made.who.some((w) => c.who.includes(w)))));
      if (open) open.kept = c;
    }
  }
  return out;
}

export interface StoryStep {
  /** Rang de la dernière scène de l'étape : l'état est lu « après » elle. */
  index: number;
  /** Chapitre (numéro et titre) ou scène (titre). */
  kind: "chapter" | "scene";
  number: number;
  title: string;
}

/**
 * Étapes du curseur « Au fil des scènes » : par chapitre pour un roman qui en a, sinon par scène. Une étape
 * vaut la fin de son chapitre (l'état d'un personnage « au chapitre 3 » est celui de la fin du chapitre).
 */
export function storySteps(order: string[], titleOf: (id: string) => string, chapter: ((id: string) => { id: string; number: number; title: string } | null) | null): StoryStep[] {
  if (chapter && order.some((id) => chapter(id))) {
    const steps: StoryStep[] = [];
    order.forEach((id, index) => {
      const c = chapter(id);
      const last = steps[steps.length - 1];
      if (c && last?.kind === "chapter" && last.number === c.number) last.index = index;
      else if (c) steps.push({ index, kind: "chapter", number: c.number, title: c.title });
      else if (last) last.index = index;
    });
    return steps;
  }
  return order.map((id, index) => ({ index, kind: "scene", number: index + 1, title: titleOf(id) }));
}

/**
 * Ordre du récit pour le journal : celui du Plan (roman) ; celui du fichier Fountain (scénario), puis les
 * scènes pas encore écrites. Les pages hors récit n'y sont pas.
 */
export function projectStoryOrder(kind: "roman" | "scenario", nodes: Positioned[], plan: Plan, elements?: ScreenplayElement[] | null): string[] {
  const ids = storyScenes(nodes);
  if (kind !== "scenario" || !elements) return planOrder(plan, ids);
  const known = new Set(ids);
  const linked = [...new Set(listScenes(elements).map((s) => s.cardId ?? ""))].filter((id) => known.has(id));
  const written = new Set(linked);
  return [...linked, ...ids.filter((id) => !written.has(id))];
}
