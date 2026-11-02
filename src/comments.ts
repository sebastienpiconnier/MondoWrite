// Commentaires ancrés (1.13.0, `docs/plan-commentaires.md`) : l'auteur sélectionne un passage du texte d'une scène et
// y attache un commentaire, qu'il pourra résoudre. Le passage porte une marque `<span data-comment="<id>">` dans le
// manuscrit (comme la marque de l'IA) ; le commentaire lui-même est dans `commentaires/<id de la carte>.md`, un
// Markdown lisible hors de l'app. Fonctions pures.

export interface SceneComment {
  /** Identifiant, le même que celui de la marque dans le texte. */
  id: string;
  /** Date ISO de création. */
  date: string;
  /** Texte du commentaire (texte brut, plusieurs lignes possibles). */
  text: string;
  /** Le passage commenté, tel qu'il était : montré si la marque a disparu du texte. */
  quote: string;
  /** Résolu : gardé, mais plus surligné ni compté dans « À faire ». */
  resolved?: boolean;
}

/** Commentaires de chaque scène, par identifiant de carte. */
export type Comments = Record<string, SceneComment[]>;

const COMMENT_ID_RE = /^[A-Za-z0-9_-]{6,24}$/;
/** Identifiant de commentaire acceptable (il vient du disque et finit dans un attribut HTML). */
export const isCommentId = (id: unknown): id is string => typeof id === "string" && COMMENT_ID_RE.test(id);

/**
 * Scénario : un commentaire porte sur un élément entier (action ou réplique), noté à la fin de sa ligne dans le
 * Fountain par `[[cosmos:comment:<id>]]` (une note, que les autres logiciels n'impriment pas), gardé en `comments`.
 */
export const COMMENT_TYPES: ReadonlySet<string> = new Set(["action", "dialogue"]);
export const commentNote = (id: string) => `[[cosmos:comment:${id}]]`;
const COMMENT_NOTE_RE = /\s*\[\[cosmos:comment:([A-Za-z0-9_-]{6,24})\]\]\s*$/;

/** Notes de commentaire en fin de texte : retirées, rendues dans l'ordre du fichier. */
export function readCommentNotes(text: string): { text: string; ids: string[] } {
  const ids: string[] = [];
  let rest = text;
  for (let m = COMMENT_NOTE_RE.exec(rest); m; m = COMMENT_NOTE_RE.exec(rest)) {
    if (!ids.includes(m[1])) ids.unshift(m[1]);
    rest = rest.slice(0, m.index);
  }
  return { text: rest, ids };
}

/** Une citation tient sur une ligne et reste courte. */
export const QUOTE_MAX = 300;
export const cleanQuote = (text: string) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > QUOTE_MAX ? `${one.slice(0, QUOTE_MAX - 1)}…` : one;
};

// En-tête de chaque commentaire dans le fichier : « ## <id> · <date> » puis « · resolved » s'il est résolu.
// Le format ne se traduit jamais (comme le reste des fichiers du projet).
const HEAD_RE = /^## ([A-Za-z0-9_-]{6,24}) · (\d{4}-\d{2}-\d{2}T[^\s]+)( · resolved)?$/;
const FILE_HEAD = "<!-- MondoWrite : commentaires de la scène, un par titre « ## identifiant · date ». -->";

/** Fichier `commentaires/<id>.md` d'une scène, ou null s'il n'y a rien à écrire. */
export function commentsFile(list: readonly SceneComment[]): string | null {
  const kept = list.filter((c) => isCommentId(c.id));
  if (kept.length === 0) return null;
  const blocks = kept.map((c) => {
    const lines = [`## ${c.id} · ${c.date}${c.resolved ? " · resolved" : ""}`];
    if (c.quote) lines.push(`> ${cleanQuote(c.quote)}`);
    // Une ligne du texte qui ressemblerait à un en-tête est protégée par une barre oblique inverse.
    for (const line of c.text.replace(/\r\n?/g, "\n").replace(/\s+$/, "").split("\n")) lines.push(HEAD_RE.test(line) || /^\\+## /.test(line) ? `\\${line}` : line);
    return lines.join("\n");
  });
  return `${FILE_HEAD}\n\n${blocks.join("\n\n")}\n`;
}

/** Commentaires lus dans un fichier (un en-tête illisible ou en double est ignoré avec son texte). */
export function readCommentsFile(raw: string): SceneComment[] {
  const out: SceneComment[] = [];
  const seen = new Set<string>();
  let current: (SceneComment & { lines: string[] }) | null = null;
  const close = () => {
    if (!current) return;
    const { lines, ...c } = current;
    const text = lines.join("\n").replace(/^\n+|\s+$/g, "");
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push({ ...c, text, ...(c.resolved ? { resolved: true } : {}) });
    }
    current = null;
  };
  let skipping = false;
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const head = HEAD_RE.exec(line);
    if (head) {
      close();
      skipping = false;
      current = { id: head[1], date: head[2], text: "", quote: "", lines: [], ...(head[3] ? { resolved: true } : {}) };
      continue;
    }
    if (/^## /.test(line)) {
      close();
      skipping = true;
      continue;
    }
    if (!current || skipping) continue;
    if (current.lines.length === 0 && !current.quote && line.startsWith("> ")) {
      current.quote = cleanQuote(line.slice(2));
      continue;
    }
    current.lines.push(line.replace(/^\\(\\*## )/, "$1"));
  }
  close();
  return out;
}

/** Identifiants des commentaires des éléments d'un scénario (une scène, ou tout), dans l'ordre du texte. */
export function commentIdsInElements(elements: readonly { comments?: string[] }[]): string[] {
  const ids: string[] = [];
  for (const el of elements) for (const id of el.comments ?? []) if (isCommentId(id) && !ids.includes(id)) ids.push(id);
  return ids;
}

/** Éléments sans un commentaire (même tableau si aucun ne le portait). */
export function removeCommentFromElements<E extends { comments?: string[] }>(elements: E[], id: string): E[] {
  if (!elements.some((el) => el.comments?.includes(id))) return elements;
  return elements.map((el) => {
    if (!el.comments?.includes(id)) return el;
    const rest = el.comments.filter((x) => x !== id);
    const { comments: _gone, ...bare } = el;
    return (rest.length > 0 ? { ...bare, comments: rest } : bare) as E;
  });
}

/** Identifiants des passages marqués dans un HTML, dans l'ordre du texte, sans doublon. */
export function commentIdsIn(html: string | undefined): string[] {
  const ids: string[] = [];
  for (const m of (html ?? "").matchAll(/<span[^>]*\sdata-comment="([^"]+)"/g)) if (isCommentId(m[1]) && !ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

/** HTML sans la marque d'un commentaire (le texte du passage reste). */
export function removeCommentMark(html: string, id: string): string {
  if (!isCommentId(id) || !html.includes(`data-comment="${id}"`)) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.body.querySelectorAll(`span[data-comment="${id}"]`).forEach((span) => span.replaceWith(...Array.from(span.childNodes)));
  return doc.body.innerHTML;
}

/** Commentaires d'une scène dans l'ordre du texte ; ceux dont la marque a disparu viennent ensuite, du plus ancien au plus récent. */
export function orderComments(list: readonly SceneComment[], order: readonly string[]): SceneComment[] {
  const rank = (c: SceneComment) => {
    const at = order.indexOf(c.id);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));
}

/** Le passage du commentaire est-il encore dans le texte (`anchors` : identifiants présents) ? */
export const isAnchored = (c: SceneComment, anchors: readonly string[]) => anchors.includes(c.id);

/** Commentaires encore ouverts de tout le projet (pour « À faire »), dans l'ordre des scènes donné. */
export function openComments(comments: Comments, order: readonly string[]): { cardId: string; comment: SceneComment }[] {
  const ids = [...order, ...Object.keys(comments).filter((id) => !order.includes(id))];
  return ids.flatMap((cardId) => (comments[cardId] ?? []).filter((c) => !c.resolved && c.text.trim()).map((comment) => ({ cardId, comment })));
}

/** Nombre de commentaires ouverts d'une scène. */
export const openCount = (list: readonly SceneComment[] | undefined) => (list ?? []).filter((c) => !c.resolved).length;
