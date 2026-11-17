// Assistant externe par MCP (#62, docs/plan-mcp.md) : instantané d'un projet pour le serveur MCP (`--mcp`,
// src-tauri/src/mcp.rs). Toute la logique de MondoWrite reste ici, en TypeScript : ordre du livre, chapitres,
// épisodes, texte des scènes en Markdown ou en Fountain, fiches avec leurs libellés. Le serveur ne fait que lire ce
// JSON. Fonctions pures.

import type { Edge } from "@xyflow/react";
import { fmt, type Messages } from "./i18n";
import type { CardData, ProjectKind } from "./types";
import type { CardNode } from "./projectState";
import { vocab } from "./vocab";
import { bookOrder, isPageKind } from "./book";
import { chapterNumbers, chapterOf, type Plan } from "./plan";
import { countWords, namesOf, type Manuscript } from "./manuscript";
import { ficheText, ficheValue, povOf, sceneStatus, sheetFields } from "./character";
import { valueLabels } from "./export/projectDocs";
import { htmlToMarkdown } from "./storage/markdown";
import type { Screenplay, ScreenplayElement } from "./screenplay/model";
import { listScenes, sceneSynopsis } from "./screenplay/scenes";
import { sceneBody } from "./screenplay/sceneText";
import { serialize } from "./screenplay/serialize";
import { seriesOf } from "./screenplay/series";
import { plainText } from "./search";
import { foldName } from "./names";
import type { Pitch } from "./pitch";
import type { McpAccess } from "./mcp";
import { END_TARGET, choicesIn, resolveTarget, withoutChoices } from "./interactive/choices";
import { interactiveScenes, interactiveSlugs } from "./interactive/scenes";
import { condValue, factLabel, givenFact, otherEffects, readFactLabels, storyFacts } from "./interactive/facts";
export { DEFAULT_MCP, mcpAllows, mcpWritable, readMcp, type McpAccess, type McpSettings } from "./mcp";

/** Version du format lu par le serveur (`format` de l'instantané). Le serveur ignore un autre numéro. */
export const MCP_FORMAT = 1;

export interface McpScene {
  /** Rang dans le récit, à partir de 1 : c'est par lui que l'IA désigne les scènes. */
  n: number;
  id: string;
  title: string;
  /** Chapitre, page du livre ou épisode. */
  part?: string;
  synopsis?: string;
  status?: string;
  pov?: string;
  /** Champs remplis de la fiche de la scène (but, obstacle…), libellés en clair. */
  fiche?: Record<string, string>;
  words: number;
  /** Markdown (roman) ou Fountain (scénario), sans les notes internes de MondoWrite. */
  text: string;
  /** Roman interactif (#84, lot 6) : les choix proposés au lecteur à la fin de la scène. */
  choices?: McpChoice[];
}

export interface McpChoice {
  label: string;
  /** Rang de la scène visée, ou absent pour la fin de l'histoire. */
  to?: number;
  /** Titre de la scène visée, « END » pour la fin, ou le nom introuvable tel qu'écrit. */
  target: string;
  end?: boolean;
  broken?: boolean;
  /** Condition en clair : un fait (« a trouvé la clé »), « pas : … », ou telle qu'écrite. */
  if?: string;
  /** Fait que le choix donne, et effets écrits à la main. */
  gives?: string;
  effects?: string[];
}

export interface McpFact {
  name: string;
  label: string;
  kind: "bool" | "int";
}

export interface McpCard {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  /** Une ligne : accroche d'un personnage, sinon le début des notes. */
  summary?: string;
  fiche?: Record<string, string>;
  notes?: string;
  links?: { id: string; title: string; label?: string }[];
  /** Rangs des scènes qui nomment la carte (titre, prénom, surnoms). */
  scenes?: number[];
}

export interface McpSnapshot {
  format: typeof MCP_FORMAT;
  app: string;
  savedAt: string;
  project: { title: string; kind: ProjectKind; kindLabel: string; access: McpAccess; logline?: string; resume?: string; labels: { logline: string; resume: string }; interactive?: boolean; facts?: McpFact[] };
  scenes: McpScene[];
  cards: McpCard[];
}

/** Ce que l'instantané lit du projet ouvert (un extrait de l'état du store). */
export interface McpSource {
  title: string;
  kind: ProjectKind;
  nodes: CardNode[];
  edges: Edge[];
  plan: Plan;
  manuscript: Manuscript;
  screenplay: Screenplay | null;
  pitch: Pitch;
  /** Accès accordé par l'auteur sur cet appareil (lecture par défaut) : le serveur refuse d'écrire sans « write ». */
  access?: McpAccess;
  /** Roman interactif montré à l'auteur (`showsInteractive`) : choix et faits partent avec les scènes. */
  interactive?: boolean;
  metaKeep?: Record<string, unknown>;
}

/** Mention d'une carte (`[@Titre](cosmos:id)`) écrite « @Titre » ; images de medias/ retirées. */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/\[@([^\]]+)\]\(cosmos:[^)]*\)/g, "@$1")
    .replace(/!\[[^\]]*\]\((?:\.\.\/)*medias\/[^)]*\)\n?/g, "")
    .trim();
}

/** Notes internes de MondoWrite dans un texte Fountain (`[[cosmos:…]]`, `[[ia]]`) : jamais montrées à l'IA. */
export const cleanFountain = (text: string) => text.replace(/ ?\[\[(?:cosmos:[^\]]*|ia)\]\]/g, "").replace(/\n{3,}/g, "\n\n").trim();

const fieldLabels = (t: Messages): Record<string, string> => ({ ...t.character.fields, ...t.fiche.fields });

/** Champs remplis d'une fiche, libellés en clair (champs-références écrits par le titre de la carte). */
function ficheOf(card: CardData, cards: CardData[], t: Messages, skip: ReadonlySet<string>): Record<string, string> | undefined {
  const labels = fieldLabels(t);
  const values = valueLabels(t);
  const out: Record<string, string> = {};
  for (const key of sheetFields(card.type)) {
    if (skip.has(key)) continue;
    const value = ficheValue(card, key, cards);
    if (value) out[labels[key] ?? key] = ficheText(key, value, values);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const SCENE_SKIP = new Set(["synopsis", "statut", "pov"]);
// « Personnage principal » sert à ranger, pas à lire (comme dans l'export de la Bible).
const CARD_SKIP = new Set(["principal", "accroche"]);

/** Types dont on relève les scènes qui les nomment. */
const NAMED_TYPES = new Set(["personnage", "lieu", "objet", "groupe", "evenement"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text: string, word: string) => new RegExp(`(?<![\\p{L}\\p{N}]-?)${escape(word)}(?!-?[\\p{L}\\p{N}])`, "u").test(text);

const firstLine = (text: string, max = 140) => {
  const line = text.split("\n").map((l) => l.replace(/^[#>*\-\s]+/, "").trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

/** Scènes d'un roman, dans l'ordre du livre (pages hors récit comprises). */
function novelScenes(s: McpSource, t: Messages, cards: CardData[]): McpScene[] {
  const order = bookOrder(s.nodes, s.plan);
  const numbers = chapterNumbers(s.plan, order);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: McpScene[] = [];
  for (const id of order) {
    const card = byId.get(id);
    if (!card) continue;
    const page = isPageKind(card.page) ? card.page : null;
    const chapter = page ? null : chapterOf(s.plan, id);
    const n = chapter ? (numbers.get(chapter.id) ?? 0) : 0;
    const part = page
      ? t.book.kinds[page]
      : chapter
        ? chapter.title.trim()
          ? fmt(t.chapters.numberedTitle, { n, title: chapter.title.trim() })
          : fmt(t.chapters.numbered, { n })
        : undefined;
    const html = s.manuscript[id] ?? "";
    out.push({
      n: out.length + 1,
      id,
      title: card.title.trim() || (page ? t.book.kinds[page] : t.manuscript.untitled),
      ...(part ? { part } : {}),
      ...sceneMeta(card, cards, t),
      words: countWords(html),
      text: cleanMarkdown(htmlToMarkdown(s.interactive ? withoutChoices(html) : html)),
    });
  }
  return out;
}

/** Synopsis (roman), statut, point de vue et fiche d'une carte Scène. */
function sceneMeta(card: CardData | undefined, cards: CardData[], t: Messages, synopsis?: string): Partial<McpScene> {
  const meta: Partial<McpScene> = {};
  const syn = (synopsis ?? card?.fiche?.synopsis ?? "").trim();
  if (syn) meta.synopsis = syn;
  if (!card) return meta;
  const status = sceneStatus(card);
  if (status) meta.status = t.sceneStatus.values[status];
  const pov = povOf(card, cards);
  if (pov?.title.trim()) meta.pov = pov.title.trim();
  const fiche = ficheOf(card, cards, t, SCENE_SKIP);
  if (fiche) meta.fiche = fiche;
  return meta;
}

/** Libellé de l'épisode qui contient l'élément `at` (« S1 · Ép. 2 · Tempête »), s'il y en a un. */
function episodeLabels(elements: ScreenplayElement[], t: Messages): (at: number) => string | undefined {
  const seasons = seriesOf(elements);
  const many = seasons.filter((s) => s.episodes.length > 0).length > 1;
  const episodes = seasons.flatMap((season, si) =>
    season.episodes.map((e) => {
      const name = `${t.goto.kinds.episode} ${e.number}${e.title.trim() ? ` · ${e.title.trim()}` : ""}`;
      return { at: e.at, end: e.end, label: many ? `${season.title.trim() || `${t.goto.kinds.season} ${si + 1}`} · ${name}` : name };
    }),
  );
  return (at) => episodes.find((e) => at > e.at && at < e.end)?.label;
}

/** Scènes d'un scénario, dans l'ordre du Fountain (sans les scènes omises), corps en Fountain. */
function screenplayScenes(sp: Screenplay | null, t: Messages, cards: CardData[]): McpScene[] {
  if (!sp) return [];
  const { elements } = sp;
  const partOf = episodeLabels(elements, t);
  const byId = new Map(cards.map((c) => [c.id, c]));
  return listScenes(elements).map((scene, i) => {
    const card = scene.cardId ? byId.get(scene.cardId) : undefined;
    const body = sceneBody(elements, scene.index);
    const text = cleanFountain(serialize({ titlePage: {}, elements: body }));
    const part = partOf(scene.index);
    return {
      n: i + 1,
      id: scene.cardId ?? `@${scene.index}`,
      title: cleanFountain(scene.text) || t.manuscript.untitled,
      ...(part ? { part } : {}),
      ...sceneMeta(card, cards, t, sceneSynopsis(elements, scene.index)),
      words: text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0,
      text,
    };
  });
}

/** Instantané du projet pour l'assistant externe. `now` et `app` : date d'enregistrement et version de l'app. */
export function buildMcpSnapshot(s: McpSource, t: Messages, now: Date, app: string): McpSnapshot {
  const cards = s.nodes.map((n) => n.data);
  const scenes = s.kind === "scenario" ? screenplayScenes(s.screenplay, t, cards) : novelScenes(s, t, cards);
  const interactive = s.interactive && s.kind !== "scenario" ? interactivePart(s, scenes) : null;
  const types = vocab(t, s.kind).types;
  const byId = new Map(cards.map((c) => [c.id, c]));
  // Texte des scènes replié une fois, pour relever qui y est nommé.
  const folded = scenes.map((sc) => foldName(s.kind === "scenario" ? sc.text : plainText(s.manuscript[sc.id] ?? "")));

  const out: McpCard[] = [];
  for (const card of cards) {
    if (card.type === "scene") continue;
    const notes = cleanMarkdown(htmlToMarkdown(card.html));
    const accroche = card.type === "personnage" ? (card.fiche?.accroche ?? "").trim() : "";
    const summary = accroche || firstLine(notes);
    const links = s.edges
      .filter((e) => e.source === card.id || e.target === card.id)
      .map((e) => {
        const other = byId.get(e.source === card.id ? e.target : e.source);
        const label = String(e.label ?? "").trim();
        return other ? { id: other.id, title: other.title.trim() || t.bible.untitled, ...(label ? { label } : {}) } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
    let named: number[] = [];
    if (NAMED_TYPES.has(card.type)) {
      const names = namesOf(card).filter((name) => name.length >= 2);
      if (names.length > 0) named = scenes.filter((_, i) => names.some((name) => hasWord(folded[i], name))).map((sc) => sc.n);
    }
    const fiche = ficheOf(card, cards, t, CARD_SKIP);
    out.push({
      id: card.id,
      type: card.type,
      typeLabel: types[card.type]?.label ?? card.type,
      title: card.title.trim() || t.bible.untitled,
      ...(summary ? { summary } : {}),
      ...(fiche ? { fiche } : {}),
      ...(notes ? { notes } : {}),
      ...(links.length > 0 ? { links } : {}),
      ...(named.length > 0 ? { scenes: named } : {}),
    });
  }
  // Rangées par type (ordre de la Bible), puis par titre.
  const rank = (type: string) => Object.keys(types).indexOf(type);
  out.sort((a, b) => rank(a.type) - rank(b.type) || a.title.localeCompare(b.title));

  const logline = s.pitch.logline?.trim();
  const resume = s.pitch.resume?.trim();
  return {
    format: MCP_FORMAT,
    app,
    savedAt: now.toISOString(),
    project: {
      title: s.title.trim() || t.pitch.untitled,
      kind: s.kind,
      // Un roman interactif le dit dès la liste des projets : l'assistant écrit ses choix autrement (set_choices).
      kindLabel: interactive ? t.interactive.settingLabel : t.kinds[s.kind],
      access: s.access ?? "read",
      ...(logline ? { logline } : {}),
      ...(resume ? { resume } : {}),
      labels: { logline: t.pitch.fields.logline, resume: t.pitch.fields.resume },
      ...(interactive ? { interactive: true, facts: interactive.facts } : {}),
    },
    scenes,
    cards: out,
  };
}

/** Roman interactif : choix de chaque scène (posés dans `scenes`) et faits du livre. */
function interactivePart(s: McpSource, scenes: McpScene[]): { facts: McpFact[] } {
  const refs = interactiveScenes(s.nodes, s.plan);
  const slugs = interactiveSlugs(s.nodes, s.plan);
  const labels = readFactLabels(s.metaKeep);
  const facts = storyFacts(s.manuscript, refs.map((r) => r.id), new Set(slugs.values()), labels);
  const byId = new Map(scenes.map((sc) => [sc.id, sc]));
  const labelOf = (name: string) => facts.find((f) => f.name === name)?.label ?? factLabel(name, labels);
  for (const scene of scenes) {
    const list: McpChoice[] = [];
    for (const line of choicesIn(s.manuscript[scene.id])) {
      if (line.kind !== "choice") continue;
      const to = resolveTarget(line.target, slugs);
      const target = to && to !== END_TARGET ? byId.get(to) : undefined;
      const cv = condValue(line.cond);
      const m = /^(has|not):(.+)$/.exec(cv);
      const cond = m ? (m[1] === "not" ? `not: ${labelOf(m[2])}` : labelOf(m[2])) : line.cond?.trim();
      const given = givenFact(line.effects);
      const others = otherEffects(line.effects);
      list.push({
        label: line.label,
        ...(target ? { to: target.n, target: target.title } : to === END_TARGET ? { target: "END", end: true } : { target: line.target, broken: true }),
        ...(cond ? { if: cond } : {}),
        ...(given ? { gives: labelOf(given) } : {}),
        ...(others.length ? { effects: others } : {}),
      });
    }
    if (list.length) scene.choices = list;
  }
  return { facts: facts.map((f) => ({ name: f.name, label: f.label, kind: f.kind })) };
}
