// « Pour X, la scène finit » (#171) : le champ `issue` de la fiche d'une scène (de beaucoup mieux à beaucoup moins bien),
// posé à qui raconte la scène. Si la scène a un point de vue (`fiche.pov`, carte Personnage qui existe encore), la
// question devient « Pour Sarah, la scène finit » ; sinon elle reste « Pour le héros ». Même clé dans le fichier : seule
// la personne visée change. Dans l'onglet Scène du Manuscrit et du Scénario, en tête de la carte Scène agrandie
// (`inline`), et dans la fiche (CardSheet).
//
// Dessous, « Pour un autre personnage… » (#173) : la même question pour un personnage qui ne raconte pas la scène,
// gardée dans `fiche.issues` (character.ts) et lue seulement par les courbes des Statistiques.

import { useId, useMemo, useState } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { CHOICE_FIELDS, ISSUES_FOR, issuesFor } from "../character";
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

const SEP = "\u0002";
const PART = "\u0001";

/** Personnages du projet en une chaîne stable (sélecteur) : ceux reliés à la scène par un fil d'abord. */
function castKeyOf(s: ReturnType<typeof useCosmos.getState>, sceneId: string): string {
  const linked = new Set<string>();
  for (const e of s.edges) {
    if (e.source === sceneId) linked.add(e.target);
    else if (e.target === sceneId) linked.add(e.source);
  }
  return s.nodes
    .filter((n) => n.data.type === "personnage")
    .map((n) => `${linked.has(n.id) ? "0" : "1"}${PART}${n.id}${PART}${n.data.title.trim()}`)
    .join(SEP);
}

function IssueSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const t = useT();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t.fiche.valueNone}</option>
      {CHOICE_FIELDS.issue.map((v) => (
        <option key={v} value={v}>
          {t.fiche.values.issue[v]}
        </option>
      ))}
    </select>
  );
}

export function SceneIssue({ card, inline }: { card: CardData; /** Libellé et liste sur une ligne (carte agrandie). */ inline?: boolean }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const id = useId();
  const label = useIssueLabel(card);
  const value = card.fiche?.issue ?? "";
  const castKey = useCosmos((s) => castKeyOf(s, card.id));
  // Personnage choisi dans « Pour un autre personnage… », pas encore de réponse (rien n'est écrit tant qu'on n'a pas choisi).
  const [pending, setPending] = useState<string | null>(null);
  const others = card.fiche?.[ISSUES_FOR];
  const pov = card.fiche?.pov ?? "";

  const cast = useMemo(() => {
    const list = castKey
      ? castKey.split(SEP).map((row) => {
          const [rank, cid, title] = row.split(PART);
          return { id: cid, title: title || t.fiche.issueUntitled, linked: rank === "0" };
        })
      : [];
    return list.sort((a, b) => Number(b.linked) - Number(a.linked) || a.title.localeCompare(b.title, lang));
  }, [castKey, lang, t.fiche.issueUntitled]);
  const names = useMemo(() => new Map(cast.map((c) => [c.id, c.title])), [cast]);

  // Réponses montrées : celles des personnages qui existent encore, sauf le narrateur (la question principale est la sienne).
  const answered = useMemo(() => [...issuesFor(others)].filter(([cid]) => cid !== pov && names.has(cid)), [others, pov, names]);
  const rows: { id: string; value: string }[] = answered.map(([cid, v]) => ({ id: cid, value: v }));
  if (pending && pending !== pov && names.has(pending) && !rows.some((r) => r.id === pending)) rows.push({ id: pending, value: "" });
  const shown = new Set(rows.map((r) => r.id));
  const choices = cast.filter((c) => c.id !== pov && !shown.has(c.id));

  const setFor = (characterId: string, next: string) => {
    useCosmos.getState().setIssueFor(card.id, characterId, next);
    if (characterId === pending) setPending(null);
  };

  return (
    <div className={`scene-issues${inline ? " is-inline" : ""}`}>
      <label className={`scene-issue${inline ? " is-inline" : ""}`} htmlFor={id}>
        <span className="scene-issue-label">{label}</span>
        <IssueSelect id={id} value={value} onChange={(v) => useCosmos.getState().setFiche(card.id, "issue", v)} />
      </label>
      {rows.map((row) => {
        const name = names.get(row.id) ?? "";
        const rowId = `${id}-${row.id}`;
        return (
          <div key={row.id} className={`scene-issue is-other${inline ? " is-inline" : ""}`}>
            <label className="scene-issue-label" htmlFor={rowId}>
              {fmt(t.fiche.issueFor, { name })}
            </label>
            <span className="scene-issue-row">
              <IssueSelect id={rowId} value={row.value} onChange={(v) => setFor(row.id, v)} />
              <button
                type="button"
                className="icon-button scene-issue-remove"
                aria-label={fmt(t.fiche.issueRemove, { name })}
                title={fmt(t.fiche.issueRemove, { name })}
                onClick={() => (row.value ? setFor(row.id, "") : setPending(null))}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
                </svg>
              </button>
            </span>
          </div>
        );
      })}
      {choices.length > 0 && (
        <select
          className="scene-issue-add"
          value=""
          aria-label={t.fiche.issueOther}
          title={t.fiche.issueOtherHint}
          onChange={(e) => {
            const pick = e.target.value;
            if (!pick) return;
            setPending(pick);
            // La liste de la nouvelle ligne reçoit le focus : on répond tout de suite, au clavier comme au doigt.
            requestAnimationFrame(() => document.getElementById(`${id}-${pick}`)?.focus());
          }}
        >
          <option value="">{t.fiche.issueOther}</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
