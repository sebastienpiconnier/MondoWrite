// « Pour X, la scène finit » (#171) : le champ `issue` de la fiche d'une scène (mieux, pire, pareil), posé à qui
// raconte la scène. Si la scène a un point de vue (`fiche.pov`, carte Personnage qui existe encore), la question
// devient « Pour Sarah, la scène finit » ; sinon elle reste « Pour le héros ». Même clé dans le fichier : seule la
// personne visée change. Dans l'onglet Scène du Manuscrit et du Scénario, en tête de la carte Scène agrandie (`inline`),
// et dans la fiche (CardSheet).

import { useId } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { CHOICE_FIELDS } from "../character";
import type { CardData } from "../types";

/** Libellé du champ : « Pour Sarah, la scène finit » si la scène a un narrateur, sinon celui de toujours. */
export function useIssueLabel(card: Pick<CardData, "fiche">): string {
  const t = useT();
  const povId = card.fiche?.pov;
  const narrator = useCosmos((s) => {
    if (!povId) return "";
    const node = s.nodes.find((n) => n.id === povId);
    return node && node.data.type === "personnage" ? node.data.title.trim() : "";
  });
  return narrator ? fmt(t.fiche.issueFor, { name: narrator }) : t.fiche.fields.issue;
}

export function SceneIssue({ card, inline }: { card: CardData; /** Libellé et liste sur une ligne (carte agrandie). */ inline?: boolean }) {
  const t = useT();
  const id = useId();
  const label = useIssueLabel(card);
  const value = card.fiche?.issue ?? "";
  return (
    <label className={`scene-issue${inline ? " is-inline" : ""}`} htmlFor={id}>
      <span className="scene-issue-label">{label}</span>
      <select id={id} value={value} onChange={(e) => useCosmos.getState().setFiche(card.id, "issue", e.target.value)}>
        <option value="">{t.fiche.valueNone}</option>
        {CHOICE_FIELDS.issue.map((v) => (
          <option key={v} value={v}>
            {t.fiche.values.issue[v]}
          </option>
        ))}
      </select>
    </label>
  );
}
