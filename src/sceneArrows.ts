// Fils entre deux cartes Scène d'un roman ou d'un scénario : dessinés en flèches, comme les choix du roman interactif
// (orientés de la carte d'où le fil a été tiré vers celle où il arrive). C'est un affichage : rien n'est enregistré,
// le fil reste un fil ordinaire dans cosmos.json.

import { MarkerType, type Edge } from "@xyflow/react";
import type { CardData } from "./types";
import { setupOf } from "./setups";

/** Classe des fils dessinés en flèche (canvas.css). */
export const SCENE_ARROW_CLASS = "scene-arrow";

/** Identifiants des cartes Scène, en une chaîne stable : les cartes bougent sans cesse, la liste change rarement. */
export function sceneIdsKey(nodes: readonly { id: string; type?: string; data: unknown }[]): string {
  const ids: string[] = [];
  for (const n of nodes) if (n.type === "card" && (n.data as CardData).type === "scene") ids.push(n.id);
  return ids.sort().join(" ");
}

/** Les fils dont les deux bouts sont des scènes reçoivent une pointe de flèche et le trait des choix. Rend le même
 *  tableau quand aucun fil ne relie deux scènes (pur). */
//  Un fil qui prépare (#119) va toujours de la scène qui prépare vers celle qui paie : la pointe est au départ du fil
//  quand il a été tiré dans l'autre sens, et un fil sans étiquette prend le libellé `prepares`.
export function withSceneArrows<E extends Edge>(edges: E[], scenes: ReadonlySet<string>, prepares = ""): E[] {
  if (scenes.size < 2) return edges;
  let changed = false;
  const out = edges.map((e) => {
    if (!scenes.has(e.source) || !scenes.has(e.target)) return e;
    changed = true;
    const setup = setupOf(e as { id: string; source: string; target: string; data?: Record<string, unknown> });
    const marker = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "var(--accent)" };
    const backward = setup !== null && setup === e.target;
    return {
      ...e,
      className: [e.className, SCENE_ARROW_CLASS, setup ? "is-setup" : ""].filter(Boolean).join(" "),
      ...(backward ? { markerStart: { ...marker, orient: "auto-start-reverse" }, markerEnd: undefined } : { markerEnd: marker }),
      ...(setup && prepares && !String(e.label ?? "").trim() ? { label: prepares } : {}),
      style: { ...e.style, stroke: "var(--accent)", strokeWidth: 1.8 },
    };
  });
  return changed ? out : edges;
}
