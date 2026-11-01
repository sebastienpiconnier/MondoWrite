// Gabarits dans un fichier (export et import de « Mes gabarits ») : un gabarit s'échange en Markdown, lisible et
// modifiable dans n'importe quel éditeur, un titre `#` pour son nom et un intertitre `##` par case, l'aide de la case
// en dessous. À l'import on accepte aussi une simple liste (« - Case : aide »), des lignes nues ou du JSON
// ({ name, beats: [{ label, hint }] }). Rien n'entre dans le projet ici : l'éditeur de gabarit s'ouvre prérempli.
// Fonctions pures, testées.

export interface TemplateFileBeat {
  label: string;
  hint?: string;
}
export interface TemplateFile {
  name: string;
  beats: TemplateFileBeat[];
}

export const TEMPLATE_IMPORT_EXTENSIONS = ["md", "markdown", "txt", "json"];
const MAX_BEATS = 40;
const MAX_LABEL = 120;
const MAX_HINT = 300;
const MAX_FILE = 200_000;

/** Le gabarit en Markdown : `# Nom`, puis `## Case` et son aide, dans l'ordre du récit. */
export function templateToMarkdown(template: TemplateFile): string {
  const lines = [`# ${oneLine(template.name)}`, ""];
  for (const beat of template.beats) {
    lines.push(`## ${oneLine(beat.label)}`, "");
    if (beat.hint?.trim()) lines.push(oneLine(beat.hint), "");
  }
  return lines.join("\n");
}

/** Nom de fichier sûr sur les trois systèmes, sans extension. */
export function templateFileName(name: string, fallback: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80)
    .trim();
  return clean || fallback;
}

/** Lit un fichier de gabarit ; null s'il n'en sort aucune case. `fileName` donne le nom à défaut de titre. */
export function parseTemplateText(text: string, fileName = ""): TemplateFile | null {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").slice(0, MAX_FILE);
  const fallbackName = fileName.replace(/\.[^.]+$/, "").replace(/\.gabarit$|\.template$/i, "").trim();
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return fromJson(JSON.parse(trimmed), fallbackName);
    } catch {
      // Pas du JSON valide : on le lit comme du texte.
    }
  }
  return fromText(stripFrontmatter(src), fallbackName);
}

function fromJson(raw: unknown, fallbackName: string): TemplateFile | null {
  const obj = (Array.isArray(raw) ? { beats: raw } : raw) as { name?: unknown; title?: unknown; beats?: unknown; cases?: unknown };
  if (!obj || typeof obj !== "object") return null;
  const list = Array.isArray(obj.beats) ? obj.beats : Array.isArray(obj.cases) ? obj.cases : null;
  if (!list) return null;
  const beats = list.flatMap((b): TemplateFileBeat[] => {
    if (typeof b === "string") return beat(b);
    if (!b || typeof b !== "object") return [];
    const { label, name, title, hint, help, description } = b as Record<string, unknown>;
    const l = [label, name, title].find((v) => typeof v === "string") as string | undefined;
    const h = [hint, help, description].find((v) => typeof v === "string") as string | undefined;
    return l ? beat(l, h) : [];
  });
  const name = [obj.name, obj.title].find((v) => typeof v === "string") as string | undefined;
  return finish(name ?? fallbackName, beats);
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const ITEM = /^\s*(?:[-*+]|\d{1,3}[.)])\s+(.*)$/;

function fromText(src: string, fallbackName: string): TemplateFile | null {
  const lines = src.split("\n");
  const headings = lines.map((l) => HEADING.exec(l)).filter((m): m is RegExpExecArray => !!m);
  const levels = headings.map((m) => m[1].length);
  const top = levels.length ? Math.min(...levels) : 0;
  // Un seul titre du plus haut niveau, suivi d'intertitres : le titre est le nom, les intertitres sont les cases.
  const topCount = levels.filter((l) => l === top).length;
  const beatLevel = topCount === 1 && levels.some((l) => l > top) ? Math.min(...levels.filter((l) => l > top)) : topCount > 1 ? top : 0;
  let name = topCount === 1 && beatLevel !== top ? clean(headings.find((m) => m[1].length === top)![2]) : "";

  if (beatLevel > 0) {
    const beats: TemplateFileBeat[] = [];
    let current: { label: string; hint: string[] } | null = null;
    const flush = () => {
      if (current) beats.push(...beat(current.label, current.hint.join(" ")));
      current = null;
    };
    for (const line of lines) {
      const m = HEADING.exec(line);
      if (m && m[1].length === beatLevel) {
        flush();
        current = { label: m[2], hint: [] };
      } else if (m) {
        if (m[1].length < beatLevel) flush();
      } else if (current && line.trim()) current.hint.push(line.trim().replace(ITEM, "$1"));
    }
    flush();
    return finish(name || fallbackName, beats);
  }

  // Sans intertitres : une liste, sinon une case par ligne non vide. Un titre unique reste le nom.
  const body = lines.filter((l) => !HEADING.test(l));
  const hasItems = body.some((l) => ITEM.test(l));
  const beats: TemplateFileBeat[] = [];
  for (const line of body) {
    if (!line.trim()) continue;
    const item = ITEM.exec(line);
    if (hasItems && !item) {
      // Ligne de suite d'une case de la liste : elle complète son aide.
      const last = beats[beats.length - 1];
      if (last) last.hint = clip(last.hint ? `${last.hint} ${clean(line)}` : upperFirst(clean(line)), MAX_HINT);
      continue;
    }
    const [label, hint] = splitLine(item ? item[1] : line);
    beats.push(...beat(label, hint));
  }
  if (!name && headings.length === 1) name = clean(headings[0][2]);
  return finish(name || fallbackName, beats);
}

/** « Case : aide », « Case — aide », « Case – aide » ou « Case - aide » ; sinon toute la ligne est le nom. */
function splitLine(line: string): [string, string | undefined] {
  const bold = /^\s*\*\*(.+?)\*\*\s*[:—–-]?\s*(.*)$/.exec(line);
  if (bold) return [bold[1], bold[2] || undefined];
  const m = /^(.+?)\s*(?:[  ]?:\s+|\s[—–-]\s)(.+)$/.exec(line);
  return m ? [m[1], m[2]] : [line, undefined];
}

function beat(label: string, hint?: string): TemplateFileBeat[] {
  const l = clip(clean(label).replace(/^\d{1,3}[.)]\s+/, ""), MAX_LABEL);
  if (!l) return [];
  // « Le crime : un corps » : l'aide commence par une capitale, comme celles des gabarits livrés.
  const h = hint ? clip(upperFirst(clean(hint)), MAX_HINT) : "";
  return [h ? { label: l, hint: h } : { label: l }];
}

function upperFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

function finish(name: string, beats: TemplateFileBeat[]): TemplateFile | null {
  if (beats.length === 0) return null;
  return { name: clip(clean(name), MAX_LABEL), beats: beats.slice(0, MAX_BEATS) };
}

function stripFrontmatter(src: string): string {
  const m = /^---\n[\s\S]*?\n---\n/.exec(src);
  return m ? src.slice(m[0].length) : src;
}

/** Retire la mise en forme Markdown courante d'un texte d'une ligne. */
function clean(text: string): string {
  return oneLine(text)
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, "$1$2")
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .trim();
}

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();
const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max).trim() : text);
