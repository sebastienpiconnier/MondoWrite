// « À faire » : tout ce qui reste ouvert dans le projet, rassemblé sans liste à part. Fonctions pures.
// - les cases non cochées des cartes, des fiches et du manuscrit (`- [ ]`) ;
// - les passages « à reprendre » du manuscrit (<mark>, Cmd/Ctrl+Maj+X) ;
// - les questions gardées pour plus tard d'un personnage (« Je ne sais pas encore ») ;
// - les cartes Question ouvertes du canevas ;
// - en mode Atelier, les passages proposés par l'IA et pas encore repris (marque `ia`, champs `ia`, note [[ia]]).
// Chaque ligne renvoie à sa carte ou à sa scène : la tâche vit là où elle se pose.

import type { CardData } from "./types";
import type { Manuscript } from "./manuscript";
import { isSettledQuestion } from "./character";
import { iaPassagesIn } from "./atelier";
import type { Screenplay } from "./screenplay/model";

export type TodoKind = "task" | "revisit" | "question" | "open" | "ia";

export interface Todo {
  kind: TodoKind;
  /** Carte concernée (la scène, pour le manuscrit). */
  cardId: string;
  /** Où vit la tâche : dans la carte, dans le texte du manuscrit, ou dans le scénario (élément d'index `index`). */
  where: "card" | "manuscript" | "screenplay";
  text: string;
  /** Rang de la case dans son texte (pour la cocher d'ici), ou de la question dans la carte. */
  index: number;
  /** Passage de l'IA dans un texte : l'identifiant de sa marque. */
  markId?: string;
  /** Champ de la carte proposé par l'IA (« title », « synopsis », clé de fiche). */
  field?: string;
}

const decode = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "’").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// Une case par balise ouvrante, dans l'ordre du texte : les cases imbriquées (TipTap, `nested`) comptent comme
// les autres. `toggleTask` compte les mêmes balises, donc le n-ième de la liste est bien la n-ième case cochée.
const TASK_TAG_RE = /<li\b([^>]*data-type="taskItem"[^>]*)>/gi;

/** Cases à cocher d'un texte, dans l'ordre, avec leur état (sous-cases comprises). */
export function tasksIn(html: string | undefined): { text: string; done: boolean }[] {
  if (!html) return [];
  return [...html.matchAll(TASK_TAG_RE)].map((m) => {
    const after = html.slice(m.index! + m[0].length);
    // Le texte de la case s'arrête à sa liste de sous-cases, à la case suivante ou à sa fin.
    const end = after.search(/<ul\b|<li\b|<\/li>/i);
    return { text: decode(end === -1 ? after : after.slice(0, end)), done: /data-checked="true"/.test(m[1]) };
  });
}

/** Coche ou décoche la n-ième case d'un texte. Même chaîne si elle n'existe pas. */
export function toggleTask(html: string, index: number): string {
  let i = -1;
  return html.replace(/<li\b([^>]*data-type="taskItem"[^>]*)>/gi, (tag, attrs: string) => {
    i++;
    if (i !== index) return tag;
    const done = /data-checked="true"/.test(attrs);
    const next = /data-checked="(true|false)"/.test(attrs) ? attrs.replace(/data-checked="(true|false)"/, `data-checked="${done ? "false" : "true"}"`) : `${attrs} data-checked="true"`;
    return `<li${next}>`;
  });
}

/** Passages « à reprendre » d'un texte. */
export const revisitsIn = (html: string | undefined) => (html ? [...html.matchAll(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi)].map((m) => decode(m[1])).filter(Boolean) : []);

export function collectTodos(cards: CardData[], manuscript: Manuscript, screenplay?: Screenplay | null): Todo[] {
  const out: Todo[] = [];
  for (const card of cards) {
    tasksIn(card.html).forEach((t, index) => !t.done && t.text && out.push({ kind: "task", cardId: card.id, where: "card", text: t.text, index }));
    (card.questions ?? []).forEach((q, index) => out.push({ kind: "question", cardId: card.id, where: "card", text: q, index }));
    // Une question décidée ou abandonnée (lot 7) n'est plus à faire.
    if (card.type === "question" && !isSettledQuestion(card) && (card.title.trim() || decode(card.html))) out.push({ kind: "open", cardId: card.id, where: "card", text: card.title.trim() || decode(card.html), index: 0 });
  }
  const known = new Set(cards.map((c) => c.id));
  for (const [id, html] of Object.entries(manuscript)) {
    if (!known.has(id)) continue;
    tasksIn(html).forEach((t, index) => !t.done && t.text && out.push({ kind: "task", cardId: id, where: "manuscript", text: t.text, index }));
    revisitsIn(html).forEach((text, index) => out.push({ kind: "revisit", cardId: id, where: "manuscript", text, index }));
  }
  out.push(...iaTodos(cards, manuscript, screenplay));
  return out;
}

/** Passages proposés par l'IA (mode Atelier) et pas encore repris : textes marqués, champs, éléments du scénario. */
export function iaTodos(cards: CardData[], manuscript: Manuscript, screenplay?: Screenplay | null): Todo[] {
  const out: Todo[] = [];
  const known = new Set(cards.map((c) => c.id));
  for (const card of cards) {
    iaPassagesIn(card.html).forEach((p, index) => out.push({ kind: "ia", cardId: card.id, where: "card", text: p.text, index, markId: p.id }));
    (card.ia ?? []).forEach((field, index) => {
      const text = field === "title" ? card.title.trim() : (card.fiche?.[field] ?? "").trim();
      if (text) out.push({ kind: "ia", cardId: card.id, where: "card", text, index, field });
    });
  }
  for (const [id, html] of Object.entries(manuscript)) {
    if (!known.has(id)) continue;
    iaPassagesIn(html).forEach((p, index) => out.push({ kind: "ia", cardId: id, where: "manuscript", text: p.text, index, markId: p.id }));
  }
  // Scénario : l'élément porte la note [[ia]] ; il est rattaché à la carte de sa scène (celle de l'en-tête d'avant).
  let scene = "";
  screenplay?.elements.forEach((el, index) => {
    if (el.type === "sceneHeading") scene = el.cardId ?? "";
    if (el.ia && el.text.trim()) out.push({ kind: "ia", cardId: scene, where: "screenplay", text: el.text.replace(/\s+/g, " ").trim(), index });
  });
  return out;
}
