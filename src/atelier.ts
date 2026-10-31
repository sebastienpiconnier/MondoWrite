// Mode Atelier (1.8.0) : pour le seul projet où l'auteur l'active, l'IA peut proposer du texte. Tout texte
// accepté reste marqué et journalisé. Fonctions pures : réglage du projet, marque `ia` dans le HTML des
// éditeurs, journal `ia-journal.md`, clés des champs proposés (fiche, couverture).
//
// Par défaut (réglage absent), l'IA reste « gardienne » : elle questionne, elle n'écrit pas.

import { countWords, type Manuscript } from "./manuscript";
import type { Screenplay } from "./screenplay/model";
import { elementWords } from "./screenplay/words";

/** Réglage du projet : « gardienne » (défaut, jamais écrit) ou « atelier » (écrit `aiMode: "atelier"`). */
export type AiMode = "gardienne" | "atelier";
export const readAiMode = (raw: unknown): AiMode => (raw === "atelier" ? "atelier" : "gardienne");

// ---------- Marque `ia` ----------

/** Identifiant court d'un passage proposé par l'IA : lettres, chiffres, « _ » et « - », jamais autre chose. */
const IA_ID_RE = /^[A-Za-z0-9_-]{4,16}$/;
export const isIaId = (id: unknown): id is string => typeof id === "string" && IA_ID_RE.test(id);

/** Forme exacte de la marque, en mémoire et sur disque (règle turndown, nettoyage) : `<span data-ia="id">…</span>`. */
const IA_SPAN_RE = /<span\b[^>]*\bdata-ia="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi;

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "’").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Passages marqués d'un texte, un par identifiant (un passage sur plusieurs paragraphes a une marque par
 * paragraphe, même identifiant) : texte en clair, dans l'ordre du texte. Les marques imbriquées (une mention
 * dans un passage) n'en coupent pas le texte : seule la balise fermante qui suit compte, ce qui suffit au résumé.
 */
export function iaPassagesIn(html: string | undefined): { id: string; text: string }[] {
  if (!html || !html.includes("data-ia")) return [];
  const byId = new Map<string, string[]>();
  for (const m of html.matchAll(IA_SPAN_RE)) {
    if (!isIaId(m[1])) continue;
    const text = decode(m[2]);
    if (!text) continue;
    byId.set(m[1], [...(byId.get(m[1]) ?? []), text]);
  }
  return [...byId].map(([id, parts]) => ({ id, text: parts.join(" ") }));
}

/** Mots d'un texte qui sont dans des passages marqués. */
export const iaWordsIn = (html: string | undefined) => iaPassagesIn(html).reduce((sum, p) => sum + countWords(p.text), 0);

/**
 * « Je l'ai repris » : retire la marque d'un passage (ou de tous, sans identifiant), le texte reste. Même chaîne
 * si rien ne change. Une marque peut contenir une mention (`<span data-mention>`) : on retire la balise ouvrante
 * de la marque et la fermante qui lui correspond, en comptant les `<span>` ouverts entre les deux.
 */
export function unmarkIa(html: string, id?: string): string {
  if (!html.includes("data-ia")) return html;
  let out = "";
  let i = 0;
  const open = /<span\b[^>]*\bdata-ia="([^"]*)"[^>]*>/gi;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    if (id !== undefined && m[1] !== id) continue;
    out += html.slice(i, m.index);
    // Fin de cette marque : la balise </span> qui ramène la profondeur à zéro.
    const tags = /<span\b[^>]*>|<\/span>/gi;
    tags.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      depth += t[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    if (end < 0) return html; // balises déséquilibrées : on ne touche à rien
    out += html.slice(m.index + m[0].length, end);
    i = end + "</span>".length;
    open.lastIndex = i;
  }
  return i === 0 ? html : out + html.slice(i);
}

/** Texte brut proposé par l'IA, en HTML d'un seul paragraphe marqué (rien du modèle n'est lu comme HTML). */
export const iaParagraph = (text: string, id: string) => `<p><span data-ia="${id}">${escapeHtml(text)}</span></p>`;

// ---------- Champs proposés (fiche d'une carte, couverture) ----------

/** Liste des champs dont la valeur vient de l'IA, lue sur disque : des clés simples, sans doublon. */
const FIELD_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
export function readIaFields(raw: unknown): string[] | undefined {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  const keys = [...new Set(list.filter((k): k is string => typeof k === "string").map((k) => k.trim()).filter((k) => FIELD_KEY_RE.test(k)))].slice(0, 60);
  return keys.length > 0 ? keys : undefined;
}

/** Liste après l'ajout d'un champ accepté. */
export const withIaField = (list: string[] | undefined, key: string): string[] => (list?.includes(key) ? list : [...(list ?? []), key]);

/** Liste après une retouche de l'auteur sur ce champ : il n'est plus « de l'IA ». Même tableau si rien ne change. */
export function withoutIaField(list: string[] | undefined, key: string): string[] | undefined {
  if (!list?.includes(key)) return list;
  const next = list.filter((k) => k !== key);
  return next.length > 0 ? next : undefined;
}

/**
 * Champs encore « proposés par l'IA » après une modification de la carte : un titre ou un champ de fiche qui
 * change n'en est plus. Même tableau si rien ne change.
 */
export function iaAfterPatch(
  ia: string[] | undefined,
  before: { title: string; fiche?: Record<string, string> },
  patch: { title?: string; fiche?: Record<string, string> },
): string[] | undefined {
  let next = ia;
  if (typeof patch.title === "string" && patch.title !== before.title) next = withoutIaField(next, "title");
  if ("fiche" in patch) {
    for (const key of next ?? []) {
      if (key !== "title" && (patch.fiche?.[key] ?? "") !== (before.fiche?.[key] ?? "")) next = withoutIaField(next, key);
    }
  }
  return next;
}

// ---------- Journal ----------

/** Fichier du journal, à la racine du projet, lisible hors de l'app (storage/paths.ts). */
export { JOURNAL_FILE } from "./storage/paths";

export type AtelierAction = "variants" | "synopsis" | "directions" | "pitch" | "sheet";

export interface JournalEntry {
  at: Date;
  action: AtelierAction;
  /** Carte ou scène concernée, par son titre (le projet, pour la couverture). */
  target: string;
  service: string;
  model: string;
  words: number;
}

/** Libellés du journal, dans la langue de l'interface au moment de l'écriture. */
export interface JournalLabels {
  header: string;
  actions: Record<AtelierAction, string>;
  /** « {n} mots » */
  words: string;
  /** Guillemets autour d'un titre : « {title} » ou “{title}”. */
  quoted: string;
}

const two = (n: number) => String(n).padStart(2, "0");
/** Date et heure locales, toujours au même format (AAAA-MM-JJ HH:MM), quelle que soit la langue. */
export const journalStamp = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;

const oneLine = (s: string) => s.replace(/[\r\n|]+/g, " ").replace(/\s+/g, " ").trim();

/** Une ligne du journal : « - 2026-10-31 14:05 · Trois variantes · « Le phare » · anthropic, claude-sonnet · 12 mots ». */
export function journalLine(entry: JournalEntry, labels: JournalLabels): string {
  const title = labels.quoted.replace("{title}", oneLine(entry.target).slice(0, 120));
  const service = [oneLine(entry.service), oneLine(entry.model)].filter(Boolean).join(", ");
  return `- ${journalStamp(entry.at)} · ${labels.actions[entry.action]} · ${title} · ${service} · ${labels.words.replace("{n}", String(entry.words))}`;
}

/**
 * Journal après l'ajout d'une ligne : rien de ce qui est écrit n'est retouché (l'auteur peut l'avoir annoté hors
 * de l'app). Un journal vide reçoit d'abord son en-tête.
 */
export function appendJournal(journal: string, line: string, header: string): string {
  const base = journal.replace(/\r\n/g, "\n");
  if (!base.trim()) return `${header.trim()}\n\n${line}\n`;
  return `${base.endsWith("\n") ? base : `${base}\n`}${line}\n`;
}

/** Lignes du journal (celles qui commencent par « - »), pour les compter. */
export const journalEntries = (journal: string) => journal.split(/\r?\n/).filter((l) => /^- \d{4}-\d{2}-\d{2} /.test(l));

// ---------- Fountain ----------

/** Éléments du scénario qui peuvent porter la note [[ia]] : action, réplique, didascalie, synopsis. */
export const IA_TYPES: ReadonlySet<string> = new Set(["action", "dialogue", "parenthetical", "synopsis"]);

/** Note Fountain d'un élément proposé par l'IA, en fin de texte : ignorée par les autres logiciels. */
export const IA_NOTE = "[[ia]]";
const IA_NOTE_RE = /\s*\[\[ia\]\]\s*$/;
/** Texte d'un élément lu dans le fichier : sans la note, et si elle y était. */
export function readIaNote(text: string): { text: string; ia: boolean } {
  return IA_NOTE_RE.test(text) ? { text: text.replace(IA_NOTE_RE, ""), ia: true } : { text, ia: false };
}

// ---------- Part de l'IA (fenêtre Statistiques) ----------

/** Mots marqués « IA » et mots en tout : le manuscrit d'un roman (scènes données, ou toutes). */
export function iaShareOfManuscript(manuscript: Manuscript, ids?: string[]): { ia: number; total: number } {
  let ia = 0;
  let total = 0;
  for (const id of ids ?? Object.keys(manuscript)) {
    const html = manuscript[id];
    if (!html) continue;
    ia += iaWordsIn(html);
    total += countWords(html);
  }
  return { ia, total };
}

/** Même chose pour un scénario : les mots des éléments qui portent la note [[ia]] (le synopsis ne compte pas). */
export function iaShareOfScreenplay(screenplay: Screenplay | null): { ia: number; total: number } {
  let ia = 0;
  let total = 0;
  for (const el of screenplay?.elements ?? []) {
    const n = elementWords(el);
    total += n;
    if (el.ia) ia += n;
  }
  return { ia, total };
}

/** Pourcentage arrondi (au moins 1 dès qu'il y a un mot de l'IA, pour ne jamais afficher « 0 % » à tort). */
export const iaPercent = ({ ia, total }: { ia: number; total: number }) => (total === 0 || ia === 0 ? 0 : Math.max(1, Math.round((ia / total) * 100)));
