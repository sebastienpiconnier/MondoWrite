// Plan d'un roman : les cartes Scène rangées dans les cases d'un gabarit (trois actes, Save the Cat,
// voyage du héros) ou dans une simple liste ordonnée. Fonctions pures.
//
// Le plan ne contient que des identifiants de cartes : le titre et le texte d'une scène restent
// dans sa carte. Dans cosmos.json (champ `plan`, facultatif) :
//   { "template": "troisActes", "beats": { "a_setup": ["k3x9a7bq2m", …], … } }
// Les clés des cases sont propres à chaque gabarit : changer de gabarit ne perd donc aucun rangement,
// celui du gabarit précédent reste dans le fichier et revient si l'on y retourne.
//
// Chapitres (facultatif) : `"chapters": [{ "id": "…", "title": "Le retour", "scenes": ["k3x9a7bq2m", …] }]`.
// Un chapitre regroupe des scènes ; son numéro vient de sa place dans le récit (ordre du plan), il n'est
// jamais écrit. Les chapitres ne dépendent pas du gabarit : on peut en changer sans rien perdre.

export type PlanTemplate = "libre" | "troisActes" | "saveTheCat" | "voyageHeros" | "huitSequences" | "episode";

/** Cases de chaque gabarit, dans l'ordre du récit. Ces clés sont écrites dans le fichier : ne jamais les renommer. */
export const PLAN_TEMPLATES = {
  libre: ["libre"],
  troisActes: ["a_setup", "a_incident", "a_confrontation", "a_midpoint", "a_crisis", "a_climax", "a_resolution"],
  saveTheCat: [
    "c_opening", "c_theme", "c_setup", "c_catalyst", "c_debate", "c_act2", "c_bstory", "c_fun",
    "c_midpoint", "c_badguys", "c_lost", "c_darknight", "c_act3", "c_finale", "c_final",
  ],
  voyageHeros: [
    "h_ordinary", "h_call", "h_refusal", "h_mentor", "h_threshold", "h_tests",
    "h_approach", "h_ordeal", "h_reward", "h_road", "h_resurrection", "h_return",
  ],
  // Gabarits de scénario (séquencier, voir screenplay/template.ts).
  huitSequences: ["q_1", "q_2", "q_3", "q_4", "q_5", "q_6", "q_7", "q_8"],
  episode: ["e_teaser", "e_act1", "e_act2", "e_act3", "e_act4", "e_tag"],
} as const satisfies Record<PlanTemplate, readonly string[]>;

export type PlanBeat = (typeof PLAN_TEMPLATES)[PlanTemplate][number];
const ALL_BEATS = new Set<string>(Object.values(PLAN_TEMPLATES).flat());
export const isBeat = (key: string): key is PlanBeat => ALL_BEATS.has(key);

export const PLAN_TEMPLATE_KEYS = Object.keys(PLAN_TEMPLATES) as PlanTemplate[];
/** Gabarits proposés pour un roman, dans l'ordre du menu. */
export const NOVEL_TEMPLATES = ["libre", "troisActes", "saveTheCat", "voyageHeros"] as const satisfies readonly PlanTemplate[];
export const isPlanTemplate = (v: unknown): v is PlanTemplate => typeof v === "string" && v in PLAN_TEMPLATES;

export interface Chapter {
  id: string;
  /** Titre libre ; vide : le chapitre n'a que son numéro. */
  title: string;
  /** Scènes du chapitre. L'ordre de lecture reste celui du plan. */
  scenes: string[];
}

export interface Plan {
  template: PlanTemplate;
  /** Scènes de chaque case, dans l'ordre. Peut contenir les cases d'autres gabarits. */
  beats: Record<string, string[]>;
  /** Chapitres. Absent : aucun. */
  chapters?: Chapter[];
}

export const EMPTY_PLAN: Plan = { template: "libre", beats: {} };

/** Plan lu dans cosmos.json : tout ce qui n'a pas la bonne forme est ignoré. */
export function readPlan(raw: unknown): Plan {
  if (!raw || typeof raw !== "object") return EMPTY_PLAN;
  const { template, beats } = raw as { template?: unknown; beats?: unknown };
  const clean: Record<string, string[]> = {};
  if (beats && typeof beats === "object" && !Array.isArray(beats)) {
    for (const [key, ids] of Object.entries(beats)) {
      if (!Array.isArray(ids)) continue;
      const list = [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))];
      if (list.length > 0) clean[key] = list;
    }
  }
  const chapters = readChapters((raw as { chapters?: unknown }).chapters);
  const next: Plan = { template: isPlanTemplate(template) ? template : "libre", beats: clean, ...(chapters.length > 0 ? { chapters } : {}) };
  return isEmptyPlan(next) ? EMPTY_PLAN : next;
}

/** Chapitres lus dans cosmos.json : une scène n'appartient qu'à un chapitre (le premier qui la cite). */
function readChapters(raw: unknown): Chapter[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  const out: Chapter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, title, scenes } = item as { id?: unknown; title?: unknown; scenes?: unknown };
    if (typeof id !== "string" || !id || ids.has(id)) continue;
    ids.add(id);
    const list = Array.isArray(scenes) ? scenes.filter((s): s is string => typeof s === "string" && s !== "" && !seen.has(s) && !!seen.add(s)) : [];
    out.push({ id, title: typeof title === "string" ? title : "", scenes: list });
  }
  return out;
}

/** Rien à écrire dans le fichier : gabarit par défaut, aucune scène rangée, aucun chapitre. */
export const isEmptyPlan = (plan: Plan) =>
  plan.template === "libre" && Object.values(plan.beats).every((ids) => ids.length === 0) && (plan.chapters ?? []).length === 0;

/**
 * Plan à écrire : sans les cartes qui n'existent plus, ni les cases vides, ni les chapitres vides et
 * sans titre. Même objet si rien ne change.
 */
export function prunePlan(plan: Plan, existing: Set<string>): Plan {
  let changed = false;
  const beats: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(plan.beats)) {
    const kept = ids.filter((id) => existing.has(id));
    if (kept.length !== ids.length || kept.length === 0) changed = true;
    if (kept.length > 0) beats[key] = kept;
  }
  let chapters = plan.chapters;
  if (chapters) {
    const next = chapters
      .map((c) => {
        const scenes = c.scenes.filter((id) => existing.has(id));
        return scenes.length === c.scenes.length ? c : { ...c, scenes };
      })
      .filter((c) => c.scenes.length > 0 || c.title.trim() !== "");
    if (next.length !== chapters.length || next.some((c, i) => c !== chapters![i])) {
      changed = true;
      chapters = next;
    }
  }
  if (!changed) return plan;
  const { chapters: _old, ...rest } = plan;
  return { ...rest, beats, ...(chapters && chapters.length > 0 ? { chapters } : {}) };
}

export interface Arranged {
  /** Cases du gabarit courant, avec leurs scènes. */
  beats: { key: string; ids: string[] }[];
  /** Scènes pas encore rangées, dans l'ordre reçu. */
  unplaced: string[];
}

/**
 * Lecture du plan pour le gabarit courant. `sceneIds` : les cartes Scène du projet, dans un ordre
 * par défaut (celui du canevas). Une scène n'apparaît qu'une fois ; une carte qui n'est plus une
 * scène n'apparaît pas. Plan libre : une seule liste, où les scènes pas encore rangées viennent à la suite.
 */
export function arrange(plan: Plan, sceneIds: string[]): Arranged {
  const scenes = new Set(sceneIds);
  const seen = new Set<string>();
  const beats = PLAN_TEMPLATES[plan.template].map((key) => ({
    key,
    ids: (plan.beats[key] ?? []).filter((id) => scenes.has(id) && !seen.has(id) && !!seen.add(id)),
  }));
  const unplaced = sceneIds.filter((id) => !seen.has(id));
  if (plan.template === "libre") return { beats: [{ key: "libre", ids: [...beats[0].ids, ...unplaced] }], unplaced: [] };
  return { beats, unplaced };
}

/** Les scènes dans l'ordre du récit : cases du gabarit, puis scènes pas encore rangées. */
export function planOrder(plan: Plan, sceneIds: string[]): string[] {
  const { beats, unplaced } = arrange(plan, sceneIds);
  return [...beats.flatMap((b) => b.ids), ...unplaced];
}

/** Réécrit les cases du gabarit courant ; celles des autres gabarits ne bougent pas. */
function withBeats(plan: Plan, beats: Arranged["beats"]): Plan {
  const next = { ...plan.beats };
  for (const { key, ids } of beats) {
    if (ids.length > 0) next[key] = ids;
    else delete next[key];
  }
  return { ...plan, beats: next };
}

/**
 * Range une scène dans une case (à la fin, ou à la position donnée), ou la sort du plan (`beat` null).
 * Même objet si rien ne change.
 */
export function placeScene(plan: Plan, sceneIds: string[], id: string, beat: string | null, index?: number): Plan {
  if (!sceneIds.includes(id)) return plan;
  const current = arrange(plan, sceneIds);
  if (beat !== null && !current.beats.some((b) => b.key === beat)) return plan;
  // Plan libre : pas de « à placer », toutes les scènes sont dans la liste.
  if (beat === null && plan.template === "libre") return plan;
  const from = current.beats.find((b) => b.ids.includes(id));
  const fromIndex = from ? from.ids.indexOf(id) : -1;
  const beats = current.beats.map((b) => ({ key: b.key, ids: b.ids.filter((x) => x !== id) }));
  if (beat !== null) {
    const target = beats.find((b) => b.key === beat)!;
    const same = from?.key === beat;
    // La position visée se lit dans la liste d'avant, qui comptait encore la scène si elle était déjà dans la case.
    let at = index === undefined ? target.ids.length : Math.max(0, Math.min(index, target.ids.length + (same ? 1 : 0)));
    if (same && index !== undefined && fromIndex < at) at -= 1;
    if (from?.key === beat && at === fromIndex) return plan;
    target.ids.splice(at, 0, id);
  } else if (!from) {
    return plan;
  }
  return withBeats(plan, beats);
}

/**
 * Monte ou descend une scène d'un cran dans le récit. Au bord d'une case, elle passe dans la case
 * voisine (à la fin de la précédente, au début de la suivante). Même objet si elle ne peut pas bouger.
 */
export function stepScene(plan: Plan, sceneIds: string[], id: string, way: "up" | "down"): Plan {
  const { beats } = arrange(plan, sceneIds);
  const b = beats.findIndex((beat) => beat.ids.includes(id));
  if (b < 0) return plan;
  const i = beats[b].ids.indexOf(id);
  if (way === "up") {
    if (i > 0) return placeScene(plan, sceneIds, id, beats[b].key, i - 1);
    return b > 0 ? placeScene(plan, sceneIds, id, beats[b - 1].key) : plan;
  }
  if (i < beats[b].ids.length - 1) return placeScene(plan, sceneIds, id, beats[b].key, i + 2);
  return b < beats.length - 1 ? placeScene(plan, sceneIds, id, beats[b + 1].key, 0) : plan;
}

/** Change de gabarit. Les rangements de l'ancien restent dans le plan. */
export const setTemplate = (plan: Plan, template: PlanTemplate): Plan => (plan.template === template ? plan : { ...plan, template });

// ---------- Chapitres ----------

/** Chapitre d'une scène, ou null. */
export const chapterOf = (plan: Plan, sceneId: string): Chapter | null => plan.chapters?.find((c) => c.scenes.includes(sceneId)) ?? null;

/**
 * Numéro de chaque chapitre : sa place dans le récit, d'après sa première scène dans `order`.
 * Les chapitres encore vides suivent, dans l'ordre de la liste.
 */
export function chapterNumbers(plan: Plan, order: string[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const id of order) {
    const chapter = chapterOf(plan, id);
    if (chapter && !numbers.has(chapter.id)) numbers.set(chapter.id, numbers.size + 1);
  }
  for (const c of plan.chapters ?? []) if (!numbers.has(c.id)) numbers.set(c.id, numbers.size + 1);
  return numbers;
}

export interface ChapterGroup {
  /** null : scènes qui ne sont dans aucun chapitre. */
  chapter: Chapter | null;
  ids: string[];
}

/** Découpe une suite de scènes en groupes consécutifs du même chapitre. */
export function groupByChapter(plan: Plan, ids: string[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const id of ids) {
    const chapter = chapterOf(plan, id);
    const last = groups[groups.length - 1];
    if (last && last.chapter?.id === chapter?.id) last.ids.push(id);
    else groups.push({ chapter, ids: [id] });
  }
  return groups;
}

/** Plan avec ces chapitres (aucun : le champ disparaît). */
function withChapters(plan: Plan, chapters: Chapter[]): Plan {
  const { chapters: _old, ...rest } = plan;
  return chapters.length > 0 ? { ...rest, chapters } : rest;
}

/** Range une scène dans un chapitre, ou l'en sort (`chapterId` null). Même objet si rien ne change. */
export function assignChapter(plan: Plan, sceneId: string, chapterId: string | null): Plan {
  const current = chapterOf(plan, sceneId);
  if ((current?.id ?? null) === chapterId) return plan;
  if (chapterId !== null && !plan.chapters?.some((c) => c.id === chapterId)) return plan;
  return withChapters(
    plan,
    (plan.chapters ?? []).map((c) => {
      if (c.id === chapterId) return { ...c, scenes: [...c.scenes, sceneId] };
      if (c.id === current?.id) return { ...c, scenes: c.scenes.filter((s) => s !== sceneId) };
      return c;
    }),
  );
}

/**
 * Nouveau chapitre qui commence à cette scène : elle et les scènes qui la suivent dans `order`, tant
 * qu'elles étaient dans le même chapitre qu'elle (ou dans aucun), passent dans le nouveau chapitre.
 * C'est le geste « couper ici » : le chapitre d'avant s'arrête juste avant cette scène.
 */
export function startChapter(plan: Plan, order: string[], sceneId: string, id: string, title = ""): Plan {
  const at = order.indexOf(sceneId);
  if (at < 0 || plan.chapters?.some((c) => c.id === id)) return plan;
  const from = chapterOf(plan, sceneId)?.id ?? null;
  const moved: string[] = [];
  for (let i = at; i < order.length; i++) {
    if ((chapterOf(plan, order[i])?.id ?? null) !== from) break;
    moved.push(order[i]);
  }
  const taken = new Set(moved);
  const chapters = (plan.chapters ?? []).map((c) => (c.id === from ? { ...c, scenes: c.scenes.filter((s) => !taken.has(s)) } : c));
  // Le nouveau chapitre se place juste après celui qu'il coupe (l'ordre de la liste départage les chapitres vides).
  const index = from ? chapters.findIndex((c) => c.id === from) + 1 : chapters.length;
  chapters.splice(index, 0, { id, title, scenes: moved });
  return withChapters(plan, chapters);
}

/** Change le titre d'un chapitre. Même objet si rien ne change. */
export function renameChapter(plan: Plan, id: string, title: string): Plan {
  const chapter = plan.chapters?.find((c) => c.id === id);
  if (!chapter || chapter.title === title) return plan;
  return withChapters(plan, plan.chapters!.map((c) => (c.id === id ? { ...c, title } : c)));
}

/**
 * Supprime un chapitre (jamais ses scènes) : elles rejoignent le chapitre qui le précède dans le récit,
 * ou aucun chapitre s'il était le premier.
 */
export function removeChapter(plan: Plan, order: string[], id: string): Plan {
  const chapter = plan.chapters?.find((c) => c.id === id);
  if (!chapter) return plan;
  const first = order.findIndex((s) => chapter.scenes.includes(s));
  let previous: Chapter | null = null;
  for (let i = first - 1; i >= 0 && first > 0; i--) {
    const c = chapterOf(plan, order[i]);
    if (c && c.id !== id) {
      previous = c;
      break;
    }
  }
  return withChapters(
    plan,
    plan.chapters!.filter((c) => c.id !== id).map((c) => (c.id === previous?.id ? { ...c, scenes: [...c.scenes, ...chapter.scenes] } : c)),
  );
}

/**
 * Déplace un chapitre entier (toutes ses scènes, dans leur ordre) juste avant la scène `before`, ou à la
 * fin du récit (`before` null). Avec un gabarit, les scènes déplacées prennent la case de leur nouvelle
 * voisine (celle d'avant, sinon celle d'après) : le récit se lit dans le nouvel ordre. Même objet si
 * rien ne change.
 */
export function moveChapter(plan: Plan, sceneIds: string[], id: string, before: string | null): Plan {
  const chapter = plan.chapters?.find((c) => c.id === id);
  if (!chapter) return plan;
  const { beats, unplaced } = arrange(plan, sceneIds);
  const entries: { id: string; beat: string | null }[] = [...beats.flatMap((b) => b.ids.map((x) => ({ id: x, beat: b.key }))), ...unplaced.map((x) => ({ id: x, beat: null }))];
  const inChapter = new Set(chapter.scenes);
  const moved = entries.filter((e) => inChapter.has(e.id));
  if (moved.length === 0 || (before !== null && inChapter.has(before))) return plan;
  const rest = entries.filter((e) => !inChapter.has(e.id));
  const at = before === null ? rest.length : rest.findIndex((e) => e.id === before);
  if (at < 0) return plan;
  const beat = (rest[at - 1] ?? rest[at])?.beat ?? (plan.template === "libre" ? "libre" : null);
  const next = [...rest.slice(0, at), ...moved.map((e) => ({ ...e, beat })), ...rest.slice(at)];
  if (next.every((e, i) => e.id === entries[i].id && e.beat === entries[i].beat)) return plan;
  return withBeats(
    plan,
    beats.map((b) => ({ key: b.key, ids: next.filter((e) => e.beat === b.key).map((e) => e.id) })),
  );
}

/** Chapitre précédent ou suivant dans le récit : la scène avant laquelle le poser (null : à la fin). Undefined : il ne peut pas bouger. */
export function chapterStep(plan: Plan, order: string[], id: string, way: "up" | "down"): string | null | undefined {
  const groups = groupByChapter(plan, order);
  const i = groups.findIndex((g) => g.chapter?.id === id);
  if (i < 0) return undefined;
  if (way === "up") return i > 0 ? groups[i - 1].ids[0] : undefined;
  if (i >= groups.length - 1) return undefined;
  return groups[i + 2]?.ids[0] ?? null;
}

/**
 * Déplace une scène juste avant ou juste après une autre (`target`) : dans le volet du manuscrit. Elle prend
 * la case du gabarit et le chapitre de `target`, pour se lire à sa nouvelle place. Une scène posée près d'une
 * scène pas encore rangée devient « à placer » (dont l'ordre suit le canevas). Même objet si rien ne change.
 */
export function moveSceneTo(plan: Plan, sceneIds: string[], id: string, target: string, side: "before" | "after"): Plan {
  if (id === target || !sceneIds.includes(id) || !sceneIds.includes(target)) return plan;
  const { beats, unplaced } = arrange(plan, sceneIds);
  const entries: { id: string; beat: string | null }[] = [...beats.flatMap((b) => b.ids.map((x) => ({ id: x, beat: b.key }))), ...unplaced.map((x) => ({ id: x, beat: null }))];
  const rest = entries.filter((e) => e.id !== id);
  const ti = rest.findIndex((e) => e.id === target);
  const beat = rest[ti].beat;
  const at = side === "before" ? ti : ti + 1;
  const next = [...rest.slice(0, at), { id, beat }, ...rest.slice(at)];
  const same = next.every((e, i) => e.id === entries[i].id && e.beat === entries[i].beat);
  const moved = same ? plan : withBeats(plan, beats.map((b) => ({ key: b.key, ids: next.filter((e) => e.beat === b.key).map((e) => e.id) })));
  return assignChapter(moved, id, chapterOf(plan, target)?.id ?? null);
}

/**
 * Un cran plus haut ou plus bas dans le récit, pour le volet du manuscrit (flèches, Alt + flèche). Au bord
 * d'un chapitre, la scène change d'abord de chapitre sans changer de place ; ensuite elle passe la voisine.
 * Même objet si elle ne peut pas bouger.
 */
export function stepSceneInBook(plan: Plan, sceneIds: string[], id: string, way: "up" | "down"): Plan {
  const order = planOrder(plan, sceneIds);
  const i = order.indexOf(id);
  const other = order[way === "up" ? i - 1 : i + 1];
  if (i < 0 || other === undefined) return plan;
  const mine = chapterOf(plan, id)?.id ?? null;
  const theirs = chapterOf(plan, other)?.id ?? null;
  if (mine !== theirs) return assignChapter(plan, id, theirs);
  return moveSceneTo(plan, sceneIds, id, other, way === "up" ? "before" : "after");
}
