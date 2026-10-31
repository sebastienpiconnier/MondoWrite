// Collage de Markdown : un texte brut qui ressemble à du Markdown (titres, listes, gras, italique, cases
// à cocher, liens, citations) est converti en texte mis en forme au lieu d'être collé tel quel.
// Fonction pure, testée. La conversion elle-même passe par markdownToHtml (donc par sanitizeHtml).

const PATTERNS = [
  /^#{1,6}\s+\S/m, // titre
  /^\s*[-*+]\s+\S/m, // liste à puces
  /^\s*\d+[.)]\s+\S/m, // liste numérotée
  /^\s*[-*+]\s+\[[ xX]\]\s/m, // case à cocher
  /^>\s?\S/m, // citation
  /\*\*[^*\n]+\*\*/, // gras
  /__[^_\n]+__/,
  /(^|[\s(])\*[^*\s][^*\n]*\*(?=[\s).,;:!?]|$)/m, // italique
  /(^|[\s(])_[^_\s][^_\n]*_(?=[\s).,;:!?]|$)/m,
  /\[[^\]\n]+\]\([^)\s]+\)/, // lien
  /~~[^~\n]+~~/, // barré
  /==[^=\n]+==/, // à reprendre
];

const ITEM_RE = /^\s*[-*+]\s+(\S.*)$/;
const BLANK_RE = /^\s*$/;
/** Ce qui sonne comme une réplique : question, exclamation, points de suspension, guillemets. */
const SPOKEN_RE = /[?!…«»“”]|\.\.\.$/;

/**
 * Lignes « - Tu viens ? » qui sont des répliques de dialogue, pas une liste : une suite de tirets que la
 * narration suit sans ligne vide, ou dont une ligne sonne comme une parole (jamais une case à cocher). Rend leurs numéros.
 */
export function dialogueLines(text: string): Set<number> {
  const lines = text.split("\n");
  const out = new Set<number>();
  for (let i = 0; i < lines.length; ) {
    if (!ITEM_RE.test(lines[i])) {
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && ITEM_RE.test(lines[end])) end++;
    const after = lines[end];
    const prose = after !== undefined && !BLANK_RE.test(after) && !/^\s{2,}\S/.test(after);
    const items = lines.slice(i, end).map((l) => ITEM_RE.exec(l)![1].trim());
    // Une case à cocher (« - [ ] ») est toujours une liste.
    const tasks = items.some((item) => /^\[[ xX]\]/.test(item));
    const spoken = items.some((item) => SPOKEN_RE.test(item));
    if (!tasks && (prose || spoken)) for (let k = i; k < end; k++) out.add(k);
    i = end;
  }
  return out;
}

/** Les répliques à tiret deviennent des paragraphes à part, au tiret échappé (Markdown ne les lit plus en liste). */
export function protectDialogue(text: string): string {
  const dialogue = dialogueLines(text);
  if (dialogue.size === 0) return text;
  return text
    .split("\n")
    .map((line, i) => (dialogue.has(i) ? `\n${line.replace(/^(\s*)([-*+])/, "$1\\$2")}\n` : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Le texte collé contient-il de la mise en forme Markdown ? Des répliques à tiret ne font pas une liste. */
export const looksLikeMarkdown = (text: string) => {
  const dialogue = dialogueLines(text);
  const rest = dialogue.size ? text.split("\n").filter((_, i) => !dialogue.has(i)).join("\n") : text;
  return PATTERNS.some((re) => re.test(rest));
};

/** `==texte==` (« à reprendre ») n'est pas du Markdown standard : il devient une balise <mark>. */
export const markHighlights = (text: string) => text.replace(/==([^=\n]+)==/g, "<mark>$1</mark>");

/** Texte Markdown prêt pour markdownToHtml : répliques protégées, « à reprendre » en <mark>. */
export const markdownSource = (text: string) => markHighlights(protectDialogue(text));
