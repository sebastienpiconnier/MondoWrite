// Choix d'un roman interactif (lot 2, docs/plan-roman-interactif.md) : fonctions pures, testées.
//
// Sur disque, les choix d'une scène sont un bloc de code Markdown en fin de son fichier du manuscrit :
//
//   ```choix
//   * [Pousser la grille] -> la_cour
//   * { cle_trouvee } [Ouvrir la porte de service] -> les_cuisines
//   * [Rentrer] -> END
//   ```
//
// C'est un sous-ensemble de la syntaxe Ink : un choix `*`, une condition facultative `{ }`, le libellé entre crochets,
// la destination après `->`. Une ligne qui commence par `~` sous un choix est un de ses effets (lot 4 : `~ cle = true`,
// le lecteur acquiert un fait ; `~ pieces += 1`, un compteur). Une destination est le nom d'une scène tiré de son titre (`sceneSlugs`), ou `END` pour
// une fin. Une ligne qui ne se lit pas comme un choix est gardée telle quelle, jamais perdue.
//
// En mémoire (HTML de l'éditeur et du store), le bloc est `<pre data-choices="true">texte</pre>`.

/** Langue du bloc de code Markdown : jamais traduite (contrat de format). */
export const CHOICES_LANG = "choix";
/** Destination d'une fin, comme dans Ink. */
export const END_TARGET = "END";

export interface Choice {
  kind: "choice";
  label: string;
  target: string;
  /** Condition Ink, sans les accolades (lot 4). */
  cond?: string;
  /** Effets du choix (lot 4) : affectations Ink sans le `~` (`cle = true`, `pieces += 1`), une par ligne. */
  effects?: string[];
}
export interface RawLine {
  kind: "raw";
  text: string;
}
export type ChoiceLine = Choice | RawLine;

const CHOICE_RE = /^\*\s*(?:\{\s*([^}]*?)\s*\}\s*)?\[([^\]]*)\]\s*->\s*([\p{L}\p{N}_]+)\s*$/u;

/** Libellé d'un choix : une ligne, sans crochets (ils fermeraient le libellé), au plus 200 caractères. */
export function cleanLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\r\n\t]+/g, " ").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Lit le texte d'un bloc : une ligne par choix, les autres gardées telles quelles. */
export function parseChoices(text: string): ChoiceLine[] {
  const lines: ChoiceLine[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = CHOICE_RE.exec(trimmed);
    const last = lines[lines.length - 1];
    if (m) lines.push({ kind: "choice", label: m[2].trim(), target: m[3], ...(m[1] ? { cond: m[1] } : {}) });
    else if (trimmed.startsWith("~") && last?.kind === "choice" && trimmed.slice(1).trim()) {
      last.effects = [...(last.effects ?? []), trimmed.slice(1).trim()];
    } else lines.push({ kind: "raw", text: trimmed });
  }
  return lines;
}

/** Écrit un choix sur une ligne. */
export function choiceLine(c: Omit<Choice, "kind">): string {
  const cond = c.cond?.trim() ? `{ ${c.cond.trim()} } ` : "";
  const head = `* ${cond}[${cleanLabel(c.label)}] -> ${c.target}`;
  const effects = (c.effects ?? []).map(cleanEffect).filter(Boolean);
  return effects.length ? [head, ...effects.map((e) => `  ~ ${e}`)].join("\n") : head;
}

/** Effet d'un choix : une ligne, sans le `~` de tête. */
export const cleanEffect = (raw: string) => raw.replace(/[\r\n]+/g, " ").replace(/^\s*~\s*/, "").trim().slice(0, 200);

export function serializeChoices(lines: readonly ChoiceLine[]): string {
  return lines.map((l) => (l.kind === "raw" ? l.text : choiceLine(l))).join("\n");
}

// ---------- Noms des scènes ----------

/** Nom d'une scène tiré de son titre : minuscules, sans accents, `_` entre les mots ; jamais vide ni commençant par un chiffre. */
export function slugOf(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "_")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .replace(/_+$/, "");
  if (!base) return "scene";
  return /^\p{N}/u.test(base) ? `scene_${base}` : base;
}

export interface SceneRef {
  id: string;
  title: string;
}

/**
 * Nom de chaque scène, unique dans le projet et indépendant de l'ordre : deux scènes au même titre reçoivent chacune
 * la fin de leur identifiant (`la_cour_k3x9`). Ajouter, déplacer ou retirer une autre scène ne change donc jamais le
 * nom d'une scène, sauf celles dont le titre entre en collision ou en sort (le store fait alors suivre les choix).
 */
export function sceneSlugs(scenes: readonly SceneRef[]): Map<string, string> {
  const groups = new Map<string, SceneRef[]>();
  for (const s of scenes) {
    const base = slugOf(s.title);
    groups.set(base, [...(groups.get(base) ?? []), s]);
  }
  const out = new Map<string, string>();
  for (const [base, members] of groups) {
    if (members.length === 1) {
      out.set(members[0].id, base);
      continue;
    }
    const tag = (s: SceneRef, n: number) => s.id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, n) || "x";
    const short = new Set(members.map((s) => tag(s, 4))).size === members.length;
    for (const s of members) out.set(s.id, `${base}_${tag(s, short ? 4 : 64)}`);
  }
  return out;
}

/** Scène désignée par une destination : son identifiant, `END`, ou null si aucune scène ne porte ce nom. */
export function resolveTarget(target: string, slugs: ReadonlyMap<string, string>): string | null {
  if (target === END_TARGET) return END_TARGET;
  for (const [id, slug] of slugs) if (slug === target) return id;
  return null;
}

// ---------- Le bloc dans le HTML ----------

const BLOCK_RE = /<pre data-choices="true">([\s\S]*?)<\/pre>/g;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescapeHtml = (s: string) =>
  s.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** HTML d'un bloc de choix. */
export const choicesHtml = (text: string) => `<pre data-choices="true">${escapeHtml(text)}</pre>`;

/** Texte des blocs de choix d'une scène (bout à bout s'il y en a plusieurs), ou null s'il n'y en a pas. */
export function choicesTextIn(html: string | undefined): string | null {
  if (!html || !html.includes("data-choices")) return null;
  const parts = [...html.matchAll(BLOCK_RE)].map((m) => unescapeHtml(m[1]));
  return parts.length ? parts.join("\n") : null;
}

/** Choix d'une scène (lignes lues), vide s'il n'y a pas de bloc. */
export const choicesIn = (html: string | undefined): ChoiceLine[] => {
  const text = choicesTextIn(html);
  return text === null ? [] : parseChoices(text);
};

/**
 * Pose les choix d'une scène : le premier bloc est remplacé (les suivants retirés), sinon un bloc est ajouté à la
 * fin. Sans ligne, le bloc est retiré. Rend le même texte quand rien ne change.
 */
export function withChoices(html: string | undefined, lines: readonly ChoiceLine[]): string {
  const current = html ?? "";
  const block = lines.length ? choicesHtml(serializeChoices(lines)) : "";
  if (!current.includes("data-choices")) {
    if (!block) return current;
    // Une scène encore vide reçoit un paragraphe avant ses choix : on peut y écrire.
    return isEmptyHtml(current) ? `<p></p>${block}` : `${current}${block}`;
  }
  let first = true;
  const next = current.replace(BLOCK_RE, () => {
    if (!first) return "";
    first = false;
    return block;
  });
  if (next === current) return current;
  return next === "<p></p>" ? "" : next;
}

/** Texte d'une scène sans son bloc de choix (pour compter ses mots). */
export const withoutChoices = (html: string) => (html.includes("data-choices") ? html.replace(BLOCK_RE, "") : html);

const isEmptyHtml = (html: string) => !html || html === "<p></p>";

// ---------- Le graphe ----------

export interface ChoiceEdge {
  from: string;
  /** Rang du choix parmi ceux de la scène (lignes de choix seulement). */
  index: number;
  label: string;
  target: string;
  /** Scène atteinte, `END`, ou null si la destination ne désigne aucune scène. */
  to: string | null;
  cond?: string;
  effects?: string[];
}

/** Tous les choix du livre, scène par scène, dans l'ordre reçu. */
export function choiceGraph(manuscript: Readonly<Record<string, string>>, scenes: readonly SceneRef[]): ChoiceEdge[] {
  const slugs = sceneSlugs(scenes);
  const edges: ChoiceEdge[] = [];
  for (const s of scenes) {
    let index = 0;
    for (const line of choicesIn(manuscript[s.id])) {
      if (line.kind !== "choice") continue;
      edges.push({
        from: s.id,
        index: index++,
        label: line.label,
        target: line.target,
        to: resolveTarget(line.target, slugs),
        ...(line.cond ? { cond: line.cond } : {}),
        ...(line.effects?.length ? { effects: line.effects } : {}),
      });
    }
  }
  return edges;
}

/**
 * Retire d'une scène les choix sans texte qui mènent à `target` (le « Continuer » posé par une coupure qu'on annule)
 * et range tous ses choix restants dans un seul bloc, en fin de scène : après une fusion, le texte de la scène
 * rejointe et son bloc suivent le bloc de la première. Rend le même texte quand rien ne change.
 */
export function dropContinueTo(html: string | undefined, target: string): string {
  const current = html ?? "";
  if (!current.includes("data-choices")) return current;
  const all = choicesIn(current);
  const kept = all.filter((l) => !(l.kind === "choice" && l.target === target && !l.label));
  if (kept.length === all.length && (current.match(BLOCK_RE) ?? []).length < 2) return current;
  const stripped = current.replace(BLOCK_RE, "");
  return withChoices(stripped, kept);
}

/** La scène finit l'histoire par un renvoi écrit en Ink (`-> END` ou `-> DONE` sur sa ligne), sans bouton à toucher. */
export function endsByDivert(html: string | undefined): boolean {
  return choicesIn(html).some((l) => l.kind === "raw" && /^->\s*(END|DONE)\s*$/.test(l.text.trim()));
}

/** Remplace le choix de rang `index` (parmi les choix) d'une liste de lignes, ou le retire si `next` est null. */
export function editChoice(lines: readonly ChoiceLine[], index: number, next: Omit<Choice, "kind"> | null): ChoiceLine[] {
  let rank = -1;
  const out: ChoiceLine[] = [];
  for (const l of lines) {
    if (l.kind === "choice" && ++rank === index) {
      if (next) {
        const effects = (next.effects ?? []).map(cleanEffect).filter(Boolean);
        out.push({
          kind: "choice",
          label: cleanLabel(next.label),
          target: next.target,
          ...(next.cond?.trim() ? { cond: next.cond.trim() } : {}),
          ...(effects.length ? { effects } : {}),
        });
      }
      continue;
    }
    out.push(l);
  }
  return out;
}

/**
 * Un titre de scène a changé : les destinations qui la désignaient suivent. `before` et `after` sont les noms de
 * toutes les scènes avant et après ; rend le manuscrit (même objet si rien ne change).
 */
export function renameTargets(
  manuscript: Readonly<Record<string, string>>,
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): Record<string, string> {
  const moved = new Map<string, string>();
  for (const [id, slug] of before) {
    const now = after.get(id);
    if (now && now !== slug) moved.set(slug, now);
  }
  if (!moved.size) return manuscript as Record<string, string>;
  let next: Record<string, string> | null = null;
  for (const [id, html] of Object.entries(manuscript)) {
    const lines = choicesIn(html);
    if (!lines.some((l) => l.kind === "choice" && moved.has(l.target))) continue;
    const renamed = lines.map((l) => (l.kind === "choice" && moved.has(l.target) ? { ...l, target: moved.get(l.target)! } : l));
    next ??= { ...manuscript };
    next[id] = withChoices(html, renamed);
  }
  return next ?? (manuscript as Record<string, string>);
}

/**
 * Annulation (store) : les blocs de choix reviennent à ceux de l'étape, le reste du texte de chaque scène n'est jamais
 * touché (il a son propre historique, celui de l'éditeur). Rend le même objet si aucun bloc ne change.
 */
export function choicesAfterUndo(current: Readonly<Record<string, string>>, target: Readonly<Record<string, string>>): Record<string, string> {
  let next: Record<string, string> | null = null;
  for (const id of new Set([...Object.keys(current), ...Object.keys(target)])) {
    const was = choicesTextIn(target[id]);
    const now = choicesTextIn(current[id]);
    if (was === now) continue;
    next ??= { ...current };
    const html = withChoices(current[id], was === null ? [] : parseChoices(was));
    if (html) next[id] = html;
    else delete next[id];
  }
  return next ?? (current as Record<string, string>);
}

// ---------- Le canevas d'un roman interactif ----------

/**
 * Scènes d'un roman interactif rangées en arbre sur le canevas (« Organiser », novembre 2026) : la première en haut,
 * puis une rangée par pas de lecture (la scène la plus courte à atteindre décide), les scènes qu'aucun choix
 * n'atteint sur une dernière rangée. Chaque rangée est centrée. Rend les places (coin haut gauche) et la hauteur.
 * Écarts larges : les étiquettes des choix (pilules de 180 px au plus) tiennent entre les scènes sans se toucher.
 */
export function choiceTree(
  order: readonly string[],
  edges: readonly ChoiceEdge[],
  size: (id: string) => { width: number; height: number },
  origin: { x: number; y: number },
  gap = { x: 140, y: 220 },
): { positions: Map<string, { x: number; y: number }>; height: number; width: number } {
  const positions = new Map<string, { x: number; y: number }>();
  if (order.length === 0) return { positions, height: 0, width: 0 };
  const known = new Set(order);
  const next = new Map<string, string[]>();
  for (const e of edges) if (e.to && e.to !== END_TARGET && e.to !== e.from && known.has(e.to)) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const depth = new Map<string, number>([[order[0], 0]]);
  const queue = [order[0]];
  while (queue.length) {
    const id = queue.shift()!;
    for (const to of next.get(id) ?? []) {
      if (depth.has(to)) continue;
      depth.set(to, depth.get(id)! + 1);
      queue.push(to);
    }
  }
  const rows: string[][] = [];
  // Dans une rangée, l'ordre de découverte (celui des choix) : les branches restent sous leur scène.
  for (const id of [...depth.keys()]) (rows[depth.get(id)!] ??= []).push(id);
  const loose = order.filter((id) => !depth.has(id));
  if (loose.length) rows.push(loose);
  const widths = rows.map((row) => row.reduce((w, id) => w + size(id).width, 0) + gap.x * (row.length - 1));
  const width = Math.max(...widths);
  let y = origin.y;
  rows.forEach((row, i) => {
    let x = origin.x + (width - widths[i]) / 2;
    let tallest = 0;
    for (const id of row) {
      positions.set(id, { x, y });
      x += size(id).width + gap.x;
      tallest = Math.max(tallest, size(id).height);
    }
    y += tallest + gap.y;
  });
  return { positions, height: y - gap.y - origin.y, width };
}
