// Roman interactif, lot 9 : import d'une histoire Twee 3 (Twine) ou Ink. Chaque passage (Twee) ou section
// (Ink : knot, stitch) devient une scène ; ses liens ou choix, le bloc ```choix de la scène. Ce que MondoWrite
// ne sait pas représenter dans un bloc de choix (choix imbriqués, rassemblements, logique en ligne) est gardé
// tel quel en lignes brutes du bloc : l'histoire se lit toujours, la carte des choix montre le reste.
// Fonctions pures.

import { cleanLabel, choicesHtml, END_TARGET, sceneSlugs, serializeChoices, type ChoiceLine } from "./choices";
import { cleanFactLabel, FACTS_KEY, isFactName } from "./facts";
import { INTERACTIVE_KEY } from "./index";
import type { CardData, CardLayout, Project } from "../types";

/** Histoire lue, avant d'être un projet : noms d'origine, texte en paragraphes, choix vers des noms d'origine. */
export interface StorySource {
  title?: string;
  /** Scènes dans l'ordre du fichier ; `start` la première lue. */
  scenes: { name: string; title: string; paragraphs: string[]; choices: ChoiceLine[] }[];
  start?: string;
  /** Libellés des faits (commentaires des `VAR` d'Ink). */
  factLabels: Record<string, string>;
  /** Éléments laissés de côté (passages de script, fonctions d'Ink…), pour le dire à l'auteur. */
  skipped: number;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- Twee 3 ----------

/** Passages de SugarCube et de Twine qui ne sont pas des scènes. */
const TWEE_SPECIAL = new Set(["StoryTitle", "StoryData", "StoryInit", "StoryMenu", "StoryCaption", "StoryBanner", "StoryAuthor", "StorySubtitle", "PassageReady", "PassageDone", "PassageHeader", "PassageFooter", "StoryInterface", "StoryShare"]);
const TWEE_SKIP_TAGS = new Set(["script", "stylesheet", "widget", "Twine.private", "Twine.audio", "Twine.image", "Twine.video", "Twine.vtt"]);

/** Échappements du nom d'un passage (`\[`, `\{`, `\\`). */
const unescapeTwee = (s: string) => s.replace(/\\(.)/g, "$1");

function readTweeHeader(line: string): { name: string; tags: string[] } {
  let rest = line.replace(/^::\s*/, "");
  // Métadonnées en JSON en fin de ligne, puis étiquettes entre crochets (non échappés).
  rest = rest.replace(/\s*\{[^{}]*\}\s*$/, "");
  let tags: string[] = [];
  const m = /^(.*?)(?<!\\)\[([^\]]*)\]\s*$/.exec(rest);
  if (m) {
    rest = m[1];
    tags = m[2].split(/\s+/).filter(Boolean);
  }
  return { name: unescapeTwee(rest.trim()), tags };
}

/** Un lien de Twine : `[[texte->cible]]`, `[[cible<-texte]]`, `[[texte|cible]]`, `[[cible]]` (setter de SugarCube retiré). */
export function readTweeLink(inner: string): { label: string; target: string } {
  const body = inner.replace(/\]\[[\s\S]*$/, "");
  let m = /^([\s\S]*)->([\s\S]+)$/.exec(body);
  if (m) return { label: m[1].trim(), target: m[2].trim() };
  m = /^([\s\S]+?)<-([\s\S]*)$/.exec(body);
  if (m) return { label: m[2].trim(), target: m[1].trim() };
  m = /^([\s\S]*?)\|([\s\S]+)$/.exec(body);
  if (m) return { label: m[1].trim(), target: m[2].trim() };
  return { label: body.trim(), target: body.trim() };
}

const LINK_RE = /\[\[([\s\S]*?)\]\](?!\])/g;

export function parseTwee(text: string): StorySource | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const passages: { name: string; tags: string[]; body: string[] }[] = [];
  for (const line of lines) {
    if (line.startsWith("::")) passages.push({ ...readTweeHeader(line), body: [] });
    else passages[passages.length - 1]?.body.push(line);
  }
  if (passages.length === 0) return null;
  let title: string | undefined;
  let start: string | undefined;
  let skipped = 0;
  const scenes: StorySource["scenes"] = [];
  for (const p of passages) {
    const body = p.body.join("\n").trim();
    if (p.name === "StoryTitle") {
      title = body.split("\n")[0]?.trim() || undefined;
      continue;
    }
    if (p.name === "StoryData") {
      try {
        const data = JSON.parse(body) as { start?: unknown };
        if (typeof data.start === "string") start = data.start;
      } catch {
        // métadonnées illisibles : sans départ désigné
      }
      continue;
    }
    if (TWEE_SPECIAL.has(p.name) || p.tags.some((t) => TWEE_SKIP_TAGS.has(t))) {
      skipped++;
      continue;
    }
    const choices: ChoiceLine[] = [];
    const seen = new Set<string>();
    const paragraphs: string[] = [];
    for (const raw of body.split("\n")) {
      const links = [...raw.matchAll(LINK_RE)].map((m) => readTweeLink(m[1]));
      for (const l of links) {
        const key = `${l.label}\u0000${l.target}`;
        if (seen.has(key) || !l.target) continue;
        seen.add(key);
        choices.push({ kind: "choice", label: cleanLabel(l.label), target: l.target });
      }
      // Ligne faite seulement de liens (et de séparateurs) : ce sont des choix, pas du texte.
      const prose = raw.replace(LINK_RE, (_, inner: string) => readTweeLink(inner).label);
      const withoutLinks = raw.replace(LINK_RE, "").replace(/[\s|•·*\-–—]+/g, "");
      // Macro de SugarCube seule sur sa ligne (`<<set …>>`) : de la logique, pas du texte.
      const onlyMacro = /^\s*(<<[\s\S]*?>>\s*)+$/.test(raw);
      if (links.length > 0 && !withoutLinks) continue;
      if (onlyMacro) continue;
      if (prose.trim()) paragraphs.push(prose.trim());
    }
    scenes.push({ name: p.name, title: p.name, paragraphs, choices });
  }
  if (scenes.length === 0) return null;
  if (!start || !scenes.some((s) => s.name === start)) start = scenes.find((s) => s.name === "Start")?.name ?? scenes[0].name;
  return { title, scenes, start, factLabels: {}, skipped };
}

// ---------- Ink ----------

/** Nom de knot ou de stitch en titre lisible : « la_cour » → « La cour ». */
export const titleOfKnot = (name: string) => {
  const t = name.replace(/_+/g, " ").trim();
  return t.charAt(0).toLocaleUpperCase() + t.slice(1);
};

/** Retire les commentaires `/* … *\/` et `// …` (hors d'une adresse `://`). Le commentaire d'un `VAR` est lu avant. */
const stripComment = (line: string) => line.replace(/(^|[^:])\/\/.*$/, "$1");

/** Texte d'une ligne d'Ink : échappements retirés, collage `<>` retiré. */
const inkText = (line: string) => line.replace(/<>/g, "").replace(/\\(.)/g, "$1").trim();

const CHOICE_RE = /^([*+])(\s*[*+])*\s*(.*)$/;
const DIVERT_RE = /^->\s*([\p{L}\p{N}_.]+)\s*$/u;

export function parseInk(text: string, openingTitle: string): StorySource | null {
  const src = text.replace(/\r\n?/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const factLabels: Record<string, string> = {};
  let skipped = 0;
  type Scene = StorySource["scenes"][number] & { knot: string };
  const scenes: Scene[] = [];
  let current: Scene | null = null;
  let knot = "";
  let inFunction = false;
  let topStart: string | undefined;
  const open = (name: string, title: string) => {
    current = { name, title, paragraphs: [], choices: [], knot };
    scenes.push(current);
  };
  // Choix en cours de lecture (ses lignes `~` et son renvoi peuvent suivre).
  let pending: { choice: Extract<ChoiceLine, { kind: "choice" }>; raw: string[]; plain: boolean } | null = null;
  const flush = () => {
    if (!pending || !current) return (pending = null);
    const scene: Scene = current;
    if (pending.plain && pending.choice.target) scene.choices.push(pending.choice);
    else for (const r of pending.raw) scene.choices.push({ kind: "raw", text: r });
    pending = null;
  };

  for (const rawLine of src.split("\n")) {
    const line = rawLine.trim();
    const varMatch = /^VAR\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*[^/]*?(?:\/\/\s*(.*))?$/u.exec(line);
    if (varMatch) {
      if (isFactName(varMatch[1]) && varMatch[2]?.trim()) factLabels[varMatch[1]] = cleanFactLabel(varMatch[2]);
      continue;
    }
    const code = stripComment(rawLine).trim();
    if (!code) {
      // Ligne vide : fin d'un choix qui n'a pas reçu de renvoi.
      continue;
    }
    if (/^(CONST|INCLUDE|LIST|EXTERNAL)\b/.test(code)) continue;
    const knotMatch = /^={2,}\s*(function\s+)?([\p{L}\p{N}_]+)\s*(\([^)]*\))?\s*=*\s*$/u.exec(code);
    if (knotMatch) {
      flush();
      inFunction = !!knotMatch[1];
      if (inFunction) {
        skipped++;
        current = null;
        continue;
      }
      knot = knotMatch[2];
      open(knot, titleOfKnot(knot));
      continue;
    }
    if (inFunction) continue;
    const stitchMatch = /^=\s*([\p{L}\p{N}_]+)\s*(\([^)]*\))?\s*$/u.exec(code);
    if (stitchMatch && knot) {
      flush();
      open(`${knot}.${stitchMatch[1]}`, `${titleOfKnot(knot)}, ${titleOfKnot(stitchMatch[1]).toLocaleLowerCase()}`);
      continue;
    }
    // Avant le premier knot : le renvoi de départ ; du texte fait une scène d'ouverture.
    if (!current) {
      const d = DIVERT_RE.exec(code);
      if (d && !scenes.length) {
        topStart = d[1];
        continue;
      }
      open("__opening", openingTitle);
    }
    const scene = current as unknown as Scene;
    if (code.startsWith("#")) continue; // étiquettes (images et autres) : sans fichier à reprendre
    const choiceMatch = CHOICE_RE.exec(code);
    if (choiceMatch) {
      flush();
      const nested = !!choiceMatch[2];
      let rest = choiceMatch[3];
      rest = rest.replace(/^\(\s*[\p{L}\p{N}_]+\s*\)\s*/u, ""); // étiquette de choix
      const conds: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = /^\{([^{}]*)\}\s*/.exec(rest))) {
        conds.push(m[1].trim());
        rest = rest.slice(m[0].length);
      }
      const divert = /\s*->\s*([\p{L}\p{N}_.]+)\s*$/u.exec(rest);
      const body = divert ? rest.slice(0, divert.index) : rest;
      // `a[b]c` : le lecteur voit « ab » dans le choix.
      const bracket = /^([^[\]]*)\[([^\]]*)\]([^[\]]*)$/.exec(body);
      const label = inkText(bracket ? bracket[1] + bracket[2] : body);
      const after = bracket ? bracket[3].trim() : "";
      const plain = !nested && !after && conds.every((c) => !/[{}]/.test(c));
      pending = {
        choice: { kind: "choice", label: cleanLabel(label), target: divert?.[1] ?? "", ...(conds.length ? { cond: conds.join(" and ") } : {}) },
        raw: [code],
        plain,
      };
      continue;
    }
    if (pending) {
      const d = DIVERT_RE.exec(code);
      if (code.startsWith("~")) {
        pending.raw.push(`  ${code}`);
        pending.choice.effects = [...(pending.choice.effects ?? []), code.replace(/^~\s*/, "")];
        continue;
      }
      if (d && !pending.choice.target) {
        pending.raw.push(`  ${code}`);
        pending.choice.target = d[1];
        continue;
      }
      // Autre chose sous le choix (texte, sous-choix, rassemblement) : le choix reste en Ink brut.
      if (/^\s/.test(rawLine) || !pending.choice.target) {
        pending.raw.push(rawLine.replace(/\s+$/, ""));
        pending.plain = false;
        continue;
      }
      flush();
    }
    if (DIVERT_RE.test(code) || /^(-|~|\{|<-|->)/.test(code) || code.includes("->")) {
      scene.choices.push({ kind: "raw", text: code });
      continue;
    }
    const t = inkText(code);
    if (t) scene.paragraphs.push(t);
  }
  flush();
  if (scenes.length === 0) return null;
  const opening = scenes.find((s) => s.name === "__opening");
  const start = opening ? opening.name : topStart && scenes.some((s) => s.name === topStart) ? topStart : scenes[0].name;
  return { scenes, start, factLabels, skipped };
}

// ---------- Projet ----------

const PER_ROW = 4;
const STEP_X = 320;
const STEP_Y = 260;

/** Renvoie vers les noms d'origine réécrits pour les noms des scènes du projet (`-> x`, conditions). */
function renamer(names: ReadonlyMap<string, string>, knotOf: (name: string) => string) {
  const target = (t: string, from: string) => {
    if (t === "END" || t === "DONE") return END_TARGET;
    // Dans un knot, un stitch voisin se nomme sans son knot.
    return names.get(t) ?? names.get(`${knotOf(from)}.${t}`) ?? t;
  };
  const idents = (text: string, from: string) =>
    text.replace(/->\s*([\p{L}\p{N}_.]+)/gu, (_, t: string) => `-> ${target(t, from)}`).replace(/(^|[^\p{L}\p{N}_.])([\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}\p{N}_]+)?)(?![\p{L}\p{N}_])/gu, (all, pre: string, id: string) => {
      const hit = names.get(id) ?? names.get(`${knotOf(from)}.${id}`);
      return hit ? pre + hit : all;
    });
  return { target, idents };
}

/** Le projet : un roman interactif, une carte Scène par scène, le départ en tête du plan. */
export function storyToProject(source: StorySource, options: { fileName: string; newId: () => string }): Project {
  const ordered = [...source.scenes];
  const startAt = ordered.findIndex((s) => s.name === source.start);
  if (startAt > 0) ordered.unshift(...ordered.splice(startAt, 1));
  const ids = ordered.map(() => options.newId());
  const refs = ordered.map((s, i) => ({ id: ids[i], title: s.title }));
  const slugs = sceneSlugs(refs);
  const names = new Map(ordered.map((s, i) => [s.name, slugs.get(ids[i])!]));
  const knotOf = (name: string) => name.split(".")[0];
  const { target, idents } = renamer(names, knotOf);

  const cards: CardData[] = [];
  const layout: CardLayout[] = [];
  const manuscript: Record<string, string> = {};
  ordered.forEach((s, i) => {
    const id = ids[i];
    const lines: ChoiceLine[] = s.choices.map((l) =>
      l.kind === "raw"
        ? { kind: "raw", text: idents(l.text, s.name) }
        : { ...l, target: target(l.target, s.name), ...(l.cond ? { cond: idents(l.cond, s.name) } : {}) },
    );
    const text = s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
    manuscript[id] = lines.length ? `${text}${choicesHtml(serializeChoices(lines))}` : text;
    cards.push({ id, type: "scene", title: s.title, html: "" });
    layout.push({ id, x: 80 + (i % PER_ROW) * STEP_X, y: 80 + Math.floor(i / PER_ROW) * STEP_Y });
  });
  const title = source.title?.trim() || options.fileName.replace(/\.[^.]+$/, "").trim();
  // Clés du roman interactif : hors de ProjectMeta, gardées telles quelles (metaKeep), comme à la création.
  const extra: Record<string, unknown> = { [INTERACTIVE_KEY]: true, ...(Object.keys(source.factLabels).length ? { [FACTS_KEY]: source.factLabels } : {}) };
  return {
    meta: { version: 1, title, kind: "roman", layout, links: [], plan: { template: "libre", beats: { libre: ids } }, ...extra },
    cards,
    screenplay: null,
    manuscript,
  };
}
