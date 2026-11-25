// Numéro de chaque scène sur sa carte du canevas : celui du scénario (numéro écrit `#12A#`, sinon le rang de
// l'en-tête), ou le rang dans l'ordre du récit pour un roman. Lu, jamais écrit ; gardé tant que cartes, plan et
// scénario ne changent pas.

import { listScenes } from "./screenplay/scenes";
import { junctionOrder } from "./projectJunctions";
import type { CosmosState } from "./store";

type Source = Pick<CosmosState, "kind" | "nodes" | "plan" | "screenplay">;

let cache: { nodes: unknown; plan: unknown; screenplay: unknown; kind: unknown; map: Map<string, string> } | null = null;

export function sceneNumbers(s: Source): Map<string, string> {
  const c = cache;
  if (c && c.nodes === s.nodes && c.plan === s.plan && c.screenplay === s.screenplay && c.kind === s.kind) return c.map;
  const map = new Map<string, string>();
  if (s.kind === "scenario") {
    const els = s.screenplay?.elements ?? [];
    for (const sc of listScenes(els)) if (sc.cardId && !map.has(sc.cardId)) map.set(sc.cardId, els[sc.index]?.sceneNumber || String(sc.number));
  } else {
    junctionOrder(s.kind, s.nodes, s.plan, s.screenplay).forEach((id, k) => map.set(id, String(k + 1)));
  }
  cache = { nodes: s.nodes, plan: s.plan, screenplay: s.screenplay, kind: s.kind, map };
  return map;
}
