// « Organiser le canevas » : range toutes les cartes en groupes encadrés, d'après leur type et le plan.
// Fonction pure : elle calcule des positions et des cadres, le store les applique en une seule étape
// d'historique (Ctrl/Cmd+Z remet tout comme avant).
//
//   Personnages · Intrigues · Lieux · Thèmes · Questions   (cadres côte à côte, à la ligne si besoin)
//   Récit : [case du gabarit [chapitre [scènes]]]   (côte à côte, en rangées de N scènes au plus)
//   Idées en vrac · Images · Liens · Documents · Pages du livre
//
// Un bloc compact, au format d'un écran : la largeur des rangées (N scènes, de 4 à 20) dépend du nombre de
// cartes. On essaie chaque N et l'on garde l'ensemble le plus proche du format 16/10, sans place perdue.
// Les cases du gabarit (ou les chapitres, sans gabarit) se suivent de gauche à droite.
//
// Les scènes sont reliées dans l'ordre du récit (un fil « puis » entre deux scènes qui se suivent).

import type { CardType, Frame } from "./types";
import { arrange, beatLevel, chapterNumbers, groupByChapter, templateBeats, type Plan } from "./plan";

export interface OrganizeCard {
  id: string;
  type: CardType;
  width: number;
  height: number;
}

export interface OrganizeLabels {
  /** Titre du cadre de chaque type (« Personnages »…). */
  groups: Record<CardType, string>;
  /** Titre du cadre d'une case de gabarit. */
  beat: (key: string) => string;
  /** Titre du cadre d'un chapitre : numéro et titre éventuel. */
  chapter: (n: number, title: string) => string;
  /** Un chapitre déjà commencé dans une case précédente du gabarit : « Chapitre 2 (suite) ». */
  continued: (label: string) => string;
  /** Scènes pas encore rangées dans une case. */
  unplaced: string;
  /** Cadre de toutes les scènes, quand le plan est libre et sans chapitre. */
  story: string;
  /** Cartes Scène hors récit (page de titre, dédicace, épilogue…). */
  pages: string;
  /** Série : titre du cadre d'un épisode (« Ép. 3 · Tempête »), d'une saison sans titre, des scènes hors épisode. */
  episode?: (n: number, title: string) => string;
  seasonUntitled?: string;
  outside?: string;
}

/** Série écrite dans le Fountain (screenplay/series.ts) : saisons, épisodes et leurs scènes, dans l'ordre. */
export interface OrganizeSeries {
  /** Saison `id: null` : les épisodes écrits avant toute section de saison (sans cadre de saison). */
  seasons: {
    id: string | null;
    title: string;
    /** `beats` : cases du gabarit de l'épisode (lot 3), dans l'ordre, avec leurs scènes. */
    episodes: { id: string; title: string; number: number; scenes: string[]; beats?: { key: string; label: string; scenes: string[]; level?: number }[] }[];
  }[];
  /** Scènes écrites avant le premier épisode. */
  outside: string[];
}

export interface OrganizeInput {
  cards: OrganizeCard[];
  plan: Plan;
  /** Cartes Scène dans l'ordre par défaut (celui du canevas), comme pour les fonctions de plan.ts. */
  sceneIds: string[];
  labels: OrganizeLabels;
  /** Série : remplace les cases du gabarit par les cadres saison › épisode ; les autres scènes vont « À placer ». */
  series?: OrganizeSeries;
  /** Coin haut gauche de l'ensemble. */
  origin: { x: number; y: number };
  newId: () => string;
}

export interface OrganizeResult {
  positions: Map<string, { x: number; y: number }>;
  frames: Frame[];
  /** Fils à tirer entre scènes qui se suivent : [source, cible]. */
  sequence: [string, string][];
}

const GAP = 32; // entre deux cartes
const GROUP_GAP = 56; // entre deux cadres
const ROW_GAP = 96; // entre deux rangées de l'ensemble
const PAD = { side: 32, top: 64, bottom: 32 }; // marge intérieure d'un cadre (titre en haut)
/** Marge du haut d'une case de gabarit : son titre est plus grand et porte son rang (« Case 3 sur 15 », FrameNode). */
// En-tête d'une case (titre et rang) puis sa description sur deux lignes (`.frame-hint`).
const BEAT_TOP = 124;
const padTop = (item: { beat?: string; season?: string }) => (item.beat || item.season ? BEAT_TOP : PAD.top);
/** Une rangée du récit compte au moins 4 scènes (un petit récit reste sur une ligne)… */
const MIN_SCENES_PER_ROW = 4;
/** … et au plus 20. */
export const MAX_SCENES_PER_ROW = 20;
/** Format visé pour l'ensemble rangé : celui d'un écran. */
const TARGET_RATIO = 16 / 10;

/** Colonnes d'un cadre de type : une seule rangée jusqu'à 4 cartes, puis plus large que haut. */
export const typeColumns = (n: number) => (n <= 4 ? Math.max(1, n) : Math.ceil(Math.sqrt(n * 2)));

type Item =
  | { kind: "card"; id: string; width: number; height: number }
  | { kind: "frame"; title: string; body: Layout; beat?: string; season?: string; episode?: string }
  | { kind: "box"; body: Layout }; // groupe sans cadre

interface Layout {
  items: Item[];
  /** Nombre d'éléments par ligne (lecture de gauche à droite, puis de haut en bas). */
  columns: number;
  gap: number;
}

interface Sized {
  width: number;
  height: number;
}

/** Largeur du titre d'un cadre (police de 16 px, environ 8,5 px par caractère, marges de l'en-tête et ses boutons). */
/** Largeur que demande le titre d'un cadre : 26 px pour un cadre de premier niveau, 30 px pour une case (canvas.css). */
const titleWidth = (title: string, beat?: string) => Math.ceil(title.length * (beat ? 17 : 14.5)) + 120;

function size(item: Item): Sized {
  if (item.kind === "card") return { width: item.width, height: item.height };
  const inner = layoutSize(item.body);
  // Un cadre étroit (une seule carte) s'élargit pour que son titre se lise en entier.
  return item.kind === "box" ? inner : { width: Math.max(inner.width + PAD.side * 2, titleWidth(item.title, item.beat ?? item.season)), height: inner.height + padTop(item) + PAD.bottom };
}

/** Largeur de chaque colonne et hauteur de chaque ligne d'une grille. */
function grid(layout: Layout) {
  const sizes = layout.items.map(size);
  const columns = Math.max(1, Math.min(layout.columns, sizes.length));
  const widths = Array.from({ length: columns }, (_, c) => Math.max(0, ...sizes.filter((_, i) => i % columns === c).map((s) => s.width)));
  const rows = Math.ceil(sizes.length / columns);
  const heights = Array.from({ length: rows }, (_, r) => Math.max(0, ...sizes.slice(r * columns, (r + 1) * columns).map((s) => s.height)));
  return { sizes, columns, widths, heights };
}

function layoutSize(layout: Layout): Sized {
  if (layout.items.length === 0) return { width: 240, height: 80 };
  const { widths, heights } = grid(layout);
  return {
    width: widths.reduce((a, b) => a + b, 0) + layout.gap * (widths.length - 1),
    height: heights.reduce((a, b) => a + b, 0) + layout.gap * (heights.length - 1),
  };
}

function place(layout: Layout, x: number, y: number, out: OrganizeResult, newId: () => string) {
  const { columns, widths, heights } = grid(layout);
  layout.items.forEach((item, i) => {
    const c = i % columns;
    const r = Math.floor(i / columns);
    const ix = x + widths.slice(0, c).reduce((a, b) => a + b, 0) + layout.gap * c;
    const iy = y + heights.slice(0, r).reduce((a, b) => a + b, 0) + layout.gap * r;
    if (item.kind === "card") {
      out.positions.set(item.id, { x: Math.round(ix), y: Math.round(iy) });
    } else if (item.kind === "box") {
      place(item.body, ix, iy, out, newId);
    } else {
      const s = size(item);
      // Le cadre extérieur d'abord : il se dessine derrière ceux qu'il contient.
      out.frames.push({ id: newId(), title: item.title, x: Math.round(ix), y: Math.round(iy), width: Math.round(s.width), height: Math.round(s.height), ...(item.beat ? { beat: item.beat } : {}), ...(item.season ? { season: item.season } : {}), ...(item.episode ? { episode: item.episode } : {}) });
      place(item.body, ix + PAD.side, iy + padTop(item), out, newId);
    }
  });
}

/** Rangées de l'ensemble pour N scènes par rangée, et l'ordre des scènes à relier. */
function build({ cards, plan, sceneIds, labels, series }: OrganizeInput, perRow: number): { rows: Layout[]; told: string[] } {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const cardItem = (id: string): Item[] => {
    const c = byId.get(id);
    return c ? [{ kind: "card", id: c.id, width: c.width, height: c.height }] : [];
  };
  const ofType = (type: CardType) => cards.filter((c) => c.type === type).map((c) => c.id);
  // Un cadre de type n'est jamais plus large qu'une rangée de scènes.
  const columnsFor = (n: number) => Math.max(1, Math.min(typeColumns(n), perRow));
  const typeFrame = (type: CardType): Item[] => {
    const ids = ofType(type);
    return ids.length > 0 ? [{ kind: "frame", title: labels.groups[type], body: { items: ids.flatMap(cardItem), columns: columnsFor(ids.length), gap: GAP } }] : [];
  };
  /**
   * Groupes du récit (cases ou chapitres) de gauche à droite, en rangées de perRow scènes au plus.
   * Un groupe plus long que la limite occupe une rangée à lui seul (ses scènes passent à la ligne).
   */
  const inRows = (groups: { item: Item; count: number }[]): Item[] => {
    const rows: { item: Item; count: number }[][] = [];
    let current: { item: Item; count: number }[] = [];
    let total = 0;
    for (const g of groups) {
      if (current.length > 0 && total + g.count > perRow) {
        rows.push(current);
        current = [];
        total = 0;
      }
      current.push(g);
      total += g.count;
    }
    if (current.length > 0) rows.push(current);
    return rows.map((row): Item => ({ kind: "box", body: { items: row.map((g) => g.item), columns: row.length, gap: GROUP_GAP } }));
  };
  const sceneColumns = (n: number) => Math.max(1, Math.min(perRow, n));

  // Récit : les scènes dans les cases du gabarit, regroupées par chapitre.
  const scenes = sceneIds.filter((id) => byId.get(id)?.type === "scene");
  // Les cartes Scène hors du récit (pages du livre) ont leur propre cadre, à la fin.
  const story_ = new Set(scenes);
  const pages = ofType("scene").filter((id) => !story_.has(id));
  const { beats, unplaced } = arrange(plan, scenes);
  const order = [...beats.flatMap((b) => b.ids), ...unplaced];
  const numbers = chapterNumbers(plan, order);
  // Les chapitres d'un groupe se suivent de gauche à droite, leurs scènes aussi.
  // Un chapitre réparti sur plusieurs cases du gabarit : son titre complet dans la première, « (suite) » ensuite.
  const titled = new Set<string>();
  const chaptered = (ids: string[]): { item: Item; count: number }[] => withActs(chapterGroups(ids));
  // Actes d'un scénario (#140) : les séquences qui se suivent sous un même acte vont dans son cadre.
  const withActs = (groups: { item: Item; count: number; act?: { id: string; title: string } }[]): { item: Item; count: number }[] => {
    const out: { item: Item; count: number }[] = [];
    let i = 0;
    while (i < groups.length) {
      const act = groups[i].act;
      if (!act) {
        out.push(groups[i]);
        i++;
        continue;
      }
      const run: typeof groups = [];
      while (i < groups.length && groups[i].act?.id === act.id) run.push(groups[i++]);
      out.push({ item: { kind: "frame", title: act.title, body: { items: run.map((g) => g.item), columns: Math.max(1, run.length), gap: GROUP_GAP } }, count: run.reduce((n, g) => n + g.count, 0) });
    }
    return out;
  };
  const chapterGroups = (ids: string[]): { item: Item; count: number; act?: { id: string; title: string } }[] =>
    groupByChapter(plan, ids).map((g) => {
      const body: Layout = { items: g.ids.flatMap(cardItem), columns: sceneColumns(g.ids.length), gap: GAP };
      let item: Item = { kind: "box", body };
      if (g.chapter) {
        const n = numbers.get(g.chapter.id) ?? 0;
        const first = !titled.has(g.chapter.id);
        titled.add(g.chapter.id);
        item = { kind: "frame", title: first ? labels.chapter(n, g.chapter.title.trim()) : labels.continued(labels.chapter(n, "")), body };
      }
      const act = (g.chapter as { act?: { id: string; title: string } } | null)?.act;
      return { item, count: g.ids.length, ...(act ? { act } : {}) };
    });
  // Une seule case de l'auteur (une séquence posée, #148) garde son cadre.
  const free = !series && (plan.template === "libre" || (plan.template !== "perso" && templateBeats(plan.template, plan.custom).length <= 1));
  let story: Item[];
  let seriesOrder: string[] = [];
  if (series) {
    // Série : un cadre par saison, un cadre par épisode dedans (de gauche à droite, en rangées), ses scènes à
    // l'intérieur. Un épisode vide compte pour une scène : on y dépose une scène.
    const known = new Set(scenes);
    const keep = (ids: string[]) => ids.filter((id) => known.has(id));
    story = [];
    const outside = keep(series.outside);
    if (outside.length > 0) story.push({ kind: "frame", title: labels.outside ?? labels.unplaced, body: { items: outside.flatMap(cardItem), columns: sceneColumns(outside.length), gap: GAP } });
    seriesOrder = [...outside];
    for (const season of series.seasons) {
      const episodes = season.episodes.map((ep) => {
        const ids = keep(ep.scenes);
        seriesOrder.push(...ids);
        const title = labels.episode ? labels.episode(ep.number, ep.title.trim()) : ep.title;
        if (ep.beats && ep.beats.length > 0) {
          // Cases du gabarit de l'épisode, de gauche à droite, chacune avec ses scènes ; une case vide compte pour une.
          const inBeats = new Set(ep.beats.flatMap((b) => b.scenes));
          const loose = ids.filter((id) => !inBeats.has(id));
          // Structure imbriquée (#111, #148 : actes et séquences) : une case qui a des sous-cases les contient.
          type EpNode = { b: NonNullable<typeof ep.beats>[number]; children: EpNode[] };
          const roots: EpNode[] = [];
          const stack: EpNode[] = [];
          for (const b of ep.beats) {
            const node: EpNode = { b, children: [] };
            while (stack.length > 0 && (stack[stack.length - 1].b.level ?? 1) >= (b.level ?? 1)) stack.pop();
            (stack.length > 0 ? stack[stack.length - 1].children : roots).push(node);
            stack.push(node);
          }
          const beatItem = (node: EpNode): Item => {
            const inner = chaptered(keep(node.b.scenes));
            const kids = node.children.map(beatItem);
            const items: Item[] = [...inner.map((g) => g.item), ...kids];
            return { kind: "frame", title: node.b.label, beat: node.b.key, episode: ep.id, body: { items, columns: Math.max(1, items.length), gap: GROUP_GAP } };
          };
          const beatItems: Item[] = roots.map(beatItem);
          const items: Item[] = [...(loose.length > 0 ? [{ kind: "box" as const, body: { items: loose.flatMap(cardItem), columns: sceneColumns(loose.length), gap: GAP } }] : []), ...beatItems];
          const count = loose.length + ep.beats.reduce((a, b) => a + Math.max(1, keep(b.scenes).length), 0);
          const item: Item = { kind: "frame", title, episode: ep.id, body: { items, columns: items.length, gap: GROUP_GAP } };
          return { item, count };
        }
        // Séquences de l'épisode (#140) : un cadre chacune, dans le cadre de l'épisode.
        const groups = chaptered(ids);
        const body: Layout = groups.some((g) => g.item.kind === "frame")
          ? { items: groups.map((g) => g.item), columns: groups.length, gap: GROUP_GAP }
          : { items: ids.flatMap(cardItem), columns: sceneColumns(ids.length), gap: GAP };
        const item: Item = { kind: "frame", title, episode: ep.id, body };
        return { item, count: Math.max(1, ids.length) };
      });
      const rows = inRows(episodes);
      if (season.id === null) story.push(...rows);
      else story.push({ kind: "frame", title: season.title.trim() || labels.seasonUntitled || "", season: season.id, body: { items: rows, columns: 1, gap: GROUP_GAP } });
    }
    const placed = new Set(seriesOrder);
    const waiting = scenes.filter((id) => !placed.has(id));
    if (waiting.length > 0) story.push({ kind: "frame", title: labels.unplaced, body: { items: waiting.flatMap(cardItem), columns: sceneColumns(waiting.length), gap: GAP } });
  } else if (free) {
    const groups = chaptered(beats[0]?.ids ?? []);
    const anyChapter = groups.some((g) => g.item.kind === "frame");
    story =
      groups.length === 0 ? [] : anyChapter ? inRows(groups) : [{ kind: "frame", title: labels.story, body: { items: groups.map((g) => g.item), columns: 1, gap: GAP } }];
  } else {
    // Toutes les cases, même vides : le canevas montre la structure entière, trous compris, et l'on dépose
    // une scène dans une case vide. Une case vide compte pour une scène dans la rangée.
    const leaf = (b: (typeof beats)[number]) => {
      const inner = chaptered(b.ids);
      const item: Item = { kind: "frame", title: labels.beat(b.key), beat: b.key, body: { items: inner.map((g) => g.item), columns: Math.max(1, inner.length), gap: GROUP_GAP } };
      return { item, count: Math.max(1, b.ids.length) };
    };
    // Gabarit imbriqué (#111) : un ensemble est un cadre qui contient ceux de ses sous-cases (de gauche à droite,
    // en rangées), ses propres scènes d'abord. Les cases d'un même niveau se suivent comme des cases ordinaires.
    type Node = { b: (typeof beats)[number]; level: number; children: Node[] };
    const roots: Node[] = [];
    const stack: Node[] = [];
    for (const b of beats) {
      const node: Node = { b, level: plan.template === "perso" ? beatLevel(plan.custom, b.key) : 1, children: [] };
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
      (stack.length > 0 ? stack[stack.length - 1].children : roots).push(node);
      stack.push(node);
    }
    const placedOf = (node: Node): { item: Item; count: number } => {
      if (node.children.length === 0) return leaf(node.b);
      const own = chaptered(node.b.ids);
      const kids = node.children.map(placedOf);
      const count = node.b.ids.length + kids.reduce((a, k) => a + k.count, 0);
      const rows = count > perRow ? inRows(kids) : [{ kind: "box" as const, body: { items: kids.map((k) => k.item), columns: kids.length, gap: GROUP_GAP } }];
      const items: Item[] = [...(own.length > 0 ? [{ kind: "box" as const, body: { items: own.map((g) => g.item), columns: own.length, gap: GROUP_GAP } }] : []), ...rows];
      return { item: { kind: "frame", title: labels.beat(node.b.key), beat: node.b.key, body: { items, columns: 1, gap: GROUP_GAP } }, count };
    };
    story = inRows(roots.map(placedOf));
    if (unplaced.length > 0) {
      story.push({ kind: "frame", title: labels.unplaced, body: { items: unplaced.flatMap(cardItem), columns: sceneColumns(unplaced.length), gap: GAP } });
    }
  }

  // Les cadres de type se rangent sur la largeur du récit (ou de perRow cartes), à la ligne si besoin.
  const widest = Math.max(240, ...cards.map((c) => c.width));
  const storyLayout: Layout = { items: story, columns: 1, gap: GROUP_GAP };
  const width = Math.max(story.length > 0 ? layoutSize(storyLayout).width : 0, perRow * (widest + GAP) - GAP);
  const shelves = (items: Item[]): Layout => {
    const lines: Item[][] = [];
    let line: Item[] = [];
    let used = 0;
    for (const item of items) {
      const w = size(item).width;
      if (line.length > 0 && used + GROUP_GAP + w > width) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length > 0 ? GROUP_GAP : 0) + w;
      line.push(item);
    }
    if (line.length > 0) lines.push(line);
    return { items: lines.map((l): Item => ({ kind: "box", body: { items: l, columns: l.length, gap: GROUP_GAP } })), columns: 1, gap: GROUP_GAP };
  };

  const rows: Layout[] = [
    shelves([...typeFrame("personnage"), ...typeFrame("intrigue"), ...typeFrame("episode"), ...typeFrame("secret"), ...typeFrame("lieu"), ...typeFrame("groupe"), ...typeFrame("objet"), ...typeFrame("evenement"), ...typeFrame("regle"), ...typeFrame("theme"), ...typeFrame("question")]),
    // Les rangées du récit l'une sous l'autre (chacune de gauche à droite, voir inRows).
    storyLayout,
    // Idées en vrac, puis les images et les liens collés sur le canevas.
    shelves([
      ...typeFrame("idee"),
      ...typeFrame("image"),
      ...typeFrame("lien"),
      ...typeFrame("document"),
      ...(pages.length > 0 ? [{ kind: "frame" as const, title: labels.pages, body: { items: pages.flatMap(cardItem), columns: columnsFor(pages.length), gap: GAP } }] : []),
    ]),
  ].filter((r) => r.items.length > 0);

  return { rows, told: series ? seriesOrder : free ? order : beats.flatMap((b) => b.ids) };
}

/** Taille de l'ensemble : les rangées l'une sous l'autre. */
function bounds(rows: Layout[]): Sized {
  const sizes = rows.map(layoutSize);
  return {
    width: Math.max(0, ...sizes.map((s) => s.width)),
    height: sizes.reduce((a, s) => a + s.height, 0) + ROW_GAP * Math.max(0, sizes.length - 1),
  };
}

/** Écart au bloc idéal : loin du format d'un écran, ou de la place perdue autour des cartes. */
function spread(rows: Layout[], cards: OrganizeCard[]): number {
  const { width, height } = bounds(rows);
  if (width <= 0 || height <= 0) return 0;
  const filled = cards.reduce((a, c) => a + (c.width + GAP) * (c.height + GAP), 0) || 1;
  return Math.abs(Math.log(width / height / TARGET_RATIO)) + 0.5 * Math.log(Math.max(1, (width * height) / filled));
}

export function organize(input: OrganizeInput): OrganizeResult {
  const { origin, newId, cards } = input;
  // On essaie chaque largeur de rangée et l'on garde le bloc le plus compact (à égalité, la plus étroite).
  let best = build(input, MIN_SCENES_PER_ROW);
  let score = spread(best.rows, cards);
  for (let perRow = MIN_SCENES_PER_ROW + 1; perRow <= MAX_SCENES_PER_ROW; perRow++) {
    const next = build(input, perRow);
    const s = spread(next.rows, cards);
    if (s < score - 1e-9) {
      best = next;
      score = s;
    }
  }

  const out: OrganizeResult = { positions: new Map(), frames: [], sequence: [] };
  let y = origin.y;
  for (const row of best.rows) {
    place(row, origin.x, y, out, newId);
    y += layoutSize(row).height + ROW_GAP;
  }

  // Les scènes rangées se suivent : un fil de chacune à la suivante.
  const told = best.told;
  for (let i = 1; i < told.length; i++) out.sequence.push([told[i - 1], told[i]]);
  return out;
}

/**
 * Le récit a changé d'ordre (Plan, Manuscrit, séquencier) sur un canevas qui n'a pas été rangé par
 * « Organiser » : les scènes échangent leurs places. Les places restent celles de l'auteur, lues de haut en
 * bas puis de gauche à droite (l'ordre par défaut du Plan) ; la n-ième revient à la n-ième scène du récit.
 * Rend seulement les positions qui changent.
 */
export function reorderSlots(cards: { id: string; x: number; y: number }[], order: string[]): Map<string, { x: number; y: number }> {
  const known = new Set(cards.map((c) => c.id));
  const wanted = order.filter((id) => known.has(id));
  const slots = cards
    .filter((c) => wanted.includes(c.id))
    .map((c) => ({ x: c.x, y: c.y }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const out = new Map<string, { x: number; y: number }>();
  const at = new Map(cards.map((c) => [c.id, c]));
  wanted.forEach((id, i) => {
    const slot = slots[i];
    const card = at.get(id)!;
    if (slot.x !== card.x || slot.y !== card.y) out.set(id, slot);
  });
  return out;
}
