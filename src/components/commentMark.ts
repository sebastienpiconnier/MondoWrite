// Marque `comment` du texte des scènes (manuscrit, carte Scène agrandie) : le passage auquel un commentaire est
// attaché (1.13.0, comments.ts). Rendu `<span data-comment="<id>">…</span>`, gardé dans le Markdown (règle turndown de
// storage/markdown.ts), accepté par sanitizeHtml avec un identifiant sûr seulement. Plusieurs commentaires peuvent
// couvrir le même passage. Le surlignage ne vient pas de la marque : la vue colore les seuls commentaires ouverts
// (`commentStyle`), pour qu'un commentaire résolu ou supprimé ailleurs ne laisse pas de passage coloré.

import { Mark, mergeAttributes } from "@tiptap/react";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { nanoid } from "nanoid";
import { isCommentId } from "../comments";
import { sceneAt, type SceneGroup } from "../bookDoc";

export const CommentMark = Mark.create({
  name: "comment",
  // Le texte tapé juste après le passage ne fait pas partie du commentaire.
  inclusive: false,
  // Deux commentaires peuvent se chevaucher.
  excludes: "",
  addAttributes() {
    return {
      id: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => {
          const id = el.getAttribute("data-comment");
          return isCommentId(id) ? id : null;
        },
        renderHTML: (attrs: Record<string, unknown>) => (isCommentId(attrs.id) ? { "data-comment": attrs.id } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment]", getAttrs: (el) => (isCommentId((el as HTMLElement).getAttribute("data-comment")) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "comment-mark" }), 0];
  },
});

export type Commented = { tr: Transaction; id: string; scene: string | null; quote: string } | { error: "empty" | "scene" };

/**
 * Marque la sélection comme passage commenté. `groups` (éditeur du livre) : la sélection doit tenir dans une scène,
 * dont l'identifiant est rendu ; sans `groups` (une seule scène), `scene` vaut null.
 */
export function markComment(state: EditorState, groups?: SceneGroup[]): Commented {
  const { from, to, empty } = state.selection;
  const type = state.schema.marks.comment;
  if (empty || !type) return { error: "empty" };
  let scene: string | null = null;
  if (groups) {
    const g = sceneAt(groups, from);
    if (!g || g !== sceneAt(groups, to - 1) || from < g.markerPos + (state.doc.nodeAt(g.markerPos)?.nodeSize ?? 1)) return { error: "scene" };
    scene = g.id;
  }
  const quote = state.doc.textBetween(from, to, " ", " ").replace(/\s+/g, " ").trim();
  if (!quote) return { error: "empty" };
  const id = nanoid(12);
  return { tr: state.tr.addMark(from, to, type.create({ id })), id, scene, quote };
}

/** Début et fin du passage d'un commentaire dans le document (première et dernière lettre marquées), ou null. */
export function commentRange(doc: PMNode, id: string): { from: number; to: number } | null {
  let from = -1;
  let to = -1;
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    if (node.marks.some((m) => m.type.name === "comment" && m.attrs.id === id)) {
      if (from < 0) from = pos;
      to = pos + node.nodeSize;
    }
  });
  return from < 0 ? null : { from, to };
}

/**
 * Règles CSS du surlignage : seulement les commentaires ouverts (et plus fort pour celui qu'on regarde). Les
 * identifiants sont vérifiés (`isCommentId`) : rien d'autre n'entre dans la feuille.
 */
export function commentStyle(open: readonly string[], focus: string | null): string {
  const ids = open.filter(isCommentId);
  if (ids.length === 0) return "";
  // Roman : le passage marqué ; scénario : l'élément qui porte la note (attribut à plusieurs identifiants).
  const sel = (id: string) => `.comment-mark[data-comment="${id}"],[data-comments~="${id}"]`;
  const rules = [`${ids.map(sel).join(",")}{background:var(--comment-bg);border-bottom:2px solid var(--comment-line);}`];
  if (focus && isCommentId(focus) && ids.includes(focus)) rules.push(`${sel(focus)}{box-shadow:0 0 0 2px var(--comment-line);border-radius:2px;}`);
  // Un élément du scénario (bloc) : un trait à gauche plutôt qu'un soulignement sur toute la largeur.
  rules.push(`[data-comments]{border-bottom:none;}`);
  return rules.join("\n");
}
