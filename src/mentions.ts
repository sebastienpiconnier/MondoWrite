// Mentions « @ » : citer une carte dans le texte d'une autre. Fonctions pures.
//
// En mémoire (HTML de l'éditeur) : <span data-mention="<id>">@Titre</span>
// Dans le fichier Markdown :       [@Titre](cosmos:<id>)
// Un lien Markdown ordinaire : lisible partout, et l'identifiant survit au renommage de la carte.

import type { CardData, CardType } from "./types";

export const MENTION_SCHEME = "cosmos:";

const ID = "[A-Za-z0-9_-]+";
const ID_RE = new RegExp(`^${ID}$`);
const MENTION_RE = new RegExp(`<span data-mention="(${ID})">([^<]*)</span>`, "g");

/** Un identifiant de carte acceptable dans un lien (il vient du disque). */
export const isCardId = (id: string | null | undefined): id is string => !!id && ID_RE.test(id);

/** Identifiant visé par un lien `cosmos:<id>`, sinon null. */
export function mentionTarget(href: string | null | undefined): string | null {
  if (!href?.startsWith(MENTION_SCHEME)) return null;
  const id = href.slice(MENTION_SCHEME.length);
  return isCardId(id) ? id : null;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const mentionHtml = (id: string, title: string) => `<span data-mention="${id}">@${escape(title)}</span>`;

/** Identifiants des cartes citées dans ce texte, sans doublon. */
export function mentionedIds(html: string): string[] {
  return [...new Set([...html.matchAll(MENTION_RE)].map((m) => m[1]))];
}

/** La carte citée a changé de titre : ses mentions suivent. Rend la même chaîne si rien ne change. */
export function renameMentions(html: string, id: string, title: string): string {
  if (!title.trim() || !html.includes(`data-mention="${id}"`)) return html;
  return html.replace(MENTION_RE, (all, found) => (found === id ? mentionHtml(id, title.trim()) : all));
}

/** La carte citée n'existe plus : la mention redevient du texte ordinaire (le nom reste écrit). */
export function removeMentions(html: string, id: string): string {
  if (!html.includes(`data-mention="${id}"`)) return html;
  return html.replace(MENTION_RE, (all, found, label) => (found === id ? label : all));
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Longueur maximale de ce qu'on tape après « @ ». */
export const MENTION_QUERY_MAX = 40;

/**
 * Ce qui est en train d'être tapé après un « @ » ou un « [[ » (l'habitude d'Obsidian), d'après le texte placé
 * avant le curseur. `length` couvre le déclencheur : c'est ce que la mention remplace. Le « @ » doit ouvrir
 * un mot (pas une adresse de courriel). Rend null s'il n'y a pas de mention en cours.
 * Les deux déclencheurs donnent la même mention, écrite `[@Titre](cosmos:<id>)` : une seule syntaxe.
 */
export function mentionQuery(before: string): { query: string; length: number } | null {
  const at = before.lastIndexOf("@");
  const brackets = before.lastIndexOf("[[");
  const valid = (query: string) => query.length <= MENTION_QUERY_MAX && !/^\s/.test(query) && !/[\n￼]/.test(query);
  if (brackets >= 0 && brackets > at) {
    const query = before.slice(brackets + 2);
    // « [[Titre]] » déjà fermé, ou crochets dans ce qu'on tape : ce n'est plus une mention en cours.
    return valid(query) && !/[[\]]/.test(query) ? { query, length: query.length + 2 } : null;
  }
  if (at < 0 || (at > 0 && !/[\s(«“"'’]/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  return valid(query) ? { query, length: query.length + 1 } : null;
}

export interface MentionCandidate {
  id: string;
  type: CardType;
  title: string;
}

export const MENTION_MAX = 6;

/**
 * Cartes proposées pour ce qui est tapé : celles dont le titre commence ainsi d'abord,
 * puis celles qui le contiennent. Jamais la carte elle-même, jamais une carte sans titre.
 */
export function mentionCandidates(cards: CardData[], query: string, selfId: string, lang: string): MentionCandidate[] {
  const q = fold(query);
  const rank = (title: string) => {
    const t = fold(title);
    return t.startsWith(q) ? 0 : t.split(/\s+/).some((word) => word.startsWith(q)) ? 1 : t.includes(q) ? 2 : -1;
  };
  return cards
    .filter((c) => c.id !== selfId && c.title.trim() && rank(c.title) >= 0)
    .sort((a, b) => rank(a.title) - rank(b.title) || a.title.localeCompare(b.title, lang))
    .slice(0, MENTION_MAX)
    .map(({ id, type, title }) => ({ id, type, title: title.trim() }));
}

/** Peut-on proposer de créer une carte de ce nom ? Un nom court, que personne ne porte déjà. */
export function canCreateMention(cards: CardData[], query: string): boolean {
  const q = fold(query);
  if (!q || /\s$/.test(query) || q.split(/\s+/).length > 4) return false;
  return !cards.some((c) => fold(c.title) === q);
}
