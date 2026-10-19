// Le manuscrit comme un seul document, mis en pages comme un livre ou un fichier Word.
// Chaque scène reste un fichier à part (manuscrit/<id>.md) ; à l'écran, elles se suivent dans un seul éditeur,
// séparées par un repère (nœud « sceneMark ») qui porte l'identifiant de la scène, l'ouverture d'un chapitre
// ou le genre de page (titre, dédicace…). Fonctions pures : composer le document, le redécouper en scènes.

import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { chapterNumbers, chapterOf, type Plan } from "./plan";
import { isPageKind, type PageKind } from "./book";
import { isBlank } from "./manuscript";
import type { CardData } from "./types";

export const SCENE_MARK = "sceneMark";

export interface BookBlock {
  id: string;
  /** Chapitre ouvert par cette scène (titre et numéro au-dessus du texte), sinon null. */
  chapter: { id: string; n: number; title: string } | null;
  /** Page hors récit (titre, dédicace, prologue…), sinon null. */
  page: PageKind | null;
  /** Commence toujours une nouvelle page : début de chapitre, page hors récit, scène qui suit une telle page. */
  newPage: boolean;
  /** Séparateur « * * * » : scène qui en suit une autre dans le même chapitre. */
  breakBefore: boolean;
}

/** Les scènes dans l'ordre de lecture, avec ce qui les distingue dans le livre. */
export function bookBlocks(order: string[], cards: CardData[], plan: Plan): BookBlock[] {
  const numbers = chapterNumbers(plan, order);
  let previous: string | null | undefined;
  let previousPage = false;
  return order.map((id, i) => {
    const card = cards.find((c) => c.id === id);
    const page = card && isPageKind(card.page) ? card.page : null;
    const chapter = page ? undefined : chapterOf(plan, id);
    const opens = !!chapter && chapter.id !== previous;
    const breakBefore = i > 0 && !page && !previousPage && !opens && (chapter?.id ?? null) === (previous ?? null);
    const newPage = i > 0 && (opens || !!page || previousPage);
    const block: BookBlock = {
      id,
      chapter: opens && chapter ? { id: chapter.id, n: numbers.get(chapter.id) ?? 0, title: chapter.title } : null,
      page,
      newPage,
      breakBefore,
    };
    previous = page ? null : (chapter?.id ?? null);
    previousPage = !!page;
    return block;
  });
}

/** Change quand la structure du livre change (ordre, chapitres, pages hors récit), pas quand on écrit ni quand un titre de chapitre change. */
export const structureSignature = (blocks: BookBlock[]) =>
  blocks.map((b) => [b.id, b.chapter ? `${b.chapter.id}:${b.chapter.n}` : "", b.page ?? "", b.newPage ? 1 : 0, b.breakBefore ? 1 : 0].join("|")).join(";");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** HTML du livre entier : un repère par scène, suivi du texte de la scène (au moins un paragraphe, pour pouvoir y écrire). */
export function composeBook(blocks: BookBlock[], manuscript: Record<string, string>): string {
  return blocks
    .map((b) => {
      const attrs = [
        `data-scene-mark="1"`,
        `data-scene="${esc(b.id)}"`,
        b.chapter ? `data-chapter-id="${esc(b.chapter.id)}" data-chapter-n="${b.chapter.n}" data-chapter-title="${esc(b.chapter.title)}"` : "",
        b.page ? `data-page="${b.page}"` : "",
        b.newPage ? `data-new-page="1"` : "",
        b.breakBefore ? `data-break="1"` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const html = manuscript[b.id];
      return `<div ${attrs}></div>${html && !isBlank(html) ? html : "<p></p>"}`;
    })
    .join("");
}

export interface SceneGroup {
  id: string;
  /** Position du repère dans le document. */
  markerPos: number;
  /** Fin du texte de la scène (début du repère suivant, ou fin du document). */
  end: number;
  /** Indices (au premier niveau) du premier bloc de texte et du repère suivant. */
  first: number;
  last: number;
}

/** Les scènes du document : où commence chaque repère et où finit son texte. */
export function sceneGroups(doc: PMNode): SceneGroup[] {
  const groups: SceneGroup[] = [];
  let open: SceneGroup | null = null;
  doc.forEach((node, offset, index) => {
    if (node.type.name === SCENE_MARK) {
      if (open) {
        open.end = offset;
        open.last = index;
      }
      open = { id: String(node.attrs.id), markerPos: offset, end: doc.content.size, first: index + 1, last: doc.childCount };
      groups.push(open);
    }
  });
  return groups;
}

/** La scène où se trouve une position du document (celle dont le repère précède). */
export function sceneAt(groups: SceneGroup[], pos: number): SceneGroup | null {
  let found: SceneGroup | null = null;
  for (const g of groups) {
    if (g.markerPos <= pos) found = g;
    else break;
  }
  return found;
}

/** Étendue du document touchée par une transaction (positions du document d'arrivée), ou null si rien n'a bougé. */
export function changedRange(tr: Transaction): { from: number; to: number } | null {
  let from = Infinity;
  let to = -Infinity;
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_a, _b, start, end) => {
      from = Math.min(from, rest.map(start, -1));
      to = Math.max(to, rest.map(end, 1));
    });
  });
  return from === Infinity ? null : { from, to };
}
