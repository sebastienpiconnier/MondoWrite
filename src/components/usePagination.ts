// Estimation des pages du scénario courant, recalculée quand le texte ou le format de page change.

import { useMemo } from "react";
import { currentScript, useCosmos } from "../store";
import { LAYOUTS } from "../screenplay/layout";
import { paginate, type Pagination } from "../screenplay/paginate";

/** `whole` : tout le scénario (séquencier, couverture) ; sinon l'épisode ouvert d'une série (vue Scénario). */
export function usePagination(whole = false): Pagination | null {
  const screenplay = useCosmos((s) => (whole ? s.screenplay : currentScript(s)));
  const paper = useCosmos((s) => s.paper);
  return useMemo(() => (screenplay ? paginate(screenplay.elements, LAYOUTS[paper]) : null), [screenplay, paper]);
}

/** Une page ≈ une minute. Au moins une minute dès qu'il y a du texte. */
export const minutesFor = (pages: number): number => (pages > 0 ? Math.max(1, Math.round(pages)) : 0);
