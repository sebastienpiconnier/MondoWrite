// Carnet de l'iPhone : ce qu'on capture en passant (une idée, une question, un nom) devient une carte ordinaire
// marquée `inbox`, qui attend sur le canevas, dans « À ranger », qu'on lui trouve sa place. Elle quitte la boîte
// quand on la déplace sur le canevas, qu'on la relie à une autre carte, ou qu'on la dit rangée. Fonctions pures.

import type { CardData, CardType } from "./types";

/**
 * Types proposés pour une capture, dans l'ordre des pastilles du Carnet. Pas de Scène : une scène s'écrit dans le
 * Manuscrit ou le Scénario, qui sont aussi sur le téléphone.
 */
export const CAPTURE_TYPES: readonly CardType[] = ["idee", "question", "personnage", "lieu", "objet", "theme"];

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Carte née d'une capture : la première ligne est le titre, la suite le texte. Une adresse seule fait un Lien
 * (son adresse dans la fiche), quel que soit le type choisi.
 */
export function capturedCard(id: string, type: CardType, text: string): CardData | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const title = (lines.shift() ?? "").trim();
  const rest = lines.map((l) => l.trim());
  while (rest.length > 0 && !rest[0]) rest.shift();
  while (rest.length > 0 && !rest[rest.length - 1]) rest.pop();
  if (!title && rest.length === 0) return null;
  if (URL_RE.test(title) && rest.length === 0) return { id, type: "lien", title: "", html: "", fiche: { url: title }, inbox: true };
  const html = rest.length > 0 ? rest.map((l) => (l ? `<p>${escapeHtml(l)}</p>` : "")).filter(Boolean).join("") : "";
  return { id, type, title: title.slice(0, 300), html, inbox: true };
}

/** Cartes encore à ranger, les plus récentes d'abord (ordre inverse de leur arrivée). */
export const inboxCards = (cards: readonly CardData[]): CardData[] => cards.filter((c) => c.inbox).reverse();

/** Les cartes dites rangées quittent la boîte. Même tableau si aucune n'y était. */
export function fileCards<T extends { id: string; data: CardData }>(nodes: T[], ids: ReadonlySet<string>): T[] {
  if (!nodes.some((n) => ids.has(n.id) && n.data.inbox)) return nodes;
  return nodes.map((n) => {
    if (!ids.has(n.id) || !n.data.inbox) return n;
    const { inbox: _done, ...data } = n.data;
    return { ...n, data: data as CardData };
  });
}
