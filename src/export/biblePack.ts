// Contenu du PDF de la Bible (Bible v2) : la Bible du projet lue comme un dossier, pour un lecteur donné.
// « moi » : bible de travail, tout ce qui est rempli ; « tiers » : dossier de présentation (roman) ou bible de
// série (scénario), sans ce qui ne sert qu'à l'auteur. Ce module ne fait que choisir et ordonner le contenu
// (fonctions pures) ; bibleLayout.ts le met en pages, biblePdf.ts le dessine. Rien n'est inventé : une case
// vide n'apparaît pas, une partie vide non plus.

import { fmt, type Messages } from "../i18n";
import { vocab } from "../vocab";
import type { CardData, ProjectKind } from "../types";
import type { Plan } from "../plan";
import { PLAN_TEMPLATES, chapterNumbers } from "../plan";
import { bookOrder } from "../book";
import type { Pitch } from "../pitch";
import { NOVEL_CHIPS, readEpisodes } from "../pitch";
import { appearances, episodeCast, episodeGrid, episodeNumbers, episodeOrder, episodeThreads, pivotOf } from "../episodes";
import { countWords, type Manuscript } from "../manuscript";
import type { Screenplay } from "../screenplay/model";
import { listScenes, sceneSynopsis } from "../screenplay/scenes";
import { beatOf, sectionLabel } from "../screenplay/template";
import { screenplaySceneTexts, timeline } from "../timeline";
import type { CardNode } from "../projectState";
import { CHARACTER_FIELDS, CHARACTER_HEAD_FIELDS, isPrincipal, motorFields, nicknames } from "../character";
import { PART_OF, partNumber, type PartKey } from "../bibleParts";
import type { BibleExportOptions } from "../bibleExport";
import { isMediaName } from "../media";
import { htmlToBlocks, runsText, type Block } from "./doc";

export interface PackRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface Cell {
  label: string;
  value: string;
}

export type PackBlock =
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string; sub?: string }
  | { kind: "lead"; text: string }
  | { kind: "para"; runs: PackRun[]; small?: boolean; muted?: boolean }
  | { kind: "label"; text: string }
  | { kind: "chips"; items: string[] }
  | { kind: "cells"; items: Cell[] }
  | { kind: "arc"; from: Cell; to: Cell }
  | { kind: "person"; name: string; meta: string; hook: string; image: string | null; initials: string }
  | { kind: "thumbs"; items: { image: string; caption: string }[] }
  | { kind: "list"; items: { mark: string; text: string; note?: string }[]; columns: 1 | 2 }
  /**
   * Grille des fils : une ligne par intrigue, une colonne par partie du pilote ou par épisode (numérotée,
   * légende dessous). `marks` : numéros des colonnes quand ce ne sont pas 1, 2, 3… (numéros des épisodes).
   */
  | { kind: "grid"; cols: string[]; marks?: string[]; rows: { label: string; cells: boolean[] }[] }
  | { kind: "rule" }
  | { kind: "pageBreak" };

export interface PackSection {
  part: PartKey;
  /** « 2 · Personnages » */
  kicker: string;
  title: string;
  blocks: PackBlock[];
}

export interface BiblePack {
  /**
   * Pages à ajouter à la fin du PDF (0 : aucune) : le début du pilote (scénario) ou du manuscrit (roman, lot 6).
   * La dernière section les annonce.
   */
  annexPages: number;
  title: string;
  author: string;
  /** « Dossier de présentation », « Bible de série », « Bible de travail » */
  kind: string;
  tagline: string;
  /** « Roman · Thriller · 85 000 mots » */
  meta: string;
  /** « Octobre 2026 » */
  date: string;
  cover: string | null;
  sections: PackSection[];
}

export interface PackSource {
  title: string;
  kind: ProjectKind;
  nodes: CardNode[];
  edges: { source: string; target: string; label?: unknown }[];
  plan: Plan;
  manuscript: Manuscript;
  pitch: Pitch;
  screenplay: Screenplay | null;
  goals?: { total?: number };
}

export interface PackContext {
  t: Messages;
  lang: string;
  author: string;
  date: Date;
  /** Profil de l'appareil : parcours et œuvres pour la page « L'auteur » d'un dossier envoyé (jamais dans le projet). */
  profile?: { bio?: string; works?: string };
}

/** Pages du pilote jointes en annexe, au plus. */
export const PILOT_PAGES = 10;
/** Pages du manuscrit jointes en extrait (roman), au plus. */
export const EXTRACT_PAGES = 10;
/** Colonnes de la grille des fils, au plus (au-delà, elle serait illisible). */
const MAX_GRID_COLS = 16;

/** Images des lieux en vignettes, au plus. */
export const MAX_THUMBS = 4;

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** HTML d'une carte → paragraphes (listes en tirets), titres internes en gras. */
function paras(html: string): PackBlock[] {
  return htmlToBlocks(html).flatMap((b: Block): PackBlock[] => {
    if (b.kind === "image") return [];
    const runs = b.runs.map((r) => ({ text: r.text, ...(r.bold || b.kind === "heading" ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}) }));
    if (b.kind === "paragraph" && b.list) runs.unshift({ text: b.list === "number" ? `${b.index ?? 1}. ` : "– " });
    return runsText(runs).trim() ? [{ kind: "para", runs }] : [];
  });
}

const firstSentence = (html: string) => {
  const text = clean(htmlToBlocks(html).map((b) => ("runs" in b ? runsText(b.runs) : "")).join(" "));
  const m = text.match(/^.{1,180}?[.!?…](\s|$)/);
  return m ? m[0].trim() : text.length > 180 ? `${text.slice(0, 179)}…` : text;
};

const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("") || (name.trim()[0] ?? "?").toUpperCase();

export function buildBiblePack(s: PackSource, options: BibleExportOptions, ctx: PackContext): BiblePack {
  const { t, lang } = ctx;
  const e = t.bibleExport;
  const v = vocab(t, s.kind);
  const forMe = options.audience === "moi";
  const cards = s.nodes.map((n) => n.data);
  const byType = (type: CardData["type"]) => cards.filter((c) => c.type === type).sort((a, b) => a.title.localeCompare(b.title, lang));
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title.trim() ?? "";
  const kindLabel = forMe ? e.kinds.work : s.kind === "scenario" ? e.kinds.series : e.kinds.pitch;
  const num = (n: number) => new Intl.NumberFormat(lang).format(n);
  // Épisodes de la série (cartes Épisode, lot 6), dans l'ordre de la saison.
  const episodes = s.kind === "scenario" ? episodeOrder(cards) : [];
  const words = Object.values(s.manuscript).reduce((sum, html) => sum + countWords(html), 0);

  // Ligne de couverture : roman ou série, genre, volume (mots écrits, ou objectif).
  const volume = s.kind === "scenario" ? "" : s.goals?.total ? fmt(e.wordsTarget, { n: num(s.goals.total) }) : words > 0 ? fmt(e.words, { n: num(words) }) : "";
  const meta = [s.kind === "scenario" ? clean(s.pitch.format) || e.series : e.novel, clean(s.pitch.genre), volume].filter(Boolean).join(" · ");

  const sections: PackSection[] = [];
  const section = (part: PartKey, title: string, blocks: PackBlock[]) => {
    if (blocks.length > 0) sections.push({ part, kicker: fmt(t.bible.partTitle, { n: partNumber(part), part: t.bible.parts[part] }), title, blocks });
  };

  for (const part of options.parts) {
    const blocks: PackBlock[] = [];

    if (part === "presentation") {
      const p = s.pitch;
      if (clean(p.logline)) blocks.push({ kind: "label", text: t.pitch.fields.logline }, { kind: "lead", text: clean(p.logline) });
      // Pastilles : les valeurs seules ; statut, « d'après » et crédits avec leur libellé (une valeur seule serait obscure).
      const chips = (["genre", "cible", "format", "pov", "temps", "ton"] as const)
        .filter((k) => (k !== "format" || s.kind !== "scenario") && (s.kind !== "scenario" || !(NOVEL_CHIPS as readonly string[]).includes(k)))
        .map((k) => clean(p[k]))
        .filter(Boolean);
      if (chips.length > 0) blocks.push({ kind: "chips", items: chips });
      const facts = (["dapres", "credits", "statut"] as const).map((k) => ({ label: t.pitch.fields[k], value: clean(p[k]) })).filter((f) => f.value);
      if (facts.length > 0) blocks.push({ kind: "para", small: true, muted: true, runs: facts.flatMap((f, i) => [...(i > 0 ? [{ text: " · " }] : []), { text: `${f.label} : `, bold: true }, { text: f.value }]) });
      const presentationTexts = s.kind === "scenario" ? (["resume", "pourquoi", "promesse", "nestPas", "comps", "intention"] as const) : (["resume", "comps", "intention"] as const);
      // Pour un tiers, une phrase sur le destinataire termine la note d'intention (réglage de l'export).
      const recipient = forMe ? "" : clean(options.recipient);
      for (const key of presentationTexts) {
        const text = (p[key] ?? "").trim();
        if (!text && !(key === "intention" && recipient)) continue;
        blocks.push({ kind: "label", text: t.pitch.fields[key] });
        for (const line of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) blocks.push({ kind: "para", runs: [{ text: line }] });
        if (key === "intention" && recipient) blocks.push({ kind: "para", runs: [{ text: recipient }] });
      }
      const themes = byType("theme");
      if (themes.length > 0) {
        blocks.push({ kind: "label", text: v.types.theme.section });
        if (forMe) for (const th of themes) blocks.push({ kind: "h3", text: th.title.trim() || t.bible.untitled }, ...paras(th.html));
        else blocks.push({ kind: "para", runs: [{ text: themes.map((th) => th.title.trim()).filter(Boolean).join(" · ") }] });
      }
      section(part, e.titles.presentation, blocks);
    }

    if (part === "personnages") {
      const all = byType("personnage").filter((c) => c.title.trim() || !forMe);
      const principals = all.filter(isPrincipal);
      // Personne n'est coché « principal » : tout le monde a sa fiche.
      const full = forMe || principals.length === 0 ? [...principals, ...all.filter((c) => !isPrincipal(c))] : principals;
      const others = full === principals ? all.filter((c) => !isPrincipal(c)) : [];
      // Bible de série : tout le monde en une page, d'un coup d'œil, avant les fiches.
      // Avec des épisodes, le mémo dit aussi où chacun paraît (pivot ou relié par un fil).
      const seen = s.kind === "scenario" ? appearances(cards, s.edges) : new Map<string, string[]>();
      const memoNote = (c: CardData) => {
        const where = seen.get(c.id) ?? [];
        const inEps = where.length === 0 ? "" : where.length === 1 ? fmt(e.inEpisode, { n: where[0] }) : fmt(e.inEpisodes, { list: where.join(", ") });
        return [clean(c.fiche?.accroche), inEps].filter(Boolean).join(" · ");
      };
      const memo = all.filter((c) => c.title.trim() && memoNote(c));
      if (s.kind === "scenario" && options.memo && memo.length >= 2) {
        blocks.push({ kind: "label", text: e.memo }, { kind: "list", columns: 2, items: memo.map((c) => ({ mark: "", text: c.title.trim(), note: memoNote(c) })) }, { kind: "pageBreak" });
      }
      full.forEach((c, i) => {
        if (i > 0) blocks.push(isPrincipal(c) || !forMe ? { kind: "pageBreak" } : { kind: "rule" });
        blocks.push(...characterBlocks(c));
      });
      if (others.length > 0) {
        blocks.push({ kind: "rule" }, { kind: "label", text: e.alsoTitle });
        blocks.push({ kind: "list", columns: 1, items: others.map((c) => ({ mark: "", text: c.title.trim() || t.bible.untitled, note: clean(c.fiche?.accroche) || firstSentence(c.html) })) });
      }
      section(part, v.types.personnage.section, blocks);
    }

    if (part === "univers") {
      const places = byType("lieu");
      if (s.kind === "scenario") blocks.push(...pitchText("arene", false));
      if (options.places) {
        const thumbs = places.flatMap((c) => [c.image, ...(c.images ?? [])].filter((n): n is string => !!n && isMediaName(n)).map((image) => ({ image, caption: c.title.trim() })));
        // Une image par lieu d'abord, puis les autres.
        const firstOf = thumbs.filter((th, i) => thumbs.findIndex((x) => x.caption === th.caption) === i);
        const picked = [...firstOf, ...thumbs.filter((th) => !firstOf.includes(th))].slice(0, MAX_THUMBS);
        if (picked.length > 0) blocks.push({ kind: "thumbs", items: picked });
      }
      for (const c of places) {
        const facts = (["epoque", "ambiance", "importance", "evenements"] as const).map((k) => ({ label: t.fiche.fields[k], value: clean(c.fiche?.[k]) })).filter((x) => x.value);
        blocks.push({ kind: "h3", text: c.title.trim() || t.bible.untitled, sub: clean(c.fiche?.epoque) });
        blocks.push(...paras(c.html));
        const rest = facts.filter((f) => f.label !== t.fiche.fields.epoque);
        if (rest.length > 0) blocks.push({ kind: "para", small: true, runs: rest.flatMap((f, i) => [...(i > 0 ? [{ text: " · " }] : []), { text: `${f.label} : `, bold: true }, { text: f.value }]) });
      }
      section(part, s.kind === "scenario" ? e.titles.universeScript : e.titles.universe, blocks);
    }

    if (part === "structure") {
      if (s.kind === "scenario") {
        blocks.push(...pitchText("mecanique"), ...pitchText("episodeType"), ...pitchText("saison"), ...pitchText("finSaison"), ...episodeBlocks());
      }
      for (const c of byType("intrigue")) {
        blocks.push({ kind: "h3", text: c.title.trim() || t.bible.untitled, sub: clean(c.fiche?.nature) });
        const cells = (["question", "enjeu", "declencheur", "tournant", "resolution"] as const).map((k) => ({ label: t.fiche.fields[k], value: clean(c.fiche?.[k]) })).filter((x) => x.value);
        if (cells.length > 0) blocks.push({ kind: "cells", items: cells });
        if (forMe) blocks.push(...paras(c.html));
      }
      if (s.kind === "scenario" && options.grid) {
        // Les fils de la saison (intrigues × épisodes) ; sans épisodes reliés, ceux du pilote.
        const season = seasonGrid();
        blocks.push(...(season.length > 0 ? season : threadGrid()));
      }
      blocks.push(...planBlocks());
      if (s.kind === "scenario") {
        // Écrire la série : ce qu'un scénariste qui rejoint l'écriture doit savoir.
        const rules = (["aFaire", "aEviter"] as const).map((k) => ({ label: t.pitch.fields[k], value: clean(s.pitch[k]) })).filter((x) => x.value);
        const pistes = pitchText("pistes");
        if (rules.length > 0 || pistes.length > 0) {
          blocks.push({ kind: "h2", text: t.pitch.seriesTitle });
          if (rules.length > 0) blocks.push({ kind: "cells", items: rules });
          blocks.push(...pistes);
        }
      }
      section(part, e.titles.structure, blocks);
    }

    if (part === "pourVous") {
      const questions = [
        ...byType("question").map((c) => ({ mark: "?", text: c.title.trim() || firstSentence(c.html) })),
        ...byType("personnage").flatMap((c) => (c.questions ?? []).map((q) => ({ mark: "?", text: `${c.title.trim()} : ${q}` }))),
      ].filter((q) => q.text);
      if (questions.length > 0) blocks.push({ kind: "label", text: v.types.question.section }, { kind: "list", columns: 1, items: questions });
      const ideas = byType("idee").filter((c) => c.title.trim() || c.html.replace(/<[^>]+>/g, "").trim());
      if (ideas.length > 0) {
        blocks.push({ kind: "label", text: v.types.idee.section });
        for (const c of ideas) blocks.push(...(c.title.trim() ? [{ kind: "h3" as const, text: c.title.trim() }] : []), ...paras(c.html));
      }
      const sources = [...byType("lien"), ...byType("document"), ...byType("image")].filter((c) => c.title.trim() || c.fiche?.url);
      if (sources.length > 0) {
        blocks.push({ kind: "label", text: e.sources });
        blocks.push({ kind: "list", columns: 1, items: sources.map((c) => ({ mark: "–", text: c.title.trim() || clean(c.fiche?.url), note: [clean(c.fiche?.auteur), clean(c.fiche?.publication), clean(c.fiche?.url)].filter(Boolean).join(" · ") })) });
      }
      section(part, t.bible.parts.pourVous, blocks);
    }
  }

  // Page « L'auteur » d'un dossier envoyé : pourquoi il porte la série, parcours, œuvres (profil de l'appareil).
  if (!forMe) {
    const why = s.kind === "scenario" ? pitchText("pourquoiMoi") : [];
    const bio = (ctx.profile?.bio ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const works = (ctx.profile?.works ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const blocks: PackBlock[] = [
      ...why,
      ...bio.map((l): PackBlock => ({ kind: "para", runs: [{ text: l }] })),
      ...(works.length > 0 ? [{ kind: "label", text: e.works } as PackBlock, { kind: "list", columns: 1, items: works.map((w) => ({ mark: "–", text: w })) } as PackBlock] : []),
    ];
    if (blocks.length > 0) sections.push({ part: "presentation", kicker: e.authorKicker, title: ctx.author.trim() || e.authorKicker, blocks });
  }

  // Annexe : les premières pages du pilote (scénario), annoncées par une page ; biblePdf.ts les ajoute après.
  const pilotPages = options.pilot && s.kind === "scenario" && listScenes(s.screenplay?.elements ?? []).length > 0 ? PILOT_PAGES : 0;
  if (pilotPages > 0) sections.push({ part: "structure", kicker: e.annex, title: e.pilotTitle, blocks: [{ kind: "para", runs: [{ text: e.pilotNote }] }] });
  // Roman : le début du manuscrit au format Shunn, pour un éditeur (dialogue : PDF du menu Exporter).
  const extractPages = options.extract && s.kind === "roman" && words > 0 ? EXTRACT_PAGES : 0;
  if (extractPages > 0) sections.push({ part: "structure", kicker: e.annex, title: e.extractTitle, blocks: [{ kind: "para", runs: [{ text: e.extractNote }] }] });

  return {
    annexPages: pilotPages || extractPages,
    title: s.title.trim() || t.home.untitled,
    author: ctx.author.trim(),
    kind: kindLabel,
    tagline: clean(s.pitch.tagline),
    meta,
    date: new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(ctx.date),
    cover: options.cover && isMediaName(options.cover) ? options.cover : null,
    sections,
  };

  /** Un texte de la couverture sous son libellé (un paragraphe par ligne). */
  function pitchText(key: "arene" | "mecanique" | "episodeType" | "saison" | "finSaison" | "pistes" | "pourquoiMoi", withLabel = true): PackBlock[] {
    const text = (s.pitch[key] ?? "").trim();
    if (!text) return [];
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l): PackBlock => ({ kind: "para", runs: [{ text: l }] }));
    return withLabel ? [{ kind: "label", text: t.pitch.fields[key] }, ...lines] : lines;
  }

  /**
   * Épisodes : pour un tiers, une liste courte (titre, synopsis, pivot), sans séquencier ni traitement ;
   * pour soi, chaque épisode avec ses intrigues, ses personnages et ses notes. Projet pas encore repris
   * (anciennes lignes de la couverture) : ces lignes.
   */
  function episodeBlocks(): PackBlock[] {
    if (episodes.length === 0) {
      const lines = readEpisodes(s.pitch.episodes);
      return lines.length === 0 ? [] : [{ kind: "label", text: t.pitch.fields.episodes }, { kind: "list", columns: 1, items: lines.map((ep, i) => ({ mark: String(i + 1), text: ep.title, note: ep.synopsis })) }];
    }
    const numbers = episodeNumbers(episodes);
    const named = (c: CardData) => c.title.trim() || t.bible.untitled;
    const pivotNote = (c: CardData) => {
      const pivot = pivotOf(c, cards);
      return pivot?.title.trim() ? `${t.fiche.fields.pivot} : ${pivot.title.trim()}` : "";
    };
    if (!forMe)
      return [
        { kind: "label", text: v.types.episode.section },
        { kind: "list", columns: 1, items: episodes.map((c) => ({ mark: numbers.get(c.id)!, text: named(c), note: [clean(c.fiche?.synopsis), pivotNote(c)].filter(Boolean).join(" · ") })) },
      ];
    const out: PackBlock[] = [{ kind: "h2", text: v.types.episode.section }];
    for (const c of episodes) {
      out.push({ kind: "h3", text: `${numbers.get(c.id)}. ${named(c)}`, sub: pivotOf(c, cards)?.title.trim() });
      if (clean(c.fiche?.synopsis)) out.push({ kind: "para", runs: [{ text: clean(c.fiche?.synopsis) }] });
      const facts = [
        { label: v.types.intrigue.section, value: episodeThreads(c, cards, s.edges).map(named).join(", ") },
        { label: v.types.personnage.section, value: episodeCast(c, cards, s.edges).map(named).join(", ") },
      ].filter((f) => f.value);
      if (facts.length > 0) out.push({ kind: "para", small: true, runs: facts.flatMap((f, i) => [...(i > 0 ? [{ text: " · " }] : []), { text: `${f.label} : `, bold: true }, { text: f.value }]) });
      out.push(...paras(c.html));
    }
    return out;
  }

  /** Grille des fils de la saison : intrigues × épisodes, s'il y a au moins deux épisodes et un fil. */
  function seasonGrid(): PackBlock[] {
    if (episodes.length < 2 || episodes.length > MAX_GRID_COLS) return [];
    const grid = episodeGrid(cards, s.edges);
    if (grid.rows.length === 0) return [];
    return [{ kind: "label", text: e.gridSeason }, { kind: "grid", cols: episodes.map((c) => c.title.trim() || t.bible.untitled), marks: grid.cols, rows: grid.rows }];
  }

  /** Grille des fils du pilote : intrigues × parties du scénario (sections, ou scènes s'il n'y en a pas). */
  function threadGrid(): PackBlock[] {
    const elements = s.screenplay?.elements ?? [];
    const threads = byType("intrigue").filter((c) => c.title.trim());
    if (threads.length === 0) return [];
    const beatLabels = t.plan.beats as Record<string, { label: string }>;
    const cols: { label: string; ids: string[] }[] = [];
    let current: { label: string; ids: string[] } | null = null;
    for (const el of elements) {
      if (el.type === "section") {
        const key = beatOf(el.text);
        current = { label: (key && beatLabels[key]?.label) || sectionLabel(el.text), ids: [] };
        cols.push(current);
      } else if (el.type === "sceneHeading" && el.cardId) {
        if (!current) {
          current = { label: "", ids: [] };
          cols.push(current);
        }
        current.ids.push(el.cardId);
      }
    }
    let parts = cols.filter((c) => c.ids.length > 0);
    // Sans sections : une colonne par scène, si elles ne sont pas trop nombreuses.
    if (parts.length <= 1) parts = parts.flatMap((c) => c.ids).map((id) => ({ label: titleOf(id), ids: [id] }));
    if (parts.length < 2 || parts.length > MAX_GRID_COLS) return [];
    const order = parts.flatMap((c) => c.ids);
    const rows = timeline(cards, s.edges, screenplaySceneTexts(elements), order, lang).find((g) => g.type === "intrigue")?.rows ?? [];
    const grid = rows
      .filter((r) => r.count > 0)
      .map((r) => {
        let at = 0;
        const cells = parts.map((c) => {
          const here = r.cells.slice(at, at + c.ids.length).some((x) => x !== "none");
          at += c.ids.length;
          return here;
        });
        return { label: r.card.title.trim(), cells };
      });
    if (grid.length === 0) return [];
    return [
      { kind: "label", text: e.grid },
      { kind: "grid", cols: parts.map((c, i) => c.label || String(i + 1)), rows: grid },
    ];
  }

  function characterBlocks(c: CardData): PackBlock[] {
    const f = c.fiche ?? {};
    const name = c.title.trim() || t.bible.untitled;
    const metaLine = [clean(f.role), clean(f.age), clean(f.metier)].filter(Boolean).join(" · ");
    const out: PackBlock[] = [{ kind: "person", name, meta: metaLine, hook: clean(f.accroche), image: c.image && isMediaName(c.image) ? c.image : null, initials: initials(name) }];
    out.push(...paras(c.html));
    const labels = t.character.motor.labels as Record<string, string>;
    const motor = motorFields(c).map((k) => ({ label: labels[k] ?? k, value: clean(f[k]) })).filter((x) => x.value);
    if (motor.length > 0) out.push({ kind: "cells", items: motor });
    const stakes = (["enjeuExt", "enjeuRel", "enjeuInt"] as const).map((k) => ({ label: t.character.fields[k], value: clean(f[k]) })).filter((x) => x.value);
    if (stakes.length > 0) out.push({ kind: "cells", items: stakes });
    if (clean(f.debut) || clean(f.fin)) out.push({ kind: "arc", from: { label: t.character.fields.debut, value: clean(f.debut) }, to: { label: t.character.fields.fin, value: clean(f.fin) } });
    else if (clean(f.arc)) out.push({ kind: "para", runs: [{ text: `${t.character.fields.arc} : `, bold: true }, { text: clean(f.arc) }] });
    // Le reste de la fiche : tout pour soi ; pour un tiers, seulement la voix.
    const shown = new Set<string>([...motorFields(c), ...CHARACTER_HEAD_FIELDS, "role", "age", "metier", "relations", "surnoms", "enjeuExt", "enjeuRel", "enjeuInt"]);
    const extra = CHARACTER_FIELDS.filter((k) => !shown.has(k) && forMe).map((k) => ({ label: t.character.fields[k], value: clean(f[k]) })).filter((x) => x.value);
    for (const x of extra) out.push({ kind: "para", small: true, runs: [{ text: `${x.label} : `, bold: true }, { text: x.value }] });
    // Relations : les fils vers les autres personnages, puis le champ de la fiche.
    const rel = s.edges
      .filter((ed) => (ed.source === c.id || ed.target === c.id) && cards.find((x) => x.id === (ed.source === c.id ? ed.target : ed.source))?.type === "personnage")
      .map((ed) => {
        const other = titleOf(ed.source === c.id ? ed.target : ed.source);
        const label = clean(String(ed.label ?? ""));
        return label ? `${label} ${other}` : other;
      })
      .filter(Boolean);
    const relText = [...rel, clean(f.relations)].filter(Boolean).join(" · ");
    if (relText) out.push({ kind: "para", small: true, muted: true, runs: [{ text: `${t.character.fields.relations} : `, bold: true }, { text: relText }] });
    if (forMe && nicknames(c).length > 0 && !metaLine.includes(nicknames(c)[0])) out.push({ kind: "para", small: true, muted: true, runs: [{ text: `${t.character.fields.surnoms} : `, bold: true }, { text: nicknames(c).join(", ") }] });
    return out;
  }

  function planBlocks(): PackBlock[] {
    const out: PackBlock[] = [];
    if (s.kind === "scenario") {
      const elements = s.screenplay?.elements ?? [];
      const scenes = listScenes(elements);
      if (scenes.length === 0) return out;
      out.push({ kind: "label", text: e.scenes }, { kind: "list", columns: 1, items: scenes.map((sc) => ({ mark: String(sc.number), text: clean(sc.text) || t.bible.untitled, note: clean(sceneSynopsis(elements, sc.index)) })) });
      return out;
    }
    const order = bookOrder(s.nodes, s.plan).filter((id) => {
      const c = cards.find((x) => x.id === id);
      return c?.type === "scene" && !c.page;
    });
    if (order.length === 0) return out;
    const sceneTitle = (id: string) => titleOf(id) || t.bible.untitled;
    const synopsis = (id: string) => clean(cards.find((c) => c.id === id)?.fiche?.synopsis);
    const chapters = s.plan.chapters ?? [];
    if (chapters.length > 0) {
      const numbers = chapterNumbers(s.plan, order);
      const items = chapters
        .filter((ch) => ch.scenes.some((id) => order.includes(id)))
        .sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0))
        .map((ch) => ({
          mark: String(numbers.get(ch.id) ?? ""),
          text: ch.title.trim() || fmt(t.chapters.numbered, { n: numbers.get(ch.id) ?? 0 }),
          note: ch.scenes.filter((id) => order.includes(id)).map(sceneTitle).join(" · "),
        }));
      out.push({ kind: "label", text: e.plan }, { kind: "list", columns: 2, items });
      return out;
    }
    const beats = PLAN_TEMPLATES[s.plan.template] as readonly string[];
    if (s.plan.template !== "libre" && beats.some((b) => (s.plan.beats[b] ?? []).length > 0)) {
      const beatLabels = t.plan.beats as Record<string, { label: string }>;
      for (const b of beats) {
        const ids = (s.plan.beats[b] ?? []).filter((id) => order.includes(id));
        if (ids.length === 0) continue;
        out.push({ kind: "label", text: beatLabels[b]?.label ?? b });
        out.push({ kind: "list", columns: 1, items: ids.map((id) => ({ mark: String(order.indexOf(id) + 1), text: sceneTitle(id), note: synopsis(id) })) });
      }
      return out;
    }
    out.push({ kind: "label", text: e.plan }, { kind: "list", columns: 1, items: order.map((id, i) => ({ mark: String(i + 1), text: sceneTitle(id), note: synopsis(id) })) });
    return out;
  }
}

/** Parties visibles par type de carte, pour les exports Word et Markdown (même choix que le PDF). */
export const typesForParts = <T extends CardData["type"]>(types: readonly T[], parts: readonly PartKey[]): T[] =>
  parts.flatMap((part) => types.filter((type) => PART_OF[type] === part));
