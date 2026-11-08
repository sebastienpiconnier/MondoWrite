// Longueur d'une scène en huitièmes de page (#44) : « 1 2/8 p. » à l'écran, en toutes lettres pour un lecteur d'écran.

import { useMemo } from "react";
import { useCosmos } from "../store";
import { eighthsByCard, formatEighths } from "../screenplay/eighths";
import { fmt, useT } from "../i18n";
import { usePagination } from "./usePagination";

/** Huitièmes de chaque scène du scénario entier, par identifiant de carte Scène. */
export function useSceneEighths(): Map<string, number> {
  const screenplay = useCosmos((s) => s.screenplay);
  const pagination = usePagination(true);
  return useMemo(() => (screenplay && pagination ? eighthsByCard(screenplay.elements, pagination) : new Map<string, number>()), [screenplay, pagination]);
}

/** `template` reçoit la longueur écrite (« 1 2/8 ») ; par défaut « {n} p. ». Rien pour une scène vide. */
export function SceneLength({ eighths, template, className }: { eighths: number; template?: string; className?: string }) {
  const t = useT();
  const sp = t.screenplay;
  if (!(eighths > 0)) return null;
  return (
    <span className={className}>
      <span aria-hidden="true">{fmt(template ?? sp.lengthShort, { n: formatEighths(eighths) })}</span>
      <span className="sr-only">{eighths === 1 ? sp.eighthsOne : fmt(sp.eighthsMany, { n: eighths })}</span>
    </span>
  );
}
