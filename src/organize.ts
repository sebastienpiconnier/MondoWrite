// « Organiser le canevas » : range toutes les cartes en groupes encadrés, d'après leur type et le plan.
// Fonction pure : elle calcule des positions et des cadres, le store les applique en une seule étape
// d'historique (Ctrl/Cmd+Z remet tout comme avant).
//
//   Personnages · Intrigues · Lieux · Thèmes · Questions   (une rangée de cadres)
//   Récit : [case du gabarit [chapitre [scènes]]]   (côte à côte, rangées de 8 scènes au plus)
//   Idées en vrac · Images · Liens · Documents · Pages du livre
//
// En paysage de préférence : un écran est plus large que haut. Les cases du gabarit (ou les chapitres,
// sans gabarit) se suivent de gauche à droite, et l'on passe à la rangée suivante avant 9 scènes.
//
// Les scènes sont reliées dans l'ordre du récit (un fil « puis » entre deux scènes qui se suivent).

import type { CardType, Frame } from "./types";
import { PLAN_TEMPLATES, arrange, chapterNumbers, groupByChapter, type Plan } from "./plan";

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
}

export interface OrganizeInput {
  cards: OrganizeCard[];
  plan: Plan;
  /** Cartes Scène dans l'ordre par défaut (celui du canevas), comme pour les fonctions de plan.ts. */
  sceneIds: string[];
  labels: OrganizeLabels;
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
/** Scènes au plus sur une rangée du récit. */
export const SCENES_PER_ROW = 8;

/** Colonnes d'un cadre de type : une seule rangée jusqu'à 4 cartes, puis plus large que haut. */
export const typeColumns = (n: number) => (n <= 4 ? Math.max(1, n) : Math.ceil(Math.sqrt(n * 2)));

type Item =
  | { kind: "card"; id: string; width: number; height: number }
  | { kind: "frame"; title: string; body: Layout }
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
const titleWidth = (title: string) => Math.ceil(title.length * 8.5) + 120;

function size(item: Item): Sized {
  if (item.kind === "card") return { width: item.width, height: item.height };
  const inner = layoutSize(item.body);
  // Un cadre étroit (une seule carte) s'élargit pour que son titre se lise en entier.
  return item.kind === "box" ? inner : { width: Math.max(inner.width + PAD.side * 2, titleWidth(item.title)), height: inner.height + PAD.top + PAD.bottom };
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
      out.frames.push({ id: newId(), title: item.title, x: Math.round(ix), y: Math.round(iy), width: Math.round(s.width), height: Math.round(s.height) });
      place(item.body, ix + PAD.side, iy + PAD.top, out, newId);
    }
  });
}

export function organize({ cards, plan, sceneIds, labels, origin, newId }: OrganizeInput): OrganizeResult {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const cardItem = (id: string): Item[] => {
    const c = byId.get(id);
    return c ? [{ kind: "card", id: c.id, width: c.width, height: c.height }] : [];
  };
  const ofType = (type: CardType) => cards.filter((c) => c.type === type).map((c) => c.id);
  const typeFrame = (type: CardType): Item[] => {
    const ids = ofType(type);
    return ids.length > 0 ? [{ kind: "frame", title: labels.groups[type], body: { items: ids.flatMap(cardItem), columns: typeColumns(ids.length), gap: GAP } }] : [];
  };
  /**
   * Groupes du récit (cases ou chapitres) de gauche à droite, en rangées de SCENES_PER_ROW scènes au plus.
   * Un groupe plus long que la limite occupe une rangée à lui seul (ses scènes passent à la ligne).
   */
  const inRows = (groups: { item: Item; count: number }[]): Item[] => {
    const rows: { item: Item; count: number }[][] = [];
    let current: { item: Item; count: number }[] = [];
    let total = 0;
    for (const g of groups) {
      if (current.length > 0 && total + g.count > SCENES_PER_ROW) {
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
  const sceneColumns = (n: number) => Math.max(1, Math.min(SCENES_PER_ROW, n));

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
  const chaptered = (ids: string[]): { item: Item; count: number }[] =>
    groupByChapter(plan, ids).map((g) => {
      const body: Layout = { items: g.ids.flatMap(cardItem), columns: sceneColumns(g.ids.length), gap: GAP };
      let item: Item = { kind: "box", body };
      if (g.chapter) {
        const n = numbers.get(g.chapter.id) ?? 0;
        const first = !titled.has(g.chapter.id);
        titled.add(g.chapter.id);
        item = { kind: "frame", title: first ? labels.chapter(n, g.chapter.title.trim()) : labels.continued(labels.chapter(n, "")), body };
      }
      return { item, count: g.ids.length };
    });
  const free = plan.template === "libre" || PLAN_TEMPLATES[plan.template].length <= 1;
  let story: Item[];
  if (free) {
    const groups = chaptered(beats[0]?.ids ?? []);
    const anyChapter = groups.some((g) => g.item.kind === "frame");
    story =
      groups.length === 0 ? [] : anyChapter ? inRows(groups) : [{ kind: "frame", title: labels.story, body: { items: groups.map((g) => g.item), columns: 1, gap: GAP } }];
  } else {
    const placed = beats
      .filter((b) => b.ids.length > 0)
      .map((b) => {
        const inner = chaptered(b.ids);
        const item: Item = { kind: "frame", title: labels.beat(b.key), body: { items: inner.map((g) => g.item), columns: Math.max(1, inner.length), gap: GROUP_GAP } };
        return { item, count: b.ids.length };
      });
    story = inRows(placed);
    if (unplaced.length > 0) {
      story.push({ kind: "frame", title: labels.unplaced, body: { items: unplaced.flatMap(cardItem), columns: sceneColumns(unplaced.length), gap: GAP } });
    }
  }

  const rows: Layout[] = [
    {
      items: [...typeFrame("personnage"), ...typeFrame("intrigue"), ...typeFrame("episode"), ...typeFrame("lieu"), ...typeFrame("theme"), ...typeFrame("question")],
      columns: 6,
      gap: GROUP_GAP,
    },
    // Les rangées du récit l'une sous l'autre (chacune de gauche à droite, voir inRows).
    { items: story, columns: 1, gap: GROUP_GAP },
    // Idées en vrac, puis les images et les liens collés sur le canevas.
    {
      items: [
        ...typeFrame("idee"),
        ...typeFrame("image"),
        ...typeFrame("lien"),
        ...typeFrame("document"),
        ...(pages.length > 0 ? [{ kind: "frame" as const, title: labels.pages, body: { items: pages.flatMap(cardItem), columns: typeColumns(pages.length), gap: GAP } }] : []),
      ],
      columns: 4,
      gap: GROUP_GAP,
    },
  ].filter((r) => r.items.length > 0);

  const out: OrganizeResult = { positions: new Map(), frames: [], sequence: [] };
  let y = origin.y;
  for (const row of rows) {
    place(row, origin.x, y, out, newId);
    y += layoutSize(row).height + ROW_GAP;
  }

  // Les scènes rangées se suivent : un fil de chacune à la suivante.
  const told = free ? order : beats.flatMap((b) => b.ids);
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
