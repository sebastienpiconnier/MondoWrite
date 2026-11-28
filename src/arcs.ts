// Statistiques › Courbes : l'évolution de chaque personnage en score cumulé. On part de 0 avant la première scène ;
// chaque scène notée « Pour X, la scène finit » ajoute +1 (mieux), 0 (pareil) ou −1 (moins bien) au score de la
// précédente. Une scène qui n'en dit rien laisse le score où il est. Rien n'est enregistré : tout se relit dans les
// fiches des scènes (`fiche.issue`, `fiche.pov`). Les phrases de l'analyse sont des constats et des questions,
// jamais un jugement sur l'histoire (fonctions pures, testées).

import { characterIssues } from "./frise";
import { isArcType, type ArcType } from "./character";

export interface ArcPoint {
  id: string;
  /** Rang de la scène dans le récit (0 pour la première). */
  rank: number;
  /** Score atteint à la fin de la scène. */
  score: number;
  /** Ce que la scène a ajouté : +1, 0, −1, ou null si elle n'est pas notée pour ce personnage. */
  step: 1 | 0 | -1 | null;
}

const STEP: Record<string, 1 | 0 | -1> = { mieux: 1, pareil: 0, pire: -1 };

/** Score cumulé scène après scène, dans l'ordre du récit. */
export function cumulativeArc(order: readonly string[], issues: ReadonlyMap<string, string>): ArcPoint[] {
  let score = 0;
  return order.map((id, rank) => {
    const issue = issues.get(id);
    const step = issue !== undefined && issue in STEP ? STEP[issue] : null;
    if (step !== null) score += step;
    return { id, rank, score, step };
  });
}

export interface ArcRun {
  /** Rang de la première et de la dernière scène de la suite. */
  from: number;
  to: number;
  /** Nombre de scènes notées de suite dans le même sens (les scènes non notées entre elles ne la coupent pas). */
  length: number;
}

export interface ArcSummary {
  answered: number;
  up: number;
  same: number;
  down: number;
  /** Score à la fin du récit. */
  final: number;
  /** Plus haut et plus bas atteints, à leur première scène (départ compris : 0 avant la première scène). */
  peak: { score: number; rank: number | null };
  trough: { score: number; rank: number | null };
  /** Plus longues suites de montées et de descentes (null sous deux). */
  rise: ArcRun | null;
  fall: ArcRun | null;
  /** Première et dernière scène notées. */
  first: number;
  last: number;
}

/** Plus longue suite de scènes notées dans le sens `want`. */
function longestRun(points: readonly ArcPoint[], want: 1 | -1): ArcRun | null {
  let best: ArcRun | null = null;
  let from = -1;
  let length = 0;
  for (const p of points) {
    if (p.step === null) continue;
    if (p.step !== want) {
      length = 0;
      continue;
    }
    if (length === 0) from = p.rank;
    length++;
    if (!best || length > best.length) best = { from, to: p.rank, length };
  }
  return best && best.length >= 2 ? best : null;
}

/** Résumé d'une courbe ; null si aucune scène n'est notée. */
export function arcSummary(points: readonly ArcPoint[]): ArcSummary | null {
  const noted = points.filter((p) => p.step !== null);
  if (noted.length === 0) return null;
  const peak = { score: 0, rank: null as number | null };
  const trough = { score: 0, rank: null as number | null };
  for (const p of noted) {
    if (p.score > peak.score) Object.assign(peak, { score: p.score, rank: p.rank });
    if (p.score < trough.score) Object.assign(trough, { score: p.score, rank: p.rank });
  }
  return {
    answered: noted.length,
    up: noted.filter((p) => p.step === 1).length,
    same: noted.filter((p) => p.step === 0).length,
    down: noted.filter((p) => p.step === -1).length,
    final: points[points.length - 1]?.score ?? 0,
    peak,
    trough,
    rise: longestRun(points, 1),
    fall: longestRun(points, -1),
    first: noted[0].rank,
    last: noted[noted.length - 1].rank,
  };
}

/** Sous ce nombre de scènes notées, la courbe ne dit encore rien : on le dit au lieu de l'analyser. */
export const ARC_MIN_ANSWERS = 3;

/** Écart à partir duquel un arc annoncé « plat » semble pourtant s'éloigner de son départ. */
export const FLAT_DRIFT = 3;

export type ArcNote =
  | { key: "few"; n: number }
  | { key: "end"; final: number; answered: number; up: number; same: number; down: number }
  | { key: "peak"; score: number; rank: number }
  | { key: "trough"; score: number; rank: number }
  | { key: "rise"; run: ArcRun }
  | { key: "fall"; run: ArcRun }
  | { key: "neverDown" }
  | { key: "neverUp" }
  | { key: "lowAtEnd"; score: number; rank: number }
  | { key: "declared"; arc: ArcType; final: number };

/**
 * Lecture d'une courbe, en constats puis en questions : où elle finit, ses extrêmes, ses plus longues suites, et ce
 * qu'elle dit de l'arc annoncé dans la fiche (`arcType`). Une courbe ne mesure pas l'arc intérieur : la question est
 * posée à l'auteur, jamais tranchée.
 */
export function arcNotes(summary: ArcSummary | null, arcType?: string): ArcNote[] {
  if (!summary) return [];
  if (summary.answered < ARC_MIN_ANSWERS) return [{ key: "few", n: summary.answered }];
  const s = summary;
  const out: ArcNote[] = [{ key: "end", final: s.final, answered: s.answered, up: s.up, same: s.same, down: s.down }];
  if (s.peak.rank !== null && s.peak.score > Math.max(0, s.final)) out.push({ key: "peak", score: s.peak.score, rank: s.peak.rank });
  if (s.trough.rank !== null && s.trough.score < Math.min(0, s.final)) out.push({ key: "trough", score: s.trough.score, rank: s.trough.rank });
  if (s.rise) out.push({ key: "rise", run: s.rise });
  if (s.fall) out.push({ key: "fall", run: s.fall });
  // Questions : un personnage à qui rien ne coûte, ou rien ne réussit ; le creux le plus bas tout près de la fin.
  if (s.down === 0 && s.up > 0) out.push({ key: "neverDown" });
  if (s.up === 0 && s.down > 0) out.push({ key: "neverUp" });
  const span = s.last - s.first;
  if (s.trough.rank !== null && span > 0 && s.trough.rank === s.last && s.trough.score < 0) out.push({ key: "lowAtEnd", score: s.trough.score, rank: s.trough.rank });
  if (isArcType(arcType)) {
    const odd = (arcType === "positif" && s.final < 0) || (arcType === "negatif" && s.final > 0) || (arcType === "plat" && Math.abs(s.final) >= FLAT_DRIFT);
    if (odd) out.push({ key: "declared", arc: arcType, final: s.final });
  }
  return out;
}

export interface CharacterArc {
  id: string;
  points: ArcPoint[];
  summary: ArcSummary;
  notes: ArcNote[];
}

/**
 * Courbe de chaque personnage qui a au moins une scène notée : les scènes qu'il raconte (`fiche.pov`) et, pour un
 * personnage principal, aussi les scènes sans point de vue (celles du héros). Les principaux d'abord, puis les plus
 * notés.
 */
export function characterArcs(cards: readonly { id: string; type: string; fiche?: Record<string, string> }[], order: readonly string[]): CharacterArc[] {
  const out: { arc: CharacterArc; principal: boolean }[] = [];
  for (const c of cards) {
    if (c.type !== "personnage") continue;
    const principal = c.fiche?.principal === "oui";
    const points = cumulativeArc(order, characterIssues(cards, c.id, principal));
    const summary = arcSummary(points);
    if (!summary) continue;
    out.push({ arc: { id: c.id, points, summary, notes: arcNotes(summary, c.fiche?.arcType) }, principal });
  }
  out.sort((a, b) => Number(b.principal) - Number(a.principal) || b.arc.summary.answered - a.arc.summary.answered);
  return out.map((x) => x.arc);
}

/** Graduations entières de l'axe vertical : de `lo` à `hi` (zéro compris), au plus `max` repères. */
export function arcTicks(lo: number, hi: number, max = 7): number[] {
  const a = Math.min(0, lo);
  const b = Math.max(0, hi);
  const step = Math.max(1, Math.ceil((b - a) / Math.max(1, max - 1)));
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b; v += step) out.push(v);
  if (!out.includes(0)) out.push(0);
  return out.sort((x, y) => x - y);
}
