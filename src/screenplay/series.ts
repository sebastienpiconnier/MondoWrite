// Série écrite saison par saison, épisode par épisode (docs/plan-episodes.md). Tout est dans scenario.fountain :
// une saison est une section de niveau 1 (« # Saison 1 : La relève [[cosmos:season:<id>]] »), un épisode une
// section de niveau 2 (« ## Le signal [[cosmos:episode:<id>]] »), son synopsis la ligne « = … » juste dessous.
// Les autres logiciels voient de simples sections ; la note (identifiant stable) ne s'affiche jamais.
// Un épisode va de sa section à la section de saison ou d'épisode suivante ; ses cases de gabarit, ses sections
// à lui et ses scènes sont dedans. Une scène appartient à l'épisode dans lequel elle est écrite.
// La vue Scénario lit l'épisode ouvert seul (`episodeScript`) et y écrit (`withEpisodeScript`) ; ses rangs
// d'éléments sont locaux, `episodeOffset` les ramène au scénario entier.
// Fonctions pures ; elles rendent le même objet quand rien ne change.

import type { Screenplay, ScreenplayElement } from "./model";

export type SeriesKind = "season" | "episode";

const NOTE_RE = /\s*\[\[cosmos:(season|episode):([A-Za-z0-9_-]+)\]\]/;
const ANY_NOTE_RE = /\s*\[\[cosmos:(?:season|episode|beat):[A-Za-z0-9_-]+\]\]/g;

/** Saison ou épisode porté par une section, sinon null. */
export function seriesMark(el: ScreenplayElement | undefined): { kind: SeriesKind; id: string } | null {
  if (el?.type !== "section") return null;
  const m = NOTE_RE.exec(el.text);
  return m ? { kind: m[1] as SeriesKind, id: m[2] } : null;
}

/** Texte d'une section sans ses notes (saison, épisode, case de gabarit) : ce que l'auteur lit. */
export const plainSection = (text: string): string => text.replace(ANY_NOTE_RE, "").trim();

const section = (kind: SeriesKind, id: string, title: string): ScreenplayElement => ({
  type: "section",
  depth: kind === "season" ? 1 : 2,
  text: `${title.trim()} [[cosmos:${kind}:${id}]]`.trim(),
});

export interface Episode {
  id: string;
  title: string;
  /** Saison qui le contient (null : avant toute saison). */
  season: string | null;
  /** Rang dans sa saison, à partir de 1 : c'est son numéro, jamais écrit. */
  number: number;
  /** Rang de sa section dans le scénario. */
  at: number;
  /** Premier élément de son texte (après la section et son synopsis), et premier élément après lui. */
  start: number;
  end: number;
  synopsis: string;
}

export interface Season {
  /** null : les épisodes écrits avant toute section de saison. */
  id: string | null;
  title: string;
  /** Rang de sa section (-1 pour la saison sans section). */
  at: number;
  /** Premier élément après la saison (section de saison suivante, ou fin). */
  end: number;
  episodes: Episode[];
}

/** Fin d'une partie qui commence au rang `at` : la prochaine section de saison (ou aussi d'épisode). */
function nextMark(elements: ScreenplayElement[], at: number, kinds: SeriesKind[]): number {
  for (let i = at + 1; i < elements.length; i++) {
    const mark = seriesMark(elements[i]);
    if (mark && kinds.includes(mark.kind)) return i;
  }
  return elements.length;
}

const synopsisEnd = (elements: ScreenplayElement[], at: number) => {
  let i = at + 1;
  while (elements[i]?.type === "synopsis") i++;
  return i;
};

const cache = new WeakMap<ScreenplayElement[], Season[]>();

/** Saisons et épisodes, dans l'ordre du fichier. Vide hors d'une série. */
export function seriesOf(elements: ScreenplayElement[]): Season[] {
  const cached = cache.get(elements);
  if (cached) return cached;
  const seasons: Season[] = [];
  elements.forEach((el, at) => {
    const mark = seriesMark(el);
    if (!mark) return;
    if (mark.kind === "season") {
      seasons.push({ id: mark.id, title: plainSection(el.text), at, end: nextMark(elements, at, ["season"]), episodes: [] });
      return;
    }
    let season = seasons[seasons.length - 1];
    if (!season) seasons.push((season = { id: null, title: "", at: -1, end: nextMark(elements, -1, ["season"]), episodes: [] }));
    const start = synopsisEnd(elements, at);
    season.episodes.push({
      id: mark.id,
      title: plainSection(el.text),
      season: season.id,
      number: season.episodes.length + 1,
      at,
      start,
      end: nextMark(elements, at, ["season", "episode"]),
      synopsis: elements.slice(at + 1, start).map((s) => s.text).join(" ").trim(),
    });
  });
  cache.set(elements, seasons);
  return seasons;
}

export const allEpisodes = (elements: ScreenplayElement[]): Episode[] => seriesOf(elements).flatMap((s) => s.episodes);

/** Le scénario est une série : il a au moins un épisode. */
export const isSeries = (sp: Screenplay | null | undefined): boolean => !!sp && allEpisodes(sp.elements).length > 0;

const findEpisode = (sp: Screenplay, id: string | null | undefined) => (id ? allEpisodes(sp.elements).find((e) => e.id === id) : undefined);

/** L'épisode demandé s'il existe, sinon null (tout le scénario). */
export const resolveEpisode = (sp: Screenplay | null | undefined, id: string | null | undefined): string | null =>
  sp && findEpisode(sp, id) ? id! : null;

/** Rang, dans le scénario entier, du premier élément de l'épisode (0 pour tout le scénario). */
export const episodeOffset = (sp: Screenplay | null | undefined, id: string | null | undefined): number => (sp ? (findEpisode(sp, id)?.start ?? 0) : 0);

/** Épisode qui contient l'élément de ce rang (sa section comprise), ou null. */
export function episodeAt(sp: Screenplay | null | undefined, index: number): string | null {
  if (!sp) return null;
  return allEpisodes(sp.elements).find((e) => index >= e.at && index < e.end)?.id ?? null;
}

/** Épisode dont le texte contient la scène de cette carte, ou null. */
export function episodeOfCard(sp: Screenplay | null | undefined, cardId: string): string | null {
  if (!sp) return null;
  const at = sp.elements.findIndex((el) => el.type === "sceneHeading" && el.cardId === cardId);
  return at < 0 ? null : episodeAt(sp, at);
}

// Le texte d'un épisode est rendu toujours par le même objet tant que ses éléments et la page de titre restent les
// mêmes : la vue Scénario ne recharge son éditeur que si son scénario change sans elle.
const slices = new WeakMap<Screenplay, Map<string, Screenplay>>();
const lastSlice = new Map<string, Screenplay>();
const sameElements = (a: ScreenplayElement[], b: ScreenplayElement[]) => a.length === b.length && a.every((el, i) => el === b[i]);

function remember(sp: Screenplay, id: string, script: Screenplay) {
  let map = slices.get(sp);
  if (!map) slices.set(sp, (map = new Map()));
  map.set(id, script);
  lastSlice.set(id, script);
}

/** Texte d'un épisode, comme un scénario à lui seul (page de titre du projet). Sans épisode : le scénario entier. */
export function episodeScript(sp: Screenplay, id: string | null | undefined): Screenplay {
  const ep = findEpisode(sp, id);
  if (!ep) return sp;
  const cached = slices.get(sp)?.get(ep.id);
  if (cached) return cached;
  const elements = sp.elements.slice(ep.start, ep.end);
  const before = lastSlice.get(ep.id);
  const script = before && before.titlePage === sp.titlePage && sameElements(before.elements, elements) ? before : { titlePage: sp.titlePage, elements };
  remember(sp, ep.id, script);
  return script;
}

/** Le scénario avec le texte de cet épisode remplacé (et la page de titre, commune). Sans épisode : le texte donné. */
export function withEpisodeScript(sp: Screenplay, id: string | null | undefined, script: Screenplay): Screenplay {
  const ep = findEpisode(sp, id);
  if (!ep) return script;
  if (episodeScript(sp, ep.id) === script) return sp;
  const next = { titlePage: script.titlePage, elements: [...sp.elements.slice(0, ep.start), ...script.elements, ...sp.elements.slice(ep.end)] };
  remember(next, ep.id, script);
  return next;
}

/** Applique une transformation au texte d'un épisode seul (une scène ajoutée à la fin de l'épisode ouvert). */
export const inEpisode = (sp: Screenplay, id: string | null | undefined, fn: (script: Screenplay) => Screenplay): Screenplay =>
  withEpisodeScript(sp, id, fn(episodeScript(sp, id)));

const withElements = (sp: Screenplay, elements: ScreenplayElement[]): Screenplay => ({ ...sp, elements });

/** Nouvelle saison, à la fin. */
export function addSeason(sp: Screenplay, id: string, title: string): Screenplay {
  return withElements(sp, [...sp.elements, section("season", id, title)]);
}

/**
 * Nouvel épisode à la fin d'une saison (la dernière si aucune n'est donnée). Premier épisode d'un scénario : une
 * saison est créée (`seasonId`, `seasonTitle`), et le texte déjà écrit devient celui de ce premier épisode.
 */
export function addEpisode(sp: Screenplay, id: string, title: string, opts: { season?: string | null; seasonId: string; seasonTitle: string }): Screenplay {
  const seasons = seriesOf(sp.elements);
  if (seasons.length === 0) return withElements(sp, [section("season", opts.seasonId, opts.seasonTitle), section("episode", id, title), ...sp.elements]);
  const target = seasons.find((s) => s.id === opts.season) ?? seasons[seasons.length - 1];
  const elements = sp.elements.slice();
  elements.splice(target.end, 0, section("episode", id, title));
  return withElements(sp, elements);
}

/** Renomme une saison ou un épisode (sa note reste). */
export function renameSeriesPart(sp: Screenplay, id: string, title: string): Screenplay {
  const at = sp.elements.findIndex((el) => seriesMark(el)?.id === id);
  if (at < 0) return sp;
  const mark = seriesMark(sp.elements[at])!;
  const el = section(mark.kind, id, title);
  if (el.text === sp.elements[at].text) return sp;
  const elements = sp.elements.slice();
  elements[at] = { ...sp.elements[at], text: el.text };
  return withElements(sp, elements);
}

/** Synopsis d'un épisode : la ligne « = … » sous sa section (vide : retirée). */
export function setEpisodeSynopsis(sp: Screenplay, id: string, text: string): Screenplay {
  const ep = findEpisode(sp, id);
  if (!ep) return sp;
  const value = text.replace(/\s+/g, " ").trim();
  if (value === ep.synopsis) return sp;
  const line: ScreenplayElement[] = value ? [{ type: "synopsis", text: value }] : [];
  return withElements(sp, [...sp.elements.slice(0, ep.at + 1), ...line, ...sp.elements.slice(ep.start)]);
}

/**
 * Déplace un épisode d'un cran dans la série (`way` -1 : vers le haut). Au bord de sa saison, il passe dans la
 * saison voisine (dernier de la précédente, premier de la suivante). Une saison se déplace d'un cran parmi les
 * saisons, avec ses épisodes.
 */
export function moveSeriesPart(sp: Screenplay, id: string, way: -1 | 1): Screenplay {
  const seasons = seriesOf(sp.elements);
  const el = sp.elements;
  const season = seasons.find((s) => s.id === id);
  if (season) {
    const named = seasons.filter((s) => s.id !== null);
    const k = named.indexOf(season);
    const other = named[k + way];
    if (!other) return sp;
    const [first, second] = way < 0 ? [other, season] : [season, other];
    return withElements(sp, [...el.slice(0, first.at), ...el.slice(second.at, second.end), ...el.slice(first.at, first.end), ...el.slice(second.end)]);
  }
  const episodes = seasons.flatMap((s) => s.episodes);
  const ep = episodes.find((e) => e.id === id);
  if (!ep) return sp;
  const own = seasons.find((s) => s.episodes.includes(ep))!;
  const k = own.episodes.indexOf(ep);
  const chunk = el.slice(ep.at, ep.end);
  const without = [...el.slice(0, ep.at), ...el.slice(ep.end)];
  const shift = ep.end - ep.at;
  const after = (i: number) => (i > ep.at ? i - shift : i);
  let to: number;
  if (way < 0) {
    if (k > 0) to = own.episodes[k - 1].at;
    else {
      // Premier de sa saison : il devient le dernier de la saison précédente (juste avant la section de la sienne).
      const prev = seasons[seasons.indexOf(own) - 1];
      if (!prev || own.at < 0) return sp;
      to = own.at;
    }
  } else if (k < own.episodes.length - 1) {
    const next = own.episodes[k + 1];
    to = after(next.end);
  } else {
    // Dernier de sa saison : il devient le premier de la suivante (juste après sa section et ce qui précède ses épisodes).
    const next = seasons[seasons.indexOf(own) + 1];
    if (!next) return sp;
    to = after(next.episodes[0]?.at ?? next.end);
  }
  return withElements(sp, [...without.slice(0, to), ...chunk, ...without.slice(to)]);
}

/**
 * Retire une saison ou un épisode : seule sa section (et le synopsis d'un épisode) part, son texte rejoint
 * l'épisode (ou la saison) d'avant. Rien de ce qui est écrit n'est perdu.
 */
export function removeSeriesPart(sp: Screenplay, id: string): Screenplay {
  const at = sp.elements.findIndex((el) => seriesMark(el)?.id === id);
  if (at < 0) return sp;
  const end = seriesMark(sp.elements[at])!.kind === "episode" ? synopsisEnd(sp.elements, at) : at + 1;
  return withElements(sp, [...sp.elements.slice(0, at), ...sp.elements.slice(end)]);
}

/**
 * Épisodes des anciennes cartes Épisode (avant novembre 2026) : une saison par numéro de saison, un épisode par
 * carte (même identifiant), avec son synopsis. Le texte déjà écrit devient celui du premier épisode ; les autres
 * suivent. Les épisodes déjà présents ne sont pas ajoutés deux fois.
 */
export function adoptEpisodeCards(
  sp: Screenplay,
  cards: { id: string; title: string; season: number; synopsis: string }[],
  seasonTitle: (n: number) => string,
  newId: () => string,
): Screenplay {
  const known = new Set(allEpisodes(sp.elements).map((e) => e.id));
  const fresh = cards.filter((c) => !known.has(c.id));
  if (fresh.length === 0) return sp;
  const parts: ScreenplayElement[][] = [];
  let season = -1;
  for (const c of fresh) {
    const part: ScreenplayElement[] = [];
    if (c.season !== season) {
      season = c.season;
      part.push(section("season", newId(), seasonTitle(c.season)));
    }
    part.push(section("episode", c.id, c.title));
    if (c.synopsis.trim()) part.push({ type: "synopsis", text: c.synopsis.replace(/\s+/g, " ").trim() });
    parts.push(part);
  }
  // Pas encore de série : le premier épisode prend tout ce qui est déjà écrit.
  if (known.size === 0) return withElements(sp, [...parts[0], ...sp.elements, ...parts.slice(1).flat()]);
  return withElements(sp, [...sp.elements, ...parts.flat()]);
}

/**
 * Scènes de chaque épisode, dans l'ordre du fichier (identifiants des cartes), et celles écrites avant le
 * premier épisode (`outside`). Sert au rangement du canevas.
 */
export function episodeScenes(elements: ScreenplayElement[]): { byEpisode: Map<string, string[]>; outside: string[] } {
  const byEpisode = new Map<string, string[]>();
  const outside: string[] = [];
  let current: string[] = outside;
  for (const el of elements) {
    const mark = seriesMark(el);
    if (mark?.kind === "episode") byEpisode.set(mark.id, (current = []));
    else if (mark?.kind === "season") current = outside;
    else if (el.type === "sceneHeading" && el.cardId) current.push(el.cardId);
  }
  return { byEpisode, outside };
}

/**
 * Range la scène de la carte `cardId` dans l'épisode `episodeId`, avec tout son texte, à la place `index`
 * parmi les scènes de l'épisode (à la fin sans index). Même objet si rien ne bouge ou si la scène ou
 * l'épisode n'existent pas.
 */
export function placeSceneInEpisode(sp: Screenplay, cardId: string, episodeId: string, index?: number): Screenplay {
  const el = sp.elements;
  const from = el.findIndex((e) => e.type === "sceneHeading" && e.cardId === cardId);
  if (from < 0 || !findEpisode(sp, episodeId)) return sp;
  // Fin de la scène : la scène suivante ou n'importe quelle section (case, saison, épisode).
  let end = from + 1;
  while (end < el.length && el[end].type !== "sceneHeading" && el[end].type !== "section") end++;
  const chunk = el.slice(from, end);
  const without = [...el.slice(0, from), ...el.slice(end)];
  const ep = findEpisode({ ...sp, elements: without }, episodeId)!;
  const heads: number[] = [];
  for (let i = ep.start; i < ep.end; i++) if (without[i].type === "sceneHeading") heads.push(i);
  const to = index !== undefined && index < heads.length ? heads[Math.max(0, index)] : ep.end;
  const next = [...without.slice(0, to), ...chunk, ...without.slice(to)];
  return next.every((e, i) => e === el[i]) ? sp : withElements(sp, next);
}

/**
 * Gabarit d'un épisode (lot 3) : ses cases sont des sections de niveau 3 marquées [[cosmos:beat:<clé>]], posées
 * dans le texte de l'épisode seul (`apply` reçoit ce texte et rend le nouveau, par applyTemplate de
 * template.ts). Les cases d'un autre épisode ne bougent pas. Même objet si rien ne change.
 */
export function withEpisodeTemplate(sp: Screenplay, episodeId: string, apply: (script: Screenplay) => Screenplay): Screenplay {
  if (!findEpisode(sp, episodeId)) return sp;
  return inEpisode(sp, episodeId, (script) => {
    const next = apply(script);
    if (next === script) return script;
    // Une case posée par le gabarit est d'un niveau sous l'épisode (## épisode, ### case).
    return { ...next, elements: next.elements.map((el) => (el.type === "section" && el.depth !== 3 && / \[\[cosmos:beat:/.test(el.text) ? { ...el, depth: 3 } : el)) };
  });
}

/**
 * Texte à exporter d'une partie de la série (lot 3) : une saison (de sa section à la saison suivante) ou un
 * épisode, avec la page de titre du projet dont le titre reçoit, sur une seconde ligne, le nom de la partie
 * (`label`) : chaque épisode exporté a ainsi sa page de titre. Sans partie connue : le scénario entier.
 */
export function seriesPart(sp: Screenplay, id: string | null | undefined, label: string): Screenplay {
  if (!id) return sp;
  const seasons = seriesOf(sp.elements);
  const season = seasons.find((s) => s.id === id);
  const ep = season ? undefined : findEpisode(sp, id);
  if (!season && !ep) return sp;
  const elements = season ? sp.elements.slice(season.at + 1, season.end) : sp.elements.slice(ep!.start, ep!.end);
  const key = Object.keys(sp.titlePage).find((k) => k.trim().toLowerCase() === "title") ?? "Title";
  const title = (sp.titlePage[key] ?? "").trim();
  const titlePage = label.trim() ? { ...sp.titlePage, [key]: title ? `${title}\n${label.trim()}` : label.trim() } : sp.titlePage;
  return { titlePage, elements };
}

/**
 * Toute la série, ou une saison, en épisodes à imprimer l'un après l'autre : chacun a sa page de titre (titre du
 * projet, nom de la saison s'il y en a plusieurs, puis l'épisode), ses pages et ses numéros de scène à lui. Ce qui
 * précède le premier épisode (texte hors épisode) vient d'abord, avec la page de titre de la partie. null : un seul
 * épisode demandé, ou rien à découper (hors d'une série).
 */
export function seriesBooks(sp: Screenplay, id: string | null | undefined, labels: Map<string, string>): Screenplay[] | null {
  const seasons = seriesOf(sp.elements);
  if (seasons.length === 0) return null;
  if (id && !seasons.some((s) => s.id === id)) return null; // un épisode, ou une partie inconnue
  const chosen = id ? seasons.filter((s) => s.id === id) : seasons;
  const episodes = chosen.flatMap((s) => s.episodes);
  if (episodes.length === 0) return null;
  const key = Object.keys(sp.titlePage).find((k) => k.trim().toLowerCase() === "title") ?? "Title";
  const title = (sp.titlePage[key] ?? "").trim();
  const named = seasons.filter((s) => s.id).length > 1;
  const page = (...lines: (string | undefined)[]) => {
    const text = [title, ...lines].map((l) => l?.trim() ?? "").filter(Boolean).join("\n");
    return text ? { ...sp.titlePage, [key]: text } : sp.titlePage;
  };
  const books: Screenplay[] = [];
  const from = id ? chosen[0].at + 1 : 0;
  const front = sp.elements.slice(from, episodes[0].at).filter((el) => !seriesMark(el));
  if (front.length > 0) books.push({ titlePage: id ? page(labels.get(id)) : sp.titlePage, elements: front });
  for (const season of chosen) {
    const seasonLabel = season.id && (named || id) ? labels.get(season.id) : undefined;
    for (const ep of season.episodes) books.push({ titlePage: page(seasonLabel, labels.get(ep.id)), elements: sp.elements.slice(ep.start, ep.end) });
  }
  return books;
}
