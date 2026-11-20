// Roman interactif, lot 9 : import d'une histoire Twee 3 (Twine) ou Ink. Chaque passage (Twee) ou section
// (Ink : knot, stitch) devient une scène ; ses liens ou choix, le bloc ```choix de la scène. Ce que MondoWrite
// ne sait pas représenter dans un bloc de choix (choix imbriqués, rassemblements, logique en ligne) est gardé
// tel quel en lignes brutes du bloc : l'histoire se lit toujours, la carte des choix montre le reste.
// Fonctions pures.

import { cleanLabel, choicesHtml, END_TARGET, sceneSlugs, serializeChoices, type ChoiceLine } from "./choices";
import { cleanFactLabel, condNames, FACTS_KEY, isFactName } from "./facts";
import { INTERACTIVE_KEY } from "./index";
import { rawComment, readPassage, type TweeScene } from "./twine";
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
  /** Twee (#96) : macros converties en faits, conditions et choix, et gardées en commentaire du bloc de choix. */
  converted?: number;
  kept?: number;
  /** Histoire de Twine : ses conditions ne nomment jamais un passage (en Ink, « a lu cette scène »). */
  twine?: boolean;
}

/** Ce que l'import dit à l'auteur. */
export interface StoryReport {
  scenes: number;
  converted: number;
  kept: number;
  skipped: number;
}

export const storyReport = (source: StorySource): StoryReport => ({
  scenes: source.scenes.length,
  converted: source.converted ?? 0,
  kept: source.kept ?? 0,
  skipped: source.skipped,
});

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

export { readTweeLink } from "./twine";

/** Format de l'histoire (StoryData) : Harlowe lit aussi les macros `(nom: …)`. */
const isHarlowe = (format: string | undefined, text: string) =>
  format ? /harlowe/i.test(format) : /\((?:set|put|if|unless|link-?goto|click-?goto|go-?to|link)\s*:/i.test(text);

/** Effet sans conséquence au départ : un fait faux ou un compteur à zéro, valeurs de départ de MondoWrite. */
const isDefaultEffect = (effect: string) => /^\S+ = (false|0)$/.test(effect);

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
  let format: string | undefined;
  for (const p of passages) {
    const body = p.body.join("\n").trim();
    if (p.name === "StoryTitle") title = body.split("\n")[0]?.trim() || undefined;
    if (p.name === "StoryData") {
      try {
        const data = JSON.parse(body) as { start?: unknown; format?: unknown };
        if (typeof data.start === "string") start = data.start;
        if (typeof data.format === "string") format = data.format;
      } catch {
        // métadonnées illisibles : sans départ ni format désignés
      }
    }
  }
  const harlowe = isHarlowe(format, text);
  let skipped = 0;
  let converted = 0;
  let kept = 0;
  const read: (TweeScene & { name: string })[] = [];
  for (const p of passages) {
    if (p.name === "StoryTitle" || p.name === "StoryData") continue;
    if (TWEE_SPECIAL.has(p.name) || p.tags.some((t) => TWEE_SKIP_TAGS.has(t))) {
      skipped++;
      continue;
    }
    read.push({ name: p.name, ...readPassage(p.body.join("\n").trim(), harlowe) });
  }
  if (read.length === 0) return null;
  if (!start || !read.some((s) => s.name === start)) start = read.find((s) => s.name === "Start")?.name ?? read[0].name;
  // Effets posés par un passage : ceux de tous les choix qui y mènent. Au départ, seulement les valeurs de départ
  // (le premier passage n'a pas de choix d'entrée) ; sinon gardés en commentaire.
  for (const scene of read) {
    const incoming = read.flatMap((s) => s.choices).filter((c) => c.target === scene.name);
    for (const { effects, src } of scene.entry) {
      const harmless = effects.every(isDefaultEffect);
      if ((scene.name !== start || harmless) && (incoming.length || harmless)) {
        for (const c of incoming) c.effects = [...new Set([...(c.effects ?? []), ...effects])];
        scene.converted++;
      } else {
        scene.raw.push(rawComment(src));
        scene.kept++;
      }
    }
  }
  const scenes: StorySource["scenes"] = read.map((s) => {
    converted += s.converted;
    kept += s.kept;
    const choices: ChoiceLine[] = [...s.choices, ...s.raw.map((text): ChoiceLine => ({ kind: "raw", text }))];
    return { name: s.name, title: s.name, paragraphs: s.paragraphs, choices };
  });
  return { title, scenes, start, factLabels: {}, skipped, converted, kept, twine: true };
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
  // Choix en cours de lecture (son texte, ses lignes `~` et son renvoi peuvent suivre).
  let pending: { choice: Extract<ChoiceLine, { kind: "choice" }>; raw: string[]; plain: boolean; body: string[]; echo: string } | null = null;
  // Texte écrit sous un choix : une scène de passage (titre du choix, ce texte, puis « Continuer » vers le renvoi),
  // rangée après la scène du choix. Le choix y mène, avec ses effets.
  const passages: { after: Scene; scene: Scene }[] = [];
  const flush = () => {
    if (!pending || !current) return (pending = null);
    const scene: Scene = current;
    const { choice, body } = pending;
    if (pending.plain && choice.target && body.length) {
      const name = `${scene.name}__${passages.filter((p) => p.after === scene).length + 1}`;
      const title = choice.label || openingTitle;
      passages.push({ after: scene, scene: { name, title, paragraphs: body, choices: [{ kind: "choice", label: "", target: choice.target }], knot: scene.knot } });
      scene.choices.push({ ...choice, target: name });
    } else if (pending.plain && choice.target) scene.choices.push(choice);
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
      const plain = !nested && conds.every((c) => !/[{}]/.test(c));
      // Ce que le lecteur lit une fois le choix fait (`a[b]c` : « ac »). Il n'ouvre une scène de passage que si le
      // choix a du texte après ses crochets ou des lignes sous lui (sinon chaque choix ferait une scène).
      const echo = inkText(bracket ? bracket[1] + bracket[3] : body);
      pending = {
        choice: { kind: "choice", label: cleanLabel(label), target: divert?.[1] ?? "", ...(conds.length ? { cond: conds.join(" and ") } : {}) },
        raw: [code],
        plain,
        body: after && echo ? [echo] : [],
        echo,
      };
      continue;
    }
    if (pending) {
      const d = DIVERT_RE.exec(code);
      if (code.startsWith("~")) {
        pending.raw.push(`  ${code}`);
        // `~ temp x = …` : variable de passage en Ink, un fait comme un autre ici.
        pending.choice.effects = [...(pending.choice.effects ?? []), code.replace(/^~\s*(temp\s+)?/, "")];
        continue;
      }
      if (d && !pending.choice.target) {
        pending.raw.push(`  ${code}`);
        pending.choice.target = d[1];
        continue;
      }
      // Texte simple sous le choix, avant son renvoi : le texte de sa scène de passage.
      const t = inkText(code);
      if (!pending.choice.target && t && !/^[*+\-{<]/.test(code) && !code.includes("->") && !/[{}]/.test(code)) {
        pending.raw.push(rawLine.replace(/\s+$/, ""));
        if (!pending.body.length && pending.echo) pending.body.push(pending.echo);
        pending.body.push(t);
        continue;
      }
      // Autre chose sous le choix (sous-choix, rassemblement, logique) : le choix reste en Ink brut.
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
  // Scènes de passage : chacune après la scène de son choix (et après les passages précédents de ce choix).
  for (const p of passages) {
    let at = scenes.indexOf(p.after) + 1;
    while (at < scenes.length && scenes[at].name.startsWith(`${p.after.name}__`)) at++;
    scenes.splice(at, 0, p.scene);
  }
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

/** Renomme dans une condition ou un effet les faits qui portent le nom d'une scène (`village` → `village_fait`). */
function factRenames(source: StorySource, slugs: ReadonlySet<string>): (text: string) => string {
  const used = new Set<string>();
  for (const s of source.scenes)
    for (const l of s.choices) {
      if (l.kind !== "choice") continue;
      if (l.cond) condNames(l.cond).forEach((n) => used.add(n));
      for (const e of l.effects ?? []) {
        const m = /^([\p{L}_][\p{L}\p{N}_]*)/u.exec(e);
        if (m) used.add(m[1]);
      }
    }
  const map = new Map<string, string>();
  for (const name of used) {
    if (!slugs.has(name)) continue;
    let next = `${name}_fait`;
    for (let n = 2; slugs.has(next) || used.has(next); n++) next = `${name}_fait${n}`;
    map.set(name, next);
  }
  if (map.size === 0) return (text) => text;
  return (text) => text.replace(/[\p{L}_][\p{L}\p{N}_]*/gu, (w) => map.get(w) ?? w);
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
  // Twine : une variable au nom d'une scène serait lue par Ink comme « a lu cette scène » ; elle est renommée.
  const facts = source.twine ? factRenames(source, new Set(names.values())) : null;

  const cards: CardData[] = [];
  const layout: CardLayout[] = [];
  const manuscript: Record<string, string> = {};
  ordered.forEach((s, i) => {
    const id = ids[i];
    const lines: ChoiceLine[] = s.choices.map((l) => {
      if (facts) return l.kind === "raw" ? l : { ...l, target: target(l.target, s.name), ...(l.cond ? { cond: facts(l.cond) } : {}), ...(l.effects ? { effects: l.effects.map(facts) } : {}) };
      return l.kind === "raw"
        ? { kind: "raw", text: idents(l.text, s.name) }
        : { ...l, target: target(l.target, s.name), ...(l.cond ? { cond: idents(l.cond, s.name) } : {}) };
    });
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
