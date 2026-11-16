// Le projet ouvert se montre-t-il en roman interactif ? (lot 2) Lu par les composants : tout outil des choix s'y
// branche, pour qu'un roman ou un scénario ordinaire ne voie jamais rien changer.

import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { showsInteractive } from ".";

export function useInteractive(): boolean {
  const meta = useCosmos((s) => s.metaKeep);
  const kind = useCosmos((s) => s.kind);
  const experimental = useSettings((s) => s.experimental);
  return kind !== "scenario" && showsInteractive(meta, experimental);
}
