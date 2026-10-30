// « Questionner » sur la couverture du projet (Bible v2) : une question à la fois pour chaque champ vide de la
// couverture (logline, résumé, note d'intention… et, pour une série, « Écrire la série »). Comme l'assistant
// personnage : la question est posée, l'auteur écrit, sa réponse va telle quelle dans le champ. Rien n'est
// proposé ni généré. « Une autre » passe la question pour cette fois (état d'affichage, jamais enregistré).

import { useEffect, useId, useRef, useState } from "react";
import { useCosmos } from "../store";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { formOf, nextAsk } from "../pitch";
import { pitchLabels } from "../feasibility";

export function CoverAssistant() {
  const { t, kind } = useVocab();
  const p = t.pitch;
  const pitch = useCosmos((s) => s.pitch);
  const setPitch = useCosmos((s) => s.setPitch);
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const id = useId();
  const answerRef = useRef<HTMLTextAreaElement>(null);
  // Les questions suivent la forme du projet : celles d'un film pour un long métrage, d'une série sinon.
  const form = formOf(kind, pitch);
  const labels = pitchLabels(p, form);
  const field = nextAsk(pitch, kind, skipped, form);

  useEffect(() => {
    if (open) answerRef.current?.focus();
  }, [open, field]);

  if (!open)
    return (
      <button type="button" className="ghost-button cover-ask" aria-label={p.askAria} onClick={() => setOpen(true)}>
        {p.ask}
      </button>
    );

  return (
    <section className="cover-asker" aria-labelledby={`${id}-title`}>
      <div className="cover-asker-head">
        <h3 id={`${id}-title`} className="eyebrow">
          {p.askTitle}
        </h3>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          {p.askClose}
        </button>
      </div>
      {field ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setPitch(field, draft.trim());
            setDraft("");
          }}
        >
          <label className="cover-asker-question" htmlFor={`${id}-answer`}>
            {labels.questions[field]}
          </label>
          <textarea id={`${id}-answer`} ref={answerRef} rows={3} value={draft} placeholder={p.askAnswer} onChange={(e) => setDraft(e.target.value)} />
          <p className="pitch-hint">{fmt(p.askGoesTo, { field: labels.fields[field] })}</p>
          <div className="cover-asker-actions">
            <button type="submit" className="ghost-button is-primary" disabled={!draft.trim()}>
              {p.askSave}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setDraft("");
                setSkipped([...skipped.filter((k) => k !== field), field]);
              }}
            >
              {p.askSkip}
            </button>
          </div>
        </form>
      ) : (
        <p className="pitch-hint">{p.askDone}</p>
      )}
    </section>
  );
}
