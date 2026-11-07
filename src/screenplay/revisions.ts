// Révisions de scénario (docs/plan-revisions-scenario.md, #18). Module pur, sans dépendance à React.
//
// Une passe de révision a un numéro, une couleur (dans l'ordre d'usage américain), une date et un nom
// facultatif. Tant qu'une passe est ouverte, tout élément modifié ou ajouté porte la marque de cette passe :
// une note ` [[cosmos:rev:<n>]]` en fin d'élément dans le Fountain (ignorée par les autres logiciels), un
// attribut `rev` dans le modèle. Les passes sont dans le bloc `revisions` de cosmos.json.
// Les clés de couleur sont écrites dans le fichier : ne jamais les renommer ni les traduire.

import type { Screenplay, ScreenplayElement } from "./model";

/** Couleurs dans l'ordre d'usage des pages de révision (la première version est blanche, sans passe). */
export const REV_COLORS = ["bleu", "rose", "jaune", "vert", "or", "chamois", "saumon", "cerise"] as const;
export type RevColor = (typeof REV_COLORS)[number];
export const isRevColor = (v: unknown): v is RevColor => typeof v === "string" && (REV_COLORS as readonly string[]).includes(v);

/** Éléments qui peuvent porter une marque de révision (le nom d'un personnage ne la porte pas). */
export const REV_TYPES: ReadonlySet<string> = new Set(["sceneHeading", "action", "parenthetical", "dialogue", "transition"]);

/** Plus de passes que de couleurs ×4 : borne de lecture, pas de limite d'usage. */
const MAX_SETS = 99;

export interface RevisionSet {
  /** Numéro de la passe, à partir de 1. */
  n: number;
  color: RevColor;
  /** AAAA-MM-JJ. */
  date: string;
  label: string;
}

/** Une page verrouillée : son libellé, l'élément qui l'ouvre (rang et extrait pour le retrouver). Voir lot 2. */
export interface LockedPage {
  /** « 12 », « 12A », « 13-14 » ; « OMIS » pour une page retirée. */
  label: string;
  /** Rang de l'élément qui ouvre la page, au moment du verrouillage. */
  at: number;
  /** Début du texte de cet élément, pour le retrouver si le rang a bougé. */
  text: string;
  /** Pages qui continuaient la même page verrouillée au verrouillage (réplique coupée) : leurs libellés. */
  more?: string[];
}

export interface Revisions {
  sets: RevisionSet[];
  /** Numéro de la passe ouverte, ou null (aucune marque posée). */
  current: number | null;
  /** Pages verrouillées, ou null : pagination libre. */
  locked: LockedPage[] | null;
}

export const EMPTY_REVISIONS: Revisions = { sets: [], current: null, locked: null };

export const isEmptyRevisions = (r: Revisions) => r.sets.length === 0 && r.current === null && r.locked === null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRevNumber = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 999;

// ---------------------------------------------------------------------------------------------------------
// Note Fountain

export const revNote = (n: number) => `[[cosmos:rev:${n}]]`;
const REV_NOTE_RE = /\s*\[\[cosmos:rev:(\d{1,3})\]\]\s*$/;

/** Note de révision en fin de texte : retirée, son numéro rendu. Une seule marque par élément (la dernière gagne). */
export function readRevNote(text: string): { text: string; rev?: number } {
  const m = REV_NOTE_RE.exec(text);
  if (!m) return { text };
  const n = Number(m[1]);
  return { text: text.slice(0, m.index), ...(isRevNumber(n) ? { rev: n } : {}) };
}

// ---------------------------------------------------------------------------------------------------------
// Bloc `revisions` de cosmos.json

function cleanLocked(raw: unknown): LockedPage[] | null {
  if (!Array.isArray(raw)) return null;
  const pages: LockedPage[] = [];
  for (const p of raw as unknown[]) {
    const o = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    if (typeof o.label !== "string" || o.label.trim() === "" || !Number.isInteger(o.at) || (o.at as number) < 0) continue;
    const more = Array.isArray(o.more) ? (o.more as unknown[]).filter((m): m is string => typeof m === "string" && m.trim() !== "").map((m) => m.trim().slice(0, 12)).slice(0, 8) : [];
    pages.push({ label: o.label.trim().slice(0, 12), at: o.at as number, text: typeof o.text === "string" ? o.text.slice(0, 80) : "", ...(more.length > 0 ? { more } : {}) });
  }
  return pages.length > 0 ? pages : null;
}

/** Bloc relu : valeurs inconnues écartées, passes triées par numéro, passe ouverte inconnue = aucune. */
export function readRevisions(raw: unknown): Revisions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seen = new Set<number>();
  const sets: RevisionSet[] = [];
  if (Array.isArray(o.sets)) {
    for (const s of (o.sets as unknown[]).slice(0, MAX_SETS)) {
      const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      if (!isRevNumber(r.n) || seen.has(r.n)) continue;
      seen.add(r.n);
      sets.push({
        n: r.n,
        color: isRevColor(r.color) ? r.color : colorFor(r.n),
        date: typeof r.date === "string" && DATE_RE.test(r.date) ? r.date : "",
        label: typeof r.label === "string" ? r.label.replace(/\s+/g, " ").trim().slice(0, 80) : "",
      });
    }
  }
  sets.sort((a, b) => a.n - b.n);
  const current = isRevNumber(o.current) && seen.has(o.current) ? o.current : null;
  return { sets, current, locked: cleanLocked((o.locked as { pages?: unknown } | undefined)?.pages) };
}

/** Ce qui s'écrit dans cosmos.json : rien tant qu'aucune passe n'a été ouverte. */
export function revisionsToMeta(r: Revisions): Record<string, unknown> | undefined {
  if (isEmptyRevisions(r)) return undefined;
  return {
    sets: r.sets.map((s) => ({ n: s.n, color: s.color, date: s.date, label: s.label })),
    ...(r.current !== null ? { current: r.current } : {}),
    ...(r.locked ? { locked: { pages: r.locked.map((p) => ({ label: p.label, at: p.at, text: p.text, ...(p.more?.length ? { more: p.more } : {}) })) } } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Passes

/** Couleur de la passe n : les couleurs se suivent dans l'ordre d'usage, puis reprennent. */
export const colorFor = (n: number): RevColor => REV_COLORS[(Math.max(1, n) - 1) % REV_COLORS.length];

export const nextNumber = (r: Revisions) => r.sets.reduce((m, s) => Math.max(m, s.n), 0) + 1;

export const setOf = (r: Revisions, n: number | null | undefined) => (n == null ? undefined : r.sets.find((s) => s.n === n));

/** La passe ouverte, ou undefined. */
export const currentSet = (r: Revisions) => setOf(r, r.current);

/** Ouvre une nouvelle passe (couleur suivante par défaut). Les marques des passes précédentes restent. */
export function openRevision(r: Revisions, opts: { date: string; label?: string; color?: RevColor }): Revisions {
  const n = nextNumber(r);
  const set: RevisionSet = { n, color: opts.color ?? colorFor(n), date: DATE_RE.test(opts.date) ? opts.date : "", label: (opts.label ?? "").replace(/\s+/g, " ").trim().slice(0, 80) };
  return { ...r, sets: [...r.sets, set], current: n };
}

/** Ferme la passe ouverte : plus aucune marque nouvelle. Les marques posées restent. */
export const closeRevision = (r: Revisions): Revisions => (r.current === null ? r : { ...r, current: null });

// ---------------------------------------------------------------------------------------------------------
// Marques sur les éléments

/** Retire toutes les marques (« Nouvelle version propre ») sans toucher au texte. Même tableau si rien à retirer. */
export function clearMarks(elements: ScreenplayElement[]): ScreenplayElement[] {
  if (!elements.some((e) => e.rev !== undefined)) return elements;
  return elements.map((e) => {
    if (e.rev === undefined) return e;
    const { rev: _rev, ...rest } = e;
    return rest;
  });
}

export const clearScreenplayMarks = (s: Screenplay): Screenplay => {
  const elements = clearMarks(s.elements);
  return elements === s.elements ? s : { ...s, elements };
};

/** Éléments qui portent une marque (n'importe quelle passe), pour « Effacer les marques ». */
export const markedCount = (elements: ScreenplayElement[]) => elements.filter((e) => e.rev !== undefined).length;

const keyOf = (e: ScreenplayElement) => `${e.type}\u0000${e.text}`;

/**
 * Pose la marque de la passe `n` sur les éléments de `next` qui ne se retrouvent pas, à l'identique, dans `prev`
 * (éléments alignés par la plus longue suite commune de type et de texte : un élément déplacé n'est pas modifié,
 * un élément retouché ou ajouté l'est). Les marques d'une passe antérieure sont remplacées par la plus récente ;
 * un élément inchangé garde la sienne (ou son absence de marque : « Nouvelle version propre »). Rend le même tableau si rien ne change.
 */
export function markChanged(prev: ScreenplayElement[], next: ScreenplayElement[], n: number): ScreenplayElement[] {
  const matched = alignedWith(prev, next);
  let changed = false;
  const out = next.map((el, i) => {
    if (!REV_TYPES.has(el.type) || el.text === "") return el;
    const from = matched[i];
    // Inchangé : il garde sa marque, ou son absence de marque.
    if (from !== null) return el;
    if (el.rev === n) return el;
    changed = true;
    return { ...el, rev: n };
  });
  return changed ? out : next;
}

/** Pour chaque élément de `b`, le rang de son jumeau dans `a`, ou null. Plus longue suite commune (LCS). */
function alignedWith(a: ScreenplayElement[], b: ScreenplayElement[]): (number | null)[] {
  const out: (number | null)[] = b.map(() => null);
  // Préfixe et suffixe identiques d'abord : le cas courant (une frappe) coûte O(n).
  let lo = 0;
  while (lo < a.length && lo < b.length && keyOf(a[lo]) === keyOf(b[lo])) {
    out[lo] = lo;
    lo++;
  }
  let ha = a.length;
  let hb = b.length;
  while (ha > lo && hb > lo && keyOf(a[ha - 1]) === keyOf(b[hb - 1])) {
    ha--;
    hb--;
    out[hb] = ha;
  }
  const A = a.slice(lo, ha).map(keyOf);
  const B = b.slice(lo, hb).map(keyOf);
  if (A.length === 0 || B.length === 0) return out;
  // Au-delà d'un milieu très long, on s'en tient à l'alignement des bords : jamais de calcul quadratique lourd.
  if (A.length * B.length > 4_000_000) return out;
  const w = B.length + 1;
  const table = new Uint32Array((A.length + 1) * w);
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      table[i * w + j] = A[i] === B[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      out[lo + j] = lo + i;
      i++;
      j++;
    } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) i++;
    else j++;
  }
  return out;
}

/** Numéros de passe présents dans le texte, du plus ancien au plus récent. */
export function usedRevisions(elements: ScreenplayElement[]): number[] {
  return [...new Set(elements.flatMap((e) => (e.rev === undefined ? [] : [e.rev])))].sort((a, b) => a - b);
}

/** Les passes de `base` plus celles dont une marque reste dans le texte (import : une note sans passe connue). */
export function withUsedSets(base: Revisions, elements: ScreenplayElement[]): Revisions {
  const missing = usedRevisions(elements).filter((n) => !base.sets.some((s) => s.n === n));
  if (missing.length === 0) return base;
  const sets = [...base.sets, ...missing.map((n): RevisionSet => ({ n, color: colorFor(n), date: "", label: "" }))].sort((a, b) => a.n - b.n);
  return { ...base, sets };
}
