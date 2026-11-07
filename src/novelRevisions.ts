// Révisions du roman (#22) : le texte tapé ou collé pendant une passe ouverte porte la marque de cette passe,
// `<span data-rev="<n>">` dans le HTML et dans manuscrit/*.md (comme la marque de l'IA). Les passes elles-mêmes sont
// celles du scénario (bloc `revisions` de cosmos.json, screenplay/revisions.ts). Fonctions pures.

const REV_NUM_RE = /^[1-9][0-9]?$/;
/** Numéro de passe acceptable (il vient du disque et finit dans un attribut HTML) : 1 à 99, comme `MAX_SETS`. */
export const isRevNumber = (v: unknown): v is string => typeof v === "string" && REV_NUM_RE.test(v);

const REV_SPAN_RE = /<span data-rev="([1-9][0-9]?)">/g;

/** Nombre de passages marqués dans un HTML, par numéro de passe. */
export function revCounts(html: string | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (!html) return out;
  for (const m of html.matchAll(REV_SPAN_RE)) out.set(Number(m[1]), (out.get(Number(m[1])) ?? 0) + 1);
  return out;
}

/** Passages marqués de tout le livre, par numéro de passe. */
export function bookRevCounts(manuscript: Record<string, string>): Map<number, number> {
  const out = new Map<number, number>();
  for (const html of Object.values(manuscript)) for (const [n, c] of revCounts(html)) out.set(n, (out.get(n) ?? 0) + c);
  return out;
}

/** Retire toutes les marques de révision d'un HTML, sans toucher au texte. Même chaîne si rien à retirer. */
export function clearRevMarks(html: string): string {
  if (!html.includes("data-rev")) return html;
  // Une marque peut contenir d'autres <span> (commentaire, IA) : on suit la profondeur pour trouver SA fermeture.
  const tag = /<span\b[^>]*>|<\/span>/g;
  let out = "";
  let last = 0;
  // Pile des <span> ouverts : vrai si c'est une marque de révision (sa fermeture est retirée aussi).
  const stack: boolean[] = [];
  for (const m of html.matchAll(tag)) {
    const at = m.index ?? 0;
    let drop = false;
    if (m[0].startsWith("</")) drop = stack.pop() === true;
    else {
      drop = /^<span data-rev="[1-9][0-9]?">$/.test(m[0]);
      stack.push(drop);
    }
    if (drop) {
      out += html.slice(last, at);
      last = at + m[0].length;
    }
  }
  return out + html.slice(last);
}

/** Retire les marques de tout le livre ; seules les scènes changées sont rendues. */
export function clearBookRevMarks(manuscript: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, html] of Object.entries(manuscript)) {
    const next = clearRevMarks(html);
    if (next !== html) out[id] = next;
  }
  return out;
}

/** Règles CSS de la couleur de chaque passe marquée ou connue (`color` rend la couleur CSS d'une passe). */
export function revStyle(numbers: Iterable<number>, color: (n: number) => string): string {
  return [...new Set(numbers)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 99)
    .map((n) => `.ms-page [data-rev="${n}"]{--rev:${color(n)}}`)
    .join("");
}
