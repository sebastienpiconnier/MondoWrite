// Statut d'une scène (brouillon, à revoir, terminée) : une pastille de couleur et un menu déroulant natif
// (souris, doigt, clavier). Il vit dans la fiche de la carte (`fiche.statut`), le même partout : carte,
// carte agrandie, Bible, Plan, séquencier, Manuscrit.

import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { SCENE_STATUSES, sceneStatus } from "../character";
import type { CardData } from "../types";

/** Pastille seule, pour les listes de scènes. */
export function StatusDot({ card }: { card: CardData }) {
  const t = useT().sceneStatus;
  const status = sceneStatus(card);
  if (!status) return null;
  return <span className={`status-dot is-${status}`} title={t.values[status]} aria-label={t.values[status]} role="img" />;
}

export function SceneStatusPicker({ card, className = "" }: { card: CardData; className?: string }) {
  const t = useT().sceneStatus;
  const status = sceneStatus(card);
  const title = card.title.trim() || useT().manuscript.untitled;
  return (
    <label className={`status-picker nodrag${status ? ` is-${status}` : ""} ${className}`}>
      <span className="status-dot" aria-hidden="true" />
      <span className="sr-only">{fmt(t.chooseFor, { title })}</span>
      <select value={status ?? ""} onChange={(e) => useCosmos.getState().setFiche(card.id, "statut", e.target.value)}>
        <option value="">{t.none}</option>
        {SCENE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t.values[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
