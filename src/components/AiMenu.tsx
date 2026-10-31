// Bouton « IA » de la barre du haut, présent seulement si l'auteur a branché un service dans les Réglages.
// Deux actions, qui proposent sans rien changer d'elles-mêmes : « Ranger les idées » (un type pour les
// idées en vrac) et « Vérifier la cohérence » (contradictions possibles, sous forme de questions).
// Et « Organiser le canevas », qui range ensuite toutes les cartes en cadres (sans IA, annulable).
// L'auteur applique, ignore, ou garde une question pour plus tard.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { typeColor } from "../types";
import { aiErrorText, complete, isReady } from "../ai/providers";
import { plainText } from "../search";
import { headingOf, sceneBody, sceneText } from "../screenplay/sceneText";
import { sceneSynopsis } from "../screenplay/scenes";
import { allQuestionTexts } from "../assistant";
import { coherencePrompt, parseCoherence, type CardNames, parseTidy, tidyCandidates, tidyPrompt, type CoherenceAlert, type TidySuggestion } from "../ai/tasks";

type Result = { kind: "tidy"; items: TidySuggestion[] } | { kind: "coherence"; items: CoherenceAlert[] } | null;

export function AiMenu() {
  const { t: all, types, kind } = useVocab();
  const t = useT().ai;
  const aiSettings = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(aiSettings), [aiSettings]);
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const updateCard = useCosmos((s) => s.updateCard);
  const revealCard = useCosmos((s) => s.revealCard);
  const addQuestionAbout = useCosmos((s) => s.addQuestionAbout);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Result>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!isReady(config)) return null;

  // Une carte citée dans un texte de l'IA : « Titre (type) », jamais son identifiant.
  const names: CardNames = { type: (type) => types[type].label.toLocaleLowerCase(lang), untitled: all.bible.untitled };
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.data.title.trim() || all.bible.untitled;

  const run = async (task: "tidy" | "coherence") => {
    if (busy) return;
    const { nodes: now, edges, manuscript, screenplay } = useCosmos.getState();
    const cards = now.map((n) => n.data);
    setResult(null);
    if (task === "tidy" && tidyCandidates(cards).length === 0) return setMessage(t.tidyNone);
    setBusy(true);
    setMessage(t.working);
    try {
      if (task === "tidy") {
        const prompt = tidyPrompt(cards, lang, kind);
        const items = parseTidy(await complete(config, prompt.system, prompt.user, { json: true, maxTokens: 3000 }), cards, names);
        setResult({ kind: "tidy", items });
        setMessage(items.length === 0 ? t.tidyEmpty : "");
      } else {
        // Le texte des scènes vit dans le manuscrit ou le scénario, pas dans leur carte.
        const sceneTexts: Record<string, string> = {};
        for (const card of cards) {
          if (card.type !== "scene") continue;
          if (kind === "scenario" && screenplay) {
            const at = headingOf(screenplay.elements, card.id);
            if (at >= 0) sceneTexts[card.id] = [sceneSynopsis(screenplay.elements, at), sceneText(sceneBody(screenplay.elements, at), lang)].filter(Boolean).join(" ");
          } else if (manuscript[card.id]) sceneTexts[card.id] = plainText(manuscript[card.id]);
        }
        const prompt = coherencePrompt(cards, edges.map((e) => ({ source: e.source, target: e.target, label: String(e.label ?? "") })), lang, sceneTexts, allQuestionTexts(all.assistant));
        const items = parseCoherence(await complete(config, prompt.system, prompt.user, { json: true, maxTokens: 3000 }), cards, names);
        setResult({ kind: "coherence", items });
        setMessage(items.length === 0 ? t.coherenceNone : "");
      }
    } catch (err) {
      console.error(err);
      setMessage(aiErrorText(err, t.errors));
    } finally {
      setBusy(false);
    }
  };

  const drop = (index: number) => {
    if (!result) return;
    const items = result.items.filter((_, i) => i !== index);
    setResult({ ...result, items } as Result);
  };
  const applyTidy = (item: TidySuggestion, index: number) => {
    updateCard(item.id, { type: item.type });
    drop(index);
  };
  const applyAll = () => {
    if (result?.kind !== "tidy") return;
    for (const item of result.items) updateCard(item.id, { type: item.type });
    setResult(null);
    setMessage(t.applied);
  };

  return (
    <div className="settings" ref={rootRef}>
      <button ref={buttonRef} type="button" className="icon-button" aria-label={t.button} title={t.button} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          <path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" />
        </svg>
      </button>
      {open && (
        <div className="settings-panel ai-panel" id={panelId} role="group" aria-label={t.button}>
          <div className="eyebrow">{fmt(t.with, { provider: t.providers[config.provider] })}</div>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => void run("tidy")}>
            {t.tidy}
          </button>
          <p className="settings-hint">{t.tidyHint}</p>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => void run("coherence")}>
            {t.coherence}
          </button>
          <p className="settings-hint">{t.coherenceHint}</p>
          {/* Après avoir typé les idées : tout ranger en cadres sur le canevas (sans IA, annulable). */}
          <button type="button" className="ghost-button" disabled={busy} onClick={() => useCosmos.getState().organizeCanvas()}>
            {all.organize.button}
          </button>
          <p className="settings-hint">{all.organize.hint}</p>

          <p className="ai-message" role="status">
            {message}
          </p>

          {result?.kind === "tidy" && result.items.length > 0 && (
            <>
              <ul className="ai-list">
                {result.items.map((item, i) => (
                  <li key={item.id}>
                    <button type="button" className="ai-card" title={fmt(all.manuscript.show, { title: titleOf(item.id) })} onClick={() => revealCard(item.id)}>
                      {titleOf(item.id)}
                    </button>
                    <span className="ai-arrow">
                      <span aria-hidden="true">→ </span>
                      <span className="card-dot" style={{ background: typeColor(item.type) }} />
                      {types[item.type].label}
                    </span>
                    {item.reason && <p>{item.reason}</p>}
                    <div className="ai-actions">
                      <button type="button" onClick={() => applyTidy(item, i)}>
                        {t.apply}
                      </button>
                      <button type="button" onClick={() => drop(i)}>
                        {t.ignore}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {result.items.length > 1 && (
                <button type="button" className="ghost-button" onClick={applyAll}>
                  {t.applyAll}
                </button>
              )}
            </>
          )}

          {result?.kind === "coherence" && result.items.length > 0 && (
            <ul className="ai-list">
              {result.items.map((item, i) => (
                <li key={`${item.cards.join("-")}-${i}`}>
                  <p className="ai-question">{item.question}</p>
                  <div className="ai-cards">
                    {item.cards.map((id) => (
                      <button key={id} type="button" className="ai-card" title={fmt(all.manuscript.show, { title: titleOf(id) })} onClick={() => revealCard(id)}>
                        {titleOf(id)}
                      </button>
                    ))}
                  </div>
                  <div className="ai-actions">
                    <button
                      type="button"
                      onClick={() => {
                        addQuestionAbout(item.question, item.cards);
                        drop(i);
                      }}
                    >
                      {t.toQuestion}
                    </button>
                    <button type="button" onClick={() => drop(i)}>
                      {t.ignore}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
