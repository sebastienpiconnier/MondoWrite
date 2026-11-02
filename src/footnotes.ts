// Notes de bas de page du manuscrit (1.13.0, `docs/plan-notes.md`). Dans l'éditeur, une note est un appel
// `<sup data-footnote="texte">` sans contenu (le numéro vient de sa place, compté à l'affichage et à l'export). Sur
// disque, la syntaxe Markdown connue : `[^1]` à l'endroit de l'appel, et `[^1]: texte` en fin du fichier de la scène.
// Les numéros du fichier sont locaux à la scène ; le livre se numérote à l'export. Fonctions pures.

/** Une note tient sur une ligne et reste raisonnable. */
export const FOOTNOTE_MAX = 2000;
export const cleanNote = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, FOOTNOTE_MAX);

const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Appel de note en HTML (celui de l'éditeur, sans sa classe). */
export const footnoteHtml = (text: string) => `<sup data-footnote="${escapeAttr(cleanNote(text))}"></sup>`;

// Repère posé à la place d'un appel le temps de passer par turndown (caractères privés : jamais échappés).
const MARK = (i: number) => `FN${i}`;
const MARK_RE = /FN(\d+)/g;

/**
 * HTML d'une scène → HTML où chaque appel est remplacé par un repère, et le texte des notes dans l'ordre.
 * Rien à faire (et le même HTML) quand la scène n'a pas de note.
 */
export function takeFootnotes(html: string): { html: string; notes: string[] } {
  if (!html.includes("data-footnote")) return { html, notes: [] };
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const notes: string[] = [];
  doc.body.querySelectorAll("sup[data-footnote]").forEach((sup) => {
    notes.push(cleanNote(sup.getAttribute("data-footnote") ?? ""));
    sup.replaceWith(doc.createTextNode(MARK(notes.length)));
  });
  return { html: doc.body.innerHTML, notes };
}

/** Markdown produit par turndown, repères compris → appels `[^n]` et définitions en fin de texte. */
export function putFootnotes(md: string, notes: string[]): string {
  if (notes.length === 0) return md;
  const body = md.replace(MARK_RE, (_m, n: string) => `[^${n}]`);
  return `${body}\n\n${notes.map((text, i) => `[^${i + 1}]: ${text}`).join("\n")}`;
}

const DEF_RE = /^\[\^([^\]\s]{1,40})\]:[ \t]*(.*)$/gm;

/**
 * Markdown lu sur disque → Markdown où chaque appel connu est devenu son HTML (marked laisse passer le HTML en
 * ligne, puis sanitizeHtml le vérifie). Les définitions sont retirées ; un appel sans définition reste du texte.
 */
export function readFootnotes(md: string): string {
  if (!md.includes("[^")) return md;
  const defs = new Map<string, string>();
  const body = md.replace(DEF_RE, (_m, label: string, text: string) => {
    defs.set(label, text);
    return "";
  });
  if (defs.size === 0) return md;
  return body.replace(/\[\^([^\]\s]{1,40})\](?!:)/g, (m, label: string) => (defs.has(label) ? footnoteHtml(defs.get(label)!) : m)).replace(/\n{3,}$/, "\n");
}
