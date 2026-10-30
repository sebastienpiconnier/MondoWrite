// Corbeille d'un projet : une carte supprimée n'est pas effacée, elle passe dans corbeille/<id>.md
// (même format qu'une carte, avec une ligne `corbeille:` en plus) et peut revenir à sa place.
// Fonctions pures. Le texte du manuscrit d'une scène ne bouge pas (manuscrit/<id>.md reste) ; dans un
// scénario, la scène entière (en-tête et texte) part avec sa carte et revient avec elle.

import type { CardData } from "./types";
import { readWireFiche, type WireFiche } from "./wires";
import type { Screenplay } from "./screenplay/model";
import { parse } from "./screenplay/parse";
import { serialize } from "./screenplay/serialize";

/** Fil d'une carte mise à la corbeille, vers une carte restée sur le canevas. */
export interface TrashLink {
  id: string;
  other: string;
  /** La carte était la source du fil. */
  out: boolean;
  label: string;
  /** Fiche du fil (histoire, enjeu, évolution), qui revient avec lui. */
  fiche?: WireFiche;
}

export interface TrashInfo {
  /** Jour de la suppression (AAAA-MM-JJ). */
  date: string;
  x: number;
  y: number;
  width?: number;
  links: TrashLink[];
  /** Scénario : la scène de la carte (en-tête et texte), en Fountain. */
  scene?: string;
}

const isLink = (v: unknown): v is TrashLink => {
  const l = v as TrashLink;
  return !!l && typeof l.id === "string" && typeof l.other === "string" && typeof l.out === "boolean" && typeof l.label === "string";
};

/** Ligne `corbeille:` lue sur disque : tout ce qui n'a pas la bonne forme est ignoré. */
export function readTrashInfo(raw: unknown): TrashInfo | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    date: r.date,
    x: num(r.x),
    y: num(r.y),
    ...(typeof r.width === "number" && Number.isFinite(r.width) ? { width: r.width } : {}),
    links: Array.isArray(r.links)
      ? r.links.filter(isLink).map((l) => {
          const fiche = readWireFiche(l.fiche);
          return { id: l.id, other: l.other, out: l.out, label: l.label, ...(fiche ? { fiche } : {}) };
        })
      : [],
    ...(typeof r.scene === "string" && r.scene.trim() ? { scene: r.scene } : {}),
  };
}

/** Une carte dans la corbeille. */
export type TrashedCard = CardData & { trashed: TrashInfo };

/** Bornes de la scène liée à une carte dans le scénario : de son en-tête jusqu'au prochain en-tête ou section. */
function sceneRange(screenplay: Screenplay, cardId: string): [number, number] | null {
  const start = screenplay.elements.findIndex((el) => el.type === "sceneHeading" && el.cardId === cardId);
  if (start < 0) return null;
  let end = start + 1;
  while (end < screenplay.elements.length && !["sceneHeading", "section"].includes(screenplay.elements[end].type)) end++;
  return [start, end];
}

/**
 * Met une carte à la corbeille. Rend l'entrée de corbeille et le scénario sans la scène de la carte
 * (même objet s'il n'y en avait pas).
 */
export function trashCard(
  card: CardData,
  place: { x: number; y: number; width?: number },
  edges: { id: string; source: string; target: string; label?: unknown; data?: Record<string, unknown> }[],
  screenplay: Screenplay | null,
  date: string,
): { entry: TrashedCard; screenplay: Screenplay | null } {
  const links = edges
    .filter((e) => e.source === card.id || e.target === card.id)
    .map((e) => {
      const fiche = readWireFiche(e.data?.fiche);
      return { id: e.id, other: e.source === card.id ? e.target : e.source, out: e.source === card.id, label: String(e.label ?? ""), ...(fiche ? { fiche } : {}) };
    });
  const range = screenplay ? sceneRange(screenplay, card.id) : null;
  let scene: string | undefined;
  let next = screenplay;
  if (screenplay && range) {
    scene = serialize({ titlePage: {}, elements: screenplay.elements.slice(...range) }).trim();
    next = { ...screenplay, elements: [...screenplay.elements.slice(0, range[0]), ...screenplay.elements.slice(range[1])] };
  }
  const { trashed: _old, ...rest } = card as TrashedCard;
  return {
    entry: { ...rest, trashed: { date, x: Math.round(place.x), y: Math.round(place.y), ...(place.width ? { width: place.width } : {}), links, ...(scene ? { scene } : {}) } },
    screenplay: next,
  };
}

/**
 * Sort une carte de la corbeille : la carte (sans `trashed`), ses fils vers des cartes encore là, et le
 * scénario avec sa scène remise à la fin (si elle n'y est pas déjà).
 */
export function restoreCard(
  entry: TrashedCard,
  existing: Set<string>,
  screenplay: Screenplay | null,
): { card: CardData; links: { id: string; source: string; target: string; label: string; fiche?: WireFiche }[]; screenplay: Screenplay | null } {
  const { trashed, ...card } = entry;
  const links = trashed.links
    .filter((l) => existing.has(l.other))
    .map((l) => ({ id: l.id, source: l.out ? card.id : l.other, target: l.out ? l.other : card.id, label: l.label, ...(l.fiche ? { fiche: l.fiche } : {}) }));
  let next = screenplay;
  if (screenplay && trashed.scene && !sceneRange(screenplay, card.id)) {
    const elements = parse(trashed.scene).elements;
    if (elements.length > 0) next = { ...screenplay, elements: [...screenplay.elements, ...elements] };
  }
  return { card, links, screenplay: next };
}
