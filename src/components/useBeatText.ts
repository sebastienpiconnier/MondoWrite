// Nom et aide d'une case du gabarit en place, pour n'importe quelle vue : case d'un gabarit (dans la langue
// de l'interface) ou case de l'auteur (plan du roman, sections du scénario).

import { useCallback, useMemo } from "react";
import { useCosmos } from "../store";
import { useT } from "../i18n";
import { beatText } from "../plan";
import { customOf } from "../screenplay/template";

export function useBeatText(): (key: string) => { label: string; hint: string } {
  const t = useT();
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const planCustom = useCosmos((s) => s.plan.custom);
  const custom = useMemo(() => (kind === "scenario" ? customOf(screenplay?.elements ?? []) : planCustom), [kind, screenplay, planCustom]);
  return useCallback((key: string) => beatText(key, t.plan.beats as Record<string, { label: string; hint: string }>, custom), [t, custom]);
}
