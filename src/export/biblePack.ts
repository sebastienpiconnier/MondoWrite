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
import { PITCH_CHIPS } from "../pitch";
import { countWords, type Manuscript } from "../manuscript";
import type { Screenplay } from "../screenplay/model";
import { listScenes, sceneSynopsis } from "../screenplay/scenes";
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
}

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
      const chips = PITCH_CHIPS.filter((k) => k !== "format" || s.kind !== "scenario").map((k) => clean(p[k])).filter(Boolean);
      if (chips.length > 0) blocks.push({ kind: "chips", items: chips });
      for (const key of ["resume", "comps", "intention"] as const) {
        const text = (p[key] ?? "").trim();
        if (!text) continue;
        blocks.push({ kind: "label", text: t.pitch.fields[key] });
        for (const line of text.split(/\n+/).map((l) => l.trim()).filter(Boolean)) blocks.push({ kind: "para", runs: [{ text: line }] });
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
      for (const c of byType("intrigue")) {
        blocks.push({ kind: "h3", text: c.title.trim() || t.bible.untitled, sub: clean(c.fiche?.nature) });
        const cells = (["question", "enjeu", "declencheur", "tournant", "resolution"] as const).map((k) => ({ label: t.fiche.fields[k], value: clean(c.fiche?.[k]) })).filter((x) => x.value);
        if (cells.length > 0) blocks.push({ kind: "cells", items: cells });
        if (forMe) blocks.push(...paras(c.html));
      }
      blocks.push(...planBlocks());
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

  return {
    title: s.title.trim() || t.home.untitled,
    author: ctx.author.trim(),
    kind: kindLabel,
    tagline: clean(s.pitch.tagline),
    meta,
    date: new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(ctx.date),
    cover: options.cover && isMediaName(options.cover) ? options.cover : null,
    sections,
  };

  function characterBlocks(c: CardData): PackBlock[] {
    const f = c.fiche ?? {};
    const name = c.title.trim() || t.bible.untitled;
    const metaLine = [clean(f.role), clean(f.age), clean(f.metier)].filter(Boolean).join(" · ");
    const out: PackBlock[] = [{ kind: "person", name, meta: metaLine, hook: clean(f.accroche), image: c.image && isMediaName(c.image) ? c.image : null, initials: initials(name) }];
    out.push(...paras(c.html));
    const labels = t.character.motor.labels as Record<string, string>;
    const motor = motorFields(c).map((k) => ({ label: labels[k] ?? k, value: clean(f[k]) })).filter((x) => x.value);
    if (motor.length > 0) out.push({ kind: "cells", items: motor });
    if (clean(f.debut) || clean(f.fin)) out.push({ kind: "arc", from: { label: t.character.fields.debut, value: clean(f.debut) }, to: { label: t.character.fields.fin, value: clean(f.fin) } });
    else if (clean(f.arc)) out.push({ kind: "para", runs: [{ text: `${t.character.fields.arc} : `, bold: true }, { text: clean(f.arc) }] });
    // Le reste de la fiche : tout pour soi ; pour un tiers, seulement la voix.
    const shown = new Set<string>([...motorFields(c), ...CHARACTER_HEAD_FIELDS, "role", "age", "metier", "relations", "surnoms"]);
    const extra = CHARACTER_FIELDS.filter((k) => !shown.has(k) && (forMe || k === "voix")).map((k) => ({ label: t.character.fields[k], value: clean(f[k]) })).filter((x) => x.value);
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
