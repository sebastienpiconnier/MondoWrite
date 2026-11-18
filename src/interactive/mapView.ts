// « Voir sur la carte des choix » (onglet « Vérifier », lot 5) : depuis le lot 11 (#91), la carte des choix est le
// canevas. La scène y est montrée et mise en avant ; sans scène, le canevas s'ouvre.

import { useCosmos } from "../store";

export function showOnChoiceMap(focus: string | null = null) {
  const store = useCosmos.getState();
  if (focus && store.nodes.some((n) => n.id === focus)) store.revealCard(focus);
  else store.setView("toile");
}
