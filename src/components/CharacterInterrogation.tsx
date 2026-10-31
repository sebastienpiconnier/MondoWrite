// « Interroger le personnage » (onglet de l'assistant, seulement si un service d'IA est branché) : l'auteur pose
// ses questions, le personnage répond à la première personne avec ce que l'auteur a écrit de lui, rien de plus.
// La conversation est un état d'affichage (gardée par CharacterAssistant le temps que la fiche est ouverte) ;
// seule une réponse gardée (« Garder ») entre dans le projet, dans `reponses` sous la clé `i:<question>`.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import type { CardData } from "../types";
import { allQuestionTexts, interviewKey } from "../assistant";
import { bookOrder } from "../book";
import { AiError, aiErrorText, complete, isReady } from "../ai/providers";
import { INTERROGATE_TOKENS, QUESTION_MAX, interrogatePrompt, knownText, novelPassages, parseInterrogation, screenplayPassages, type Exchange } from "../ai/interrogate";

/** Un échange affiché : la question, la réponse relue, et les noms qu'aucun texte du projet ne contient. */
export interface ShownExchange extends Exchange {
  unknown: string[];
}

export function CharacterInterrogation({ card, log, setLog }: { card: CardData; log: ShownExchange[]; setLog: (next: ShownExchange[]) => void }) {
  const all = useT();
  const t = all.interrogate;
  const aiSettings = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(aiSettings), [aiSettings]);
  const lang = useSettings((s) => s.lang);
  const keep = useCosmos((s) => s.keepInterviewAnswer);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const id = useId();
  const name = card.title.trim();

  /** Pose la question : tout est relu dans le store au moment de l'envoi (la fiche a pu changer). */
  const ask = async () => {
    const asked = question.replace(/\s+/g, " ").trim().slice(0, QUESTION_MAX);
    if (!asked || busy || !isReady(config) || !name) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    try {
      const s = useCosmos.getState();
      const cards = s.nodes.map((n) => n.data);
      const self = cards.find((c) => c.id === card.id) ?? card;
      const scenes =
        s.kind === "scenario" ? (s.screenplay ? screenplayPassages(self, s.screenplay.elements) : []) : novelPassages(self, s.manuscript, bookOrder(s.nodes, s.plan), cards);
      const links = s.edges.map((e) => ({ source: e.source, target: e.target, label: String(e.label ?? "") }));
      const prompt = interrogatePrompt(self, cards, links, log, asked, {
        lang,
        kind: s.kind,
        questions: allQuestionTexts(all.assistant),
        fieldLabels: all.character.fields,
        arcLabels: all.character.arcTypes,
        scenes,
      });
      const reply = await complete(config, prompt.system, prompt.user, { maxTokens: INTERROGATE_TOKENS, signal: controller.signal });
      const read = parseInterrogation(reply, self, `${knownText(prompt, cards)} ${asked}`);
      if (!read.text) throw new AiError("empty");
      setLog([...log, { question: asked, answer: read.text, unknown: read.unknown }]);
      setQuestion("");
    } catch (err) {
      console.error(err);
      setError(aiErrorText(err, all.ai.errors));
    } finally {
      setBusy(false);
    }
  };

  // Gardée : la réponse est déjà dans `reponses` sous la clé de sa question (l'annulation la fait redevenir « à garder »).
  const isKept = (e: Exchange) => (card.reponses?.[interviewKey(e.question)] ?? "").split("\n").some((l) => l.trim() === e.answer.trim());

  if (!name) return <p className="assistant-hint">{t.noName}</p>;

  return (
    <div className="interrogate">
      <p className="assistant-hint">{fmt(t.hint, { name })}</p>
      {log.length > 0 && (
        <ol className="interrogate-log" aria-live="polite">
          {log.map((e, i) => {
            const kept = isKept(e);
            return (
              <li key={i}>
                <p className="interrogate-q">
                  <span className="interrogate-who">{t.you}</span> {e.question}
                </p>
                <p className="interrogate-a">
                  <span className="interrogate-who">{name}</span> {e.answer}
                </p>
                {e.unknown.length > 0 && <p className="interrogate-warn">{fmt(t.unknownName, { names: e.unknown.join(", ") })}</p>}
                <div className="assistant-actions">
                  {/* Gardée : un état écrit en clair, pas un bouton grisé (contraste trop faible pour un état). */}
                  {kept ? (
                    <span className="interrogate-kept">✓ {t.kept}</span>
                  ) : (
                    <button
                      type="button"
                      aria-label={fmt(t.keepAria, { question: e.question })}
                      onClick={() => {
                        keep(card.id, e.question, e.answer);
                        setSaid(t.keptSaid);
                      }}
                    >
                      {t.keep}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label className="assistant-question interrogate-label" htmlFor={`${id}-q`}>
          {fmt(t.label, { name })}
        </label>
        <textarea
          id={`${id}-q`}
          rows={2}
          value={question}
          maxLength={QUESTION_MAX}
          placeholder={t.placeholder}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            // Entrée envoie (Maj+Entrée va à la ligne), jamais pendant une saisie composée (accents, IME).
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <div className="assistant-actions">
          <button type="submit" className="is-primary" disabled={busy || !question.trim()}>
            {busy ? all.ai.working : t.ask}
          </button>
          {busy && (
            <button type="button" onClick={() => abortRef.current?.abort()}>
              {all.ai.cancel}
            </button>
          )}
          {log.length > 0 && !busy && (
            <button type="button" onClick={() => setLog([])}>
              {t.restart}
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      <p className="interrogate-note">{t.ephemeral}</p>
      <div className="sr-only" aria-live="polite">
        {said}
      </div>
    </div>
  );
}
