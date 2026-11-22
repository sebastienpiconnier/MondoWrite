// Préparer et payer (#119) : un fil entre deux cartes Scène peut dire que l'une prépare l'autre (le fusil posé,
// puis le fusil qui sert). Si, dans l'ordre du récit, la scène qui paie arrive avant celle qui la prépare,
// « Vérifier » le signale : MondoWrite n'empêche jamais un déplacement. Fonctions pures.
//
// Dans cosmos.json, un bloc facultatif, à part des fils comme `wires` (une version d'avant réécrit les fils avec
// leurs seules clés connues, mais garde ce bloc tel quel comme clé inconnue) :
//   "setups": { "<id du fil>": "<id de la scène qui prépare>" }
// Le sens ne dépend pas du sens dans lequel le fil a été tiré.

/** Le fil vu par ces fonctions : ses deux bouts, et la scène qui prépare (dans `data.setup`). */
export interface SetupEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
}

/** Scène qui prépare, si elle est bien l'un des deux bouts du fil. */
export function setupOf(edge: SetupEdge): string | null {
  const id = edge.data?.setup;
  return typeof id === "string" && (id === edge.source || id === edge.target) ? id : null;
}

/** Scène qui paie : l'autre bout du fil. */
export function payoffOf(edge: SetupEdge): string | null {
  const setup = setupOf(edge);
  return setup === null ? null : setup === edge.source ? edge.target : edge.source;
}

/** Bloc lu dans cosmos.json, pour les fils qui existent encore et dont la scène est bien l'un des bouts. */
export function readSetups(raw: unknown, links: readonly { id: string; source: string; target: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const byId = new Map(links.map((l) => [l.id, l]));
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const link = byId.get(id);
    if (link && typeof value === "string" && (value === link.source || value === link.target)) out.set(id, value);
  }
  return out;
}

/** Bloc `setups` à écrire, ou undefined quand aucun fil ne prépare rien. */
export function setupsToMeta(edges: readonly SetupEdge[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const e of edges) {
    const setup = setupOf(e);
    if (setup) out[e.id] = setup;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Un fil dont la scène qui paie arrive avant celle qui prépare, dans l'ordre du récit. */
export interface SetupProblem {
  linkId: string;
  setup: string;
  payoff: string;
  /** Rangs des deux scènes dans l'ordre du récit (à partir de 1). */
  setupRank: number;
  payoffRank: number;
}

/** Fils à l'envers dans `order` (scènes du récit). Une scène hors du récit (à placer) n'est jamais signalée. */
export function setupProblems(edges: readonly SetupEdge[], order: readonly string[]): SetupProblem[] {
  const rank = new Map(order.map((id, i) => [id, i + 1]));
  const out: SetupProblem[] = [];
  for (const e of edges) {
    const setup = setupOf(e);
    const payoff = payoffOf(e);
    if (!setup || !payoff) continue;
    const a = rank.get(setup);
    const b = rank.get(payoff);
    if (a !== undefined && b !== undefined && b < a) out.push({ linkId: e.id, setup, payoff, setupRank: a, payoffRank: b });
  }
  return out.sort((x, y) => x.payoffRank - y.payoffRank);
}

/** Ce qu'une scène prépare et ce qui la prépare (identifiants des autres scènes, dans l'ordre des fils). */
export interface SceneSetups {
  prepares: string[];
  paidBy: string[];
}

const NO_SETUPS: SceneSetups = { prepares: [], paidBy: [] };
const setupCache = new WeakMap<readonly SetupEdge[], Map<string, SceneSetups>>();

/** Préparations de chaque scène, calculées une fois par tableau de fils (lu par chaque carte du canevas). */
export function setupsByScene(edges: readonly SetupEdge[]): Map<string, SceneSetups> {
  const known = setupCache.get(edges);
  if (known) return known;
  const out = new Map<string, SceneSetups>();
  const entry = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { prepares: [], paidBy: [] }));
    return s;
  };
  for (const e of edges) {
    const setup = setupOf(e);
    const payoff = payoffOf(e);
    if (!setup || !payoff) continue;
    entry(setup).prepares.push(payoff);
    entry(payoff).paidBy.push(setup);
  }
  setupCache.set(edges, out);
  return out;
}

/** Préparations d'une scène (jamais undefined). */
export const setupsOf = (edges: readonly SetupEdge[], id: string): SceneSetups => setupsByScene(edges).get(id) ?? NO_SETUPS;

/** Scènes reliées par au moins une préparation. */
export function setupScenes(edges: readonly SetupEdge[]): Set<string> {
  return new Set(setupsByScene(edges).keys());
}

/** La scène et celles qu'elle prépare ou qui la préparent : ce qui reste net quand on la met en avant. */
export function setupCircle(edges: readonly SetupEdge[], id: string): Set<string> {
  const s = setupsOf(edges, id);
  return new Set([id, ...s.prepares, ...s.paidBy]);
}

/** Lettre d'une paire : A à Z, puis AA, AB… (pur). */
export function setupLetter(n: number): string {
  let s = "";
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
}

/**
 * Lettre de chaque préparation (identifiant du fil → « A », « B »…), pour reconnaître les paires : « Prépare A » sur
 * une scène, « Paie A » sur l'autre. Dans l'ordre du récit de la scène qui prépare, puis de celle qui paie ; une
 * scène hors du récit passe après, le fil départage. Affichage seulement, jamais écrit (pur).
 */
export function setupLetters(edges: readonly SetupEdge[], order: readonly string[]): Map<string, string> {
  const rank = new Map(order.map((id, i) => [id, i]));
  const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  const pairs = edges
    .map((e) => ({ id: e.id, setup: setupOf(e), payoff: payoffOf(e) }))
    .filter((p): p is { id: string; setup: string; payoff: string } => p.setup !== null && p.payoff !== null)
    .sort((a, b) => at(a.setup) - at(b.setup) || at(a.payoff) - at(b.payoff) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Map(pairs.map((p, i) => [p.id, setupLetter(i)]));
}

/** Lettres que porte chaque scène : celles qu'elle prépare, celles qu'elle paie (pur). */
export function sceneLetters(edges: readonly SetupEdge[], letters: ReadonlyMap<string, string>): Map<string, { prepares: string[]; pays: string[] }> {
  const out = new Map<string, { prepares: string[]; pays: string[] }>();
  const entry = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { prepares: [], pays: [] }));
    return s;
  };
  const byLetter = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
  for (const e of edges) {
    const letter = letters.get(e.id);
    const setup = setupOf(e);
    const payoff = payoffOf(e);
    if (!letter || !setup || !payoff) continue;
    entry(setup).prepares.push(letter);
    entry(payoff).pays.push(letter);
  }
  for (const s of out.values()) {
    s.prepares.sort(byLetter);
    s.pays.sort(byLetter);
  }
  return out;
}
