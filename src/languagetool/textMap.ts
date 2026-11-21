// Texte d'une partie du document ProseMirror, envoyé à LanguageTool, et retour des positions du texte vers le
// document. Fonctions pures.
//
// Un bloc de texte par paragraphe, séparés par une ligne vide (LanguageTool y voit des paragraphes) ; un saut de
// ligne devient « \n » ; un atome en ligne (appel de note, image) ne compte pour rien, pour ne pas couper un mot.

import type { Node as PMNode } from "@tiptap/pm/model";

/** Un morceau de texte du document : sa place dans le texte envoyé et dans le document. */
export interface TextSegment {
  offset: number;
  pos: number;
  length: number;
}

export interface MappedText {
  text: string;
  segments: TextSegment[];
}

/**
 * Texte des blocs compris entre `from` et `to`. `accept` écarte un bloc (dans un scénario : en-têtes de scène,
 * noms des personnages, transitions, qui seraient tous soulignés).
 */
export function collectText(doc: PMNode, from: number, to: number, accept?: (block: PMNode) => boolean): MappedText {
  let text = "";
  const segments: TextSegment[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (accept && !accept(node)) return false;
    let started = false;
    node.forEach((child, off) => {
      const at = pos + 1 + off;
      if (child.isText) {
        const start = Math.max(at, from);
        const end = Math.min(at + child.nodeSize, to);
        if (end <= start) return;
        if (!started && text) text += "\n\n";
        started = true;
        segments.push({ offset: text.length, pos: start, length: end - start });
        text += child.text!.slice(start - at, end - at);
      } else if (child.type.name === "hardBreak" && started) {
        text += "\n";
      }
    });
    return false;
  });
  return { text, segments };
}

/** Segment qui contient le caractère `offset` (recherche dichotomique, les segments sont dans l'ordre). */
function segmentAt(segments: TextSegment[], offset: number): TextSegment | null {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid];
    if (offset < s.offset) hi = mid - 1;
    else if (offset >= s.offset + s.length) lo = mid + 1;
    else return s;
  }
  return null;
}

/** Étendue du document d'un passage du texte envoyé ; null s'il tombe hors du texte du document. */
export function toRange(mapped: MappedText, offset: number, length: number): { from: number; to: number } | null {
  if (length <= 0) return null;
  const first = segmentAt(mapped.segments, offset);
  const last = segmentAt(mapped.segments, offset + length - 1);
  if (!first || !last) return null;
  return { from: first.pos + (offset - first.offset), to: last.pos + (offset + length - 1 - last.offset) + 1 };
}
