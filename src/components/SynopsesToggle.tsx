// Volet des scènes du Manuscrit et du Scénario (#58) : le même comportement pour un roman et un scénario. Par défaut
// les titres seuls (plus de scènes visibles d'un coup) ; « Montrer les synopsis » les ajoute sous chaque scène,
// modifiables sur place. Réglage de l'appareil (settings.sceneSynopses), jamais du projet.

import { useT } from "../i18n";
import { useSettings } from "../settings";

export function SynopsesToggle() {
  const m = useT().manuscript;
  const on = useSettings((s) => s.sceneSynopses);
  const set = useSettings((s) => s.setSceneSynopses);
  return (
    <label className="ms-synopses">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      {m.showSynopses}
    </label>
  );
}

/** Synopsis affichés dans le volet des scènes ? */
export const useSceneSynopses = () => useSettings((s) => s.sceneSynopses);
