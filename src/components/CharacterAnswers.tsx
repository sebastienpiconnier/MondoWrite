// Réponses aux questions de l'assistant qui ne remplissent pas un champ de la fiche. Repliées par défaut
// (« Réponses aux questions (12) ») pour ne pas envahir la fiche ; chacune se relit et se modifie sur place.
// Elles vivent dans la carte (`reponses`), pas dans son texte.

import { useId, useMemo, useState } from "react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { allQuestionTexts, isInterviewKey, questionText } from "../assistant";
import type { CardData } from "../types";

export function CharacterAnswers({ card }: { card: CardData }) {
  const all = useT();
  const t = all.character;
  const [open, setOpen] = useState(false);
  const id = useId();
  const texts = useMemo(() => allQuestionTexts(all.assistant), [all]);
  const entries = Object.entries(card.reponses ?? {});
  if (entries.length === 0) return null;
  const setReponse = useCosmos.getState().setReponse;
  return (
    <section className="sheet answers" aria-label={t.answers}>
      <button type="button" className="sheet-toggle" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen(!open)}>
        <span>{t.answers}</span>
        <span className="sheet-count">{fmt(t.answersCount, { n: entries.length })}</span>
        <span aria-hidden="true" className="sheet-chevron">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id={`${id}-list`} className="answers-list">
          {entries.map(([key, value]) => {
            const question = questionText(key, texts);
            return (
              <div key={key} className="sheet-field answer-item">
                <label htmlFor={`${id}-${key}`}>
                  {question}
                  {/* Réponse de « Interroger le personnage » : dite par lui, gardée par l'auteur. */}
                  {isInterviewKey(key) && <span className="answer-tag"> · {all.interrogate.answerTag}</span>}
                </label>
                <textarea id={`${id}-${key}`} rows={1} value={value} onChange={(e) => setReponse(card.id, key, e.target.value)} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
