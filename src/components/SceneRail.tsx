// Scène en cours, visible sans dépendre de la couleur (#156) : un trait discret dans la marge, le long des blocs
// de la scène où est le curseur, dans la feuille du scénario et la page du manuscrit. Un simple dessin posé sur
// la page (rien dans le document ni dans le fichier, jamais imprimé), absent en mode focus. Coupé en morceaux là
// où la scène passe d'une page à l'autre : le trait ne traverse jamais l'espace entre deux pages.

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";

/** Écart vertical au-delà duquel deux blocs ne se suivent plus sur la même page (saut de page). */
const PAGE_GAP = 48;
/** Distance du trait au bord gauche du texte, en px. */
const OFFSET = 18;

export interface RailSegment {
  top: number;
  height: number;
}

/**
 * Morceaux du trait (pur) : blocs mesurés (haut et bas) regroupés tant que l'écart qui les sépare reste celui d'un
 * interligne ; un écart plus grand (saut de page) commence un autre morceau.
 */
export function railSegments(boxes: readonly { top: number; bottom: number }[], gap = PAGE_GAP): RailSegment[] {
  const out: RailSegment[] = [];
  let cur: { top: number; bottom: number } | null = null;
  for (const b of boxes) {
    if (b.bottom <= b.top) continue;
    if (cur && b.top - cur.bottom <= gap) cur.bottom = Math.max(cur.bottom, b.bottom);
    else {
      if (cur) out.push({ top: cur.top, height: cur.bottom - cur.top });
      cur = { top: b.top, bottom: b.bottom };
    }
  }
  if (cur) out.push({ top: cur.top, height: cur.bottom - cur.top });
  return out;
}

/** Rangs [début, fin) des blocs de premier niveau de la scène en cours, lus dans le document ; null s'il n'y en a pas. */
export type SceneRange = (doc: PMNode, head: number) => [number, number] | null;

/** Scénario : de l'en-tête de la scène du curseur à la scène ou à la section suivante. */
export const screenplayRange: SceneRange = (doc, head) => {
  if (doc.childCount === 0) return null;
  const at = doc.resolve(Math.min(head, doc.content.size)).index(0);
  let start = -1;
  for (let i = Math.min(at, doc.childCount - 1); i >= 0; i--) {
    const n = doc.child(i);
    if (n.type.name === "sceneHeading") {
      start = i;
      break;
    }
    // Une section avant tout en-tête : le curseur n'est dans aucune scène.
    if (n.attrs.kind === "section") return null;
  }
  if (start === -1) return null;
  let end = start + 1;
  while (end < doc.childCount && doc.child(end).type.name !== "sceneHeading" && doc.child(end).attrs.kind !== "section") end++;
  return [start, end];
};

/** Manuscrit : les blocs qui suivent le repère de la scène `id`, jusqu'au repère suivant. */
export const bookRange =
  (id: string, mark: string): SceneRange =>
  (doc) => {
    let start = -1;
    for (let i = 0; i < doc.childCount; i++) {
      const n = doc.child(i);
      if (n.type.name !== mark) continue;
      if (start !== -1) return start + 1 < i ? [start + 1, i] : null;
      if (String(n.attrs.id) === id) start = i;
    }
    return start !== -1 && start + 1 < doc.childCount ? [start + 1, doc.childCount] : null;
  };

/** Le trait de la scène en cours, posé dans `container` (la page, en position relative). */
export function SceneRail({ editor, range, container, enabled }: { editor: Editor | null; range: SceneRange; container: () => HTMLElement | null; enabled: boolean }) {
  const [rail, setRail] = useState<{ left: number; segments: RailSegment[] } | null>(null);

  useEffect(() => {
    if (!editor || !enabled) return void setRail(null);
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const { view } = editor;
      const box = container();
      const r = range(view.state.doc, view.state.selection.head);
      if (!box || !r) return setRail(null);
      const base = box.getBoundingClientRect();
      const boxes: { top: number; bottom: number }[] = [];
      let pos = 0;
      for (let i = 0; i < r[1] && i < view.state.doc.childCount; i++) {
        const node = view.state.doc.child(i);
        if (i >= r[0]) {
          const dom = view.nodeDOM(pos);
          if (dom instanceof HTMLElement) {
            const b = dom.getBoundingClientRect();
            boxes.push({ top: b.top - base.top, bottom: b.bottom - base.top });
          }
        }
        pos += node.nodeSize;
      }
      const root = view.dom.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(view.dom).paddingLeft) || 0;
      const segments = railSegments(boxes);
      const left = Math.max(2, root.left + pad - base.left - OFFSET);
      setRail(segments.length > 0 ? { left, segments } : null);
    };
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    later();
    editor.on("transaction", later);
    const resize = new ResizeObserver(later);
    resize.observe(editor.view.dom);
    window.addEventListener("resize", later);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      editor.off("transaction", later);
      resize.disconnect();
      window.removeEventListener("resize", later);
    };
  }, [editor, enabled, range, container]);

  if (!rail) return null;
  return (
    <>
      {rail.segments.map((s, i) => (
        <div key={i} className="scene-rail" aria-hidden="true" style={{ top: s.top, height: s.height, left: rail.left }} />
      ))}
    </>
  );
}
