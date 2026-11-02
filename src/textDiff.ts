// Différences entre deux textes (versions d'une scène, 1.13.0) : d'abord par paragraphes, puis mot à mot dans les
// paragraphes qui ont changé, pour qu'une scène de plusieurs milliers de mots se compare vite. Sans dépendance.
// Fonctions pures.

export type DiffKind = "same" | "add" | "del";
/** Un morceau de texte et ce qui lui est arrivé ; `break` : fin de paragraphe après ce morceau. */
export interface DiffPart {
  kind: DiffKind;
  text: string;
  break?: boolean;
}

export interface TextDiff {
  parts: DiffPart[];
  added: number;
  removed: number;
}

/** Au-delà, un paragraphe changé n'est plus comparé mot à mot (retiré puis ajouté en entier). */
const WORD_CELLS = 2_000_000;
/** Au-delà, les paragraphes ne sont plus alignés (tout le texte changé d'un bloc). */
const PARA_CELLS = 4_000_000;

const WORD_RE = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;
export const wordCount = (text: string) => text.match(WORD_RE)?.length ?? 0;

/** Paragraphes non vides, espaces réduites. */
export function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n|\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

/** Texte lisible d'un Markdown de scène : sans les marques de mise en forme (gras, italique, liens, titres…). */
export function markdownPlain(md: string): string {
  return md
    .replace(/\r\n?/g, "\n")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|==|~~)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](?!\s)(.+?)(?<!\s)[*_](?![\w*])/g, "$1$2")
    .replace(/\\([\\`*_{}[\]()#+\-.!>~=|])/g, "$1");
}

/** Plus longue sous-suite commune : paires d'indices alignés, dans l'ordre. */
function lcs<T>(a: readonly T[], b: readonly T[], same: (x: T, y: T) => boolean): [number, number][] {
  const n = a.length;
  const m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i * (m + 1) + j] = same(a[i], b[j]) ? table[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(table[(i + 1) * (m + 1) + j], table[i * (m + 1) + j + 1]);
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(a[i], b[j])) {
      out.push([i, j]);
      i++;
      j++;
    } else if (table[(i + 1) * (m + 1) + j] >= table[i * (m + 1) + j + 1]) i++;
    else j++;
  }
  return out;
}

/** Mots et espaces, chaque espace collée au mot qui la précède (le texte se recolle à l'identique). */
const tokens = (text: string) => text.match(/\S+\s*/g) ?? [];
const bare = (token: string) => token.trim();

/** Ajoute un morceau en fusionnant avec le précédent de même sorte. */
function push(parts: DiffPart[], kind: DiffKind, text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.kind === kind && !last.break) last.text += text;
  else parts.push({ kind, text });
}

function endParagraph(parts: DiffPart[]) {
  if (parts.length > 0) parts[parts.length - 1].break = true;
}

/** Deux paragraphes comparés mot à mot. */
function diffWords(before: string, after: string, parts: DiffPart[]): { added: number; removed: number } {
  const a = tokens(before);
  const b = tokens(after);
  if (a.length * b.length > WORD_CELLS) {
    push(parts, "del", before);
    push(parts, "add", ` ${after}`);
    return { added: wordCount(after), removed: wordCount(before) };
  }
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  for (const [x, y] of [...lcs(a, b, (p, q) => bare(p) === bare(q)), [a.length, b.length] as [number, number]]) {
    const del = a.slice(i, x).join("");
    const add = b.slice(j, y).join("");
    push(parts, "del", del);
    push(parts, "add", add);
    removed += wordCount(del);
    added += wordCount(add);
    if (x < a.length) push(parts, "same", b[y]);
    i = x + 1;
    j = y + 1;
  }
  return { added, removed };
}

/** Ce qui sépare `before` (la version) de `after` (l'autre texte) : morceaux identiques, retirés et ajoutés. */
export function diffText(before: string, after: string): TextDiff {
  const a = paragraphsOf(before);
  const b = paragraphsOf(after);
  const parts: DiffPart[] = [];
  let added = 0;
  let removed = 0;
  const pairs: [number, number][] = a.length * b.length > PARA_CELLS ? [] : lcs(a, b, (x, y) => x === y);
  let i = 0;
  let j = 0;
  for (const [x, y] of [...pairs, [a.length, b.length] as [number, number]]) {
    // Paragraphes changés entre deux paragraphes identiques : appariés un à un, comparés mot à mot.
    const gone = a.slice(i, x);
    const come = b.slice(j, y);
    const common = Math.min(gone.length, come.length);
    for (let k = 0; k < Math.max(gone.length, come.length); k++) {
      if (k < common) {
        const n = diffWords(gone[k], come[k], parts);
        added += n.added;
        removed += n.removed;
      } else if (k < gone.length) {
        push(parts, "del", gone[k]);
        removed += wordCount(gone[k]);
      } else {
        push(parts, "add", come[k]);
        added += wordCount(come[k]);
      }
      endParagraph(parts);
    }
    if (x < a.length) {
      push(parts, "same", a[x]);
      endParagraph(parts);
    }
    i = x + 1;
    j = y + 1;
  }
  return { parts, added, removed };
}
