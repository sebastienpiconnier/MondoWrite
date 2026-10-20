// Les scènes du document de l'éditeur de scénario, sous la même forme que celles du livre (voir bookDoc.ts) :
// c'est ce qui permet au Chutier de retirer et de remettre un passage dans un scénario.

import type { Node as PMNode } from "@tiptap/pm/model";
import type { SceneGroup } from "../bookDoc";

/** Une scène commence à son en-tête et finit avant le suivant. Sans carte, elle est repérée par son rang. */
export function screenplayGroups(doc: PMNode): SceneGroup[] {
  const groups: SceneGroup[] = [];
  let rank = 0;
  doc.forEach((node, offset, index) => {
    if (node.type.name === "sceneHeading") {
      const id = (node.attrs.cardId as string | null) || `scene-${rank}`;
      rank++;
      groups.push({ id, markerPos: offset, end: offset + node.nodeSize, first: index + 1, last: index + 1 });
    } else if (groups.length > 0) {
      const g = groups[groups.length - 1];
      g.end = offset + node.nodeSize;
      g.last = index + 1;
    }
  });
  return groups;
}
