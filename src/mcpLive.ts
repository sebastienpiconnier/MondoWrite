// Assistant externe par MCP (#62) : lectures faites par l'app ouverte, sur le projet tel qu'il est à l'écran
// (« À faire », commentaires, statistiques, points de « Vérifier », versions d'une scène, journal de l'IA). Le serveur
// les transmet comme les écritures, mais un accès en lecture suffit. Les textes rendus sont pour l'IA : en clair,
// avec les numéros et titres des scènes. Pur hormis `readVersions`, testé.

import type { Messages } from "./i18n";
import type { CardData, ProjectKind } from "./types";
import type { Screenplay } from "./screenplay/model";
import type { Comments } from "./comments";
import type { Pitch } from "./pitch";
import type { Paper } from "./screenplay/layout";
import { LAYOUTS } from "./screenplay/layout";
import { paginate } from "./screenplay/paginate";
import { listScenes } from "./screenplay/scenes";
import { collectTodos, type TodoKind } from "./todos";
import { checkManuscript, checkScreenplay, checkStory, type Finding } from "./review/checks";
import { novelReport, screenplayReport, withPov, type CharacterRow } from "./review/report";
import { silentCharacters } from "./review/silent";
import { novelPlaces, screenplayPlaces, settingSummary } from "./review/places";
import { castForMatrix, neverMeet, novelCast, screenplayCast, topDuo } from "./review/crossings";
import { countWords } from "./manuscript";
import { readVersionFile } from "./versions";
import type { McpAnswer, McpRequest } from "./mcpWrite";
import { findCard } from "./mcpWrite";

/** Le projet ouvert, tel que les lectures le voient. */
export interface LiveSource {
  kind: ProjectKind;
  lang: string;
  cards: CardData[];
  edges: { source: string; target: string }[];
  manuscript: Record<string, string>;
  screenplay: Screenplay | null;
  comments: Comments;
  paper: Paper;
  pitch: Pitch;
  journal: string;
  /** Ordre du livre (roman). */
  order: string[];
  /** Scènes numérotées comme les voit l'IA (instantané). */
  scenes: { n: number; id: string; title: string }[];
  readVersions: (cardId: string) => Promise<Record<string, string>>;
}

export const LIVE_TOOLS = ["todo_list", "read_comments", "project_stats", "review", "scene_versions", "read_journal"] as const;
export const isLiveTool = (tool: string) => (LIVE_TOOLS as readonly string[]).includes(tool);

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim();
const ok = (text: string): McpAnswer => ({ ok: true, text });
const fail = (text: string): McpAnswer => ({ ok: false, text });
const pct = (x: number) => `${Math.round(x * 100)} %`;

const TODO_LABELS: Record<TodoKind, string> = {
  task: "Cases à cocher",
  revisit: "Passages à reprendre",
  question: "Questions « À creuser » (dans une fiche)",
  open: "Cartes Question ouvertes",
  ia: "Textes de l'IA pas encore repris par l'auteur",
  comment: "Commentaires ouverts",
};

function sceneName(src: LiveSource, cardId: string): string {
  const scene = src.scenes.find((s) => s.id === cardId);
  if (scene) return `scène ${scene.n} « ${scene.title} »`;
  const card = src.cards.find((c) => c.id === cardId);
  return card ? `« ${card.title} »` : cardId;
}

function findScene(src: LiveSource, wanted: string) {
  const n = /^\d+$/.test(wanted.trim()) ? Number(wanted.trim()) : NaN;
  return src.scenes.find((s) => s.n === n) ?? findCard(src.scenes, wanted);
}

/** Lignes des personnages, comme la fenêtre Statistiques. */
function characterRows(src: LiveSource): CharacterRow[] {
  const sp = src.screenplay;
  if (src.kind === "scenario") {
    if (!sp) return [];
    const silent = silentCharacters(sp.elements, src.cards).map((c) => c.name);
    return withPov(screenplayReport(sp.elements, src.cards, src.lang, silent), src.cards, listScenes(sp.elements).flatMap((s) => (s.cardId ? [s.cardId] : [])));
  }
  return withPov(novelReport(src.manuscript, src.order, src.cards), src.cards, src.order, (id) => countWords(src.manuscript[id]));
}

function todoList(src: LiveSource): McpAnswer {
  const todos = collectTodos(src.cards, src.manuscript, src.screenplay, src.comments);
  if (todos.length === 0) return ok("Rien dans « À faire ».");
  const out: string[] = [];
  for (const kind of Object.keys(TODO_LABELS) as TodoKind[]) {
    const list = todos.filter((x) => x.kind === kind);
    if (list.length === 0) continue;
    out.push(`## ${TODO_LABELS[kind]} (${list.length})`);
    for (const x of list.slice(0, 60)) out.push(`- ${sceneName(src, x.cardId)} : ${x.text.replace(/\s+/g, " ").slice(0, 300)}`);
    if (list.length > 60) out.push(`- … et ${list.length - 60} de plus`);
    out.push("");
  }
  return ok(out.join("\n").trim());
}

function readComments(src: LiveSource, a: Record<string, unknown>): McpAnswer {
  let ids = Object.keys(src.comments);
  if (str(a.scene)) {
    const scene = findScene(src, str(a.scene));
    if (!scene) return fail(`Scène introuvable : « ${str(a.scene)} ».`);
    ids = ids.filter((id) => id === scene.id);
  }
  const withResolved = a.resolved === true;
  const order = new Map(src.scenes.map((s) => [s.id, s.n]));
  ids.sort((x, y) => (order.get(x) ?? 1e9) - (order.get(y) ?? 1e9));
  const out: string[] = [];
  for (const id of ids) {
    const list = (src.comments[id] ?? []).filter((c) => withResolved || !c.resolved);
    if (list.length === 0) continue;
    out.push(`## ${sceneName(src, id)}`);
    for (const c of list) out.push(`- \`${c.id}\`${c.resolved ? " (résolu)" : ""}, ${c.date.slice(0, 10)} : « ${c.quote} » → ${c.text || "(vide)"}`);
    out.push("");
  }
  return ok(out.length ? out.join("\n").trim() : "Aucun commentaire.");
}

function projectStats(src: LiveSource): McpAnswer {
  const script = src.kind === "scenario";
  const sp = src.screenplay;
  const out: string[] = [];
  const rows = characterRows(src);
  out.push("## Personnages");
  out.push(script ? "nom | scènes | répliques | mots dits | part de parole | 1re et dernière scène | point de vue" : "nom | scènes où il est cité | mots de ces scènes | part des scènes | 1re et dernière scène | point de vue");
  for (const r of rows.slice(0, 40)) {
    const span = r.first ? `${r.first} à ${r.last}` : "absent";
    const pov = r.pov ? `${r.pov.scenes} scènes` : "";
    out.push(script ? `${r.name}${r.id ? "" : " (sans carte)"} | ${r.scenes} | ${r.lines} | ${r.words} | ${pct(r.share)} | ${span} | ${pov}` : `${r.name} | ${r.scenes} | ${r.words} | ${pct(r.share)} | ${span} | ${pov}`);
  }
  const pagination = script && sp ? paginate(sp.elements, LAYOUTS[src.paper]) : null;
  const places = script ? (sp ? screenplayPlaces(sp.elements, src.cards, pagination, src.lang) : []) : novelPlaces(src.manuscript, src.order, src.cards, src.edges);
  out.push("", script ? "## Décors" : "## Lieux");
  for (const p of places.slice(0, 30)) out.push(`${p.name}${p.id ? "" : " (sans carte)"} | ${p.scenes} scènes | ${script ? `${p.pages.toFixed(1)} p.` : `${p.words} mots`} | ${pct(p.share)} | ${p.characters.slice(0, 6).join(", ")}`);
  if (script && sp) {
    const s = settingSummary(sp.elements);
    out.push("", "## Int./Ext. et Jour/Nuit", `${s.scenes} scènes : ${s.int} INT., ${s.ext} EXT., ${s.day} jour (dont ${s.inheritedDay} repris), ${s.night} nuit (dont ${s.inheritedNight} repris), ${s.otherMoment} autre moment.`);
  }
  const cast = script ? (sp ? screenplayCast(sp.elements, src.cards, src.lang) : { people: [], scenes: [] }) : novelCast(src.manuscript, src.order, src.cards);
  const duo = topDuo(cast.people);
  const top = castForMatrix(cast.people, 12, src.lang);
  const never = neverMeet(top);
  out.push("", "## Qui croise qui");
  if (duo) out.push(`Duo le plus présent : ${duo.a.name} et ${duo.b.name} (${duo.scenes.length} scènes).`);
  if (never.length) out.push(`Ne se croisent jamais : ${never.slice(0, 15).map((p) => `${p.a.name} et ${p.b.name}`).join(" ; ")}.`);
  return ok(out.join("\n"));
}

function review(src: LiveSource, t: Messages): McpAnswer {
  const sp = src.screenplay;
  const found: Finding[] =
    src.kind === "scenario" ? (sp ? checkScreenplay(sp.elements, LAYOUTS[src.paper], src.cards, src.lang) : []) : checkManuscript(src.manuscript, src.order, src.cards, src.lang);
  const story = checkStory(src.cards, characterRows(src), src.kind, src.pitch);
  const all = [...story, ...found];
  if (all.length === 0) return ok("Rien à signaler dans « Vérifier ».");
  const rules = t.review.rules as Record<string, string>;
  const byRule = new Map<string, Finding[]>();
  for (const f of all) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
  const out: string[] = [];
  for (const [rule, list] of byRule) {
    out.push(`## ${rules[rule] ?? rule} (${list.length})`);
    for (const f of list.slice(0, 25)) {
      const where = f.sceneId ? sceneName(src, f.sceneId) : f.scene ? `scène ${f.scene}` : "";
      const names = f.names?.length ? ` [${f.names.join(" / ")}]` : "";
      out.push(`- ${where}${names}${f.text ? ` : ${f.text.replace(/\s+/g, " ").slice(0, 200)}` : ""}`);
    }
    if (list.length > 25) out.push(`- … et ${list.length - 25} de plus`);
    out.push("");
  }
  return ok(out.join("\n").trim());
}

async function sceneVersions(src: LiveSource, a: Record<string, unknown>): Promise<McpAnswer> {
  const scene = findScene(src, str(a.scene));
  if (!scene || scene.id.startsWith("@")) return fail(`Scène introuvable : « ${str(a.scene)} ».`);
  const files = await src.readVersions(scene.id);
  const list = Object.entries(files)
    .flatMap(([name, raw]) => {
      const v = readVersionFile(name, raw);
      return v ? [v] : [];
    })
    .sort((x, y) => y.name.localeCompare(x.name));
  if (list.length === 0) return ok(`Aucune version gardée pour la scène ${scene.n}.`);
  const wanted = str(a.version);
  if (!wanted) return ok([`Versions de la scène ${scene.n} « ${scene.title} », de la plus récente à la plus ancienne :`, ...list.map((v, i) => `${i + 1}. \`${v.name}\` ${v.date.slice(0, 16).replace("T", " ")}${v.title ? ` « ${v.title} »` : ""}, ${v.words} mots`)].join("\n"));
  const version = /^\d+$/.test(wanted) ? list[Number(wanted) - 1] : list.find((v) => v.name === wanted || v.name === `${wanted}.md`);
  if (!version) return fail(`Version introuvable : « ${wanted} ».`);
  return ok(`Version \`${version.name}\`${version.title ? ` « ${version.title} »` : ""} (${version.words} mots) :\n\n${version.text}`);
}

function readJournal(src: LiveSource): McpAnswer {
  const lines = src.journal.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return ok("Le journal de l'IA est vide.");
  return ok(lines.slice(-80).join("\n"));
}

/** Répond à une lecture faite par l'app ouverte. */
export async function answerLive(req: McpRequest, src: LiveSource, t: Messages): Promise<McpAnswer> {
  const a = req.args ?? {};
  switch (req.tool) {
    case "todo_list":
      return todoList(src);
    case "read_comments":
      return readComments(src, a);
    case "project_stats":
      return projectStats(src);
    case "review":
      return review(src, t);
    case "scene_versions":
      return sceneVersions(src, a);
    case "read_journal":
      return readJournal(src);
  }
  return fail(`Outil inconnu : ${req.tool}`);
}
