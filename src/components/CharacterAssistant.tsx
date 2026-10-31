// Assistant personnage, dans la fiche d'un personnage de la Bible. Deux façons de creuser :
// - des questions, une à la fois, par niveau (essentiel, approfondi, intime). L'auteur répond (la réponse
//   s'ajoute à la fiche), passe à une autre, ou la garde pour plus tard (« Je ne sais pas encore » :
//   elle reste dans la carte du personnage, onglet « À creuser », sans rien poser sur le canevas) ;
// - si un service d'IA est branché : une question sur mesure d'après la fiche, et une synthèse qui
//   remet en ordre ce que l'auteur a déjà écrit (fiche, notes, réponses). La synthèse est proposée :
//   l'auteur l'ajoute à la fiche ou l'ignore. L'IA n'invente rien et ne répond jamais à sa place.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import type { CardData } from "../types";
import { QUESTION_FIELD, THEMES, THEME_KEYS, allQuestionTexts, bankQuestions, customKey, nextOpen, questionText, type Theme } from "../assistant";
import { AiError, aiErrorText, complete, isReady } from "../ai/providers";
import { useVocab } from "../vocab";
import { interviewPrompt, parseQuestion, parseSynthesis, synthesisPrompt } from "../ai/tasks";

type Tab = "themes" | "custom" | "pending";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function CharacterAssistant({ card, startOpen = false }: { card: CardData; startOpen?: boolean }) {
  const all = useT();
  const t = all.assistant;
  const ct = all.character;
  const { types } = useVocab();
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const answerQuestion = useCosmos((s) => s.answerQuestion);
  const parkQuestion = useCosmos((s) => s.parkQuestion);
  const dropQuestion = useCosmos((s) => s.dropQuestion);
  const updateCard = useCosmos((s) => s.updateCard);
  const aiSettings = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(aiSettings), [aiSettings]);
  const lang = useSettings((s) => s.lang);
  const ai = isReady(config);
  const pending = card.questions ?? [];

  const [open, setOpen] = useState(startOpen);
  const [chosen, setTab] = useState<Tab>(startOpen && pending.length > 0 ? "pending" : "themes");
  const tab: Tab = chosen === "custom" && !ai ? "themes" : chosen;
  useEffect(() => {
    if (!startOpen) return;
    setOpen(true);
    if ((card.questions ?? []).length > 0) setTab("pending");
  }, [startOpen, card.questions]);

  // Question affichée : on la garde tant qu'elle est ouverte, sinon on passe à la suivante.
  const [shownKey, setShownKey] = useState<string | null>(null);
  // Question en attente qu'on a choisi de traiter (onglet « À creuser »).
  const [pendingShown, setPendingShown] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [said, setSaid] = useState("");
  // Question sur mesure, posée par l'IA.
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<"" | "ask" | "synthesis">("");
  const [error, setError] = useState("");
  const [synthesis, setSynthesis] = useState<string[] | null>(null);
  const asked = useRef<string[]>([]);
  const panelId = useId();

  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  // Une seule banque de questions, rangée par thème (« L'essentiel » d'abord), sans doublon.
  const texts = useMemo(() => allQuestionTexts(t), [t]);
  const byTheme = useMemo(
    () => Object.fromEntries(THEMES.map((th) => [th, bankQuestions(THEME_KEYS[th], texts, card, cards, edges)])) as Record<Theme, ReturnType<typeof bankQuestions>>,
    [texts, card, cards, edges],
  );
  // Le thème choisi, ou le premier qui a encore des questions ouvertes.
  const [themeChosen, setTheme] = useState<Theme | null>(null);
  const theme: Theme = themeChosen ?? THEMES.find((th) => byTheme[th].some((q) => q.state === "open")) ?? THEMES[0];
  const isLevel = tab === "themes";
  const questions = isLevel ? byTheme[theme] : [];
  const fromBank = isLevel ? (questions.find((q) => q.key === shownKey && q.state === "open") ?? nextOpen(questions, null)) : null;
  const question = tab === "custom" ? custom : tab === "pending" ? (pendingShown && pending.includes(pendingShown) ? pendingShown : "") : (fromBank?.text ?? "");
  const name = card.title.trim();
  const themeDone = (th: Theme) => byTheme[th].filter((q) => q.state !== "open").length;
  // Clé de la question affichée : celle de la banque, celle d'une question gardée (retrouvée par son texte), ou sur mesure.
  const keyOfText = (text: string) => Object.keys(texts).find((k) => texts[k] === text) ?? customKey(text);
  const questionKey = fromBank?.key ?? (question ? keyOfText(question) : "");
  const field = questionKey ? QUESTION_FIELD[questionKey] : undefined;

  const pickTab = (next: Tab) => {
    setTab(next);
    setShownKey(null);
    setPendingShown(null);
    setAnswer("");
    setError("");
  };

  const linksNow = () => useCosmos.getState().edges.map((e) => ({ source: e.source, target: e.target, label: String(e.label ?? "") }));
  const selfNow = () => {
    const data = useCosmos.getState().nodes.map((n) => n.data);
    return { data, self: data.find((c) => c.id === card.id) ?? card };
  };

  /** Demande à l'IA une question d'après la fiche et les cartes reliées. */
  const ask = async () => {
    if (!isReady(config) || busy) return;
    setBusy("ask");
    setError("");
    try {
      const { data, self } = selfNow();
      const prompt = interviewPrompt(self, data, linksNow(), lang, asked.current, texts);
      // Une carte citée dans la question : « Titre (type) », jamais son identifiant.
      const next = parseQuestion(await complete(config, prompt.system, prompt.user, 400), data, { type: (type) => types[type].label.toLocaleLowerCase(lang), untitled: all.bible.untitled });
      if (!next) throw new AiError("empty");
      asked.current.push(next);
      setCustom(next);
      setAnswer("");
    } catch (err) {
      console.error(err);
      setError(aiErrorText(err, all.ai.errors));
    } finally {
      setBusy("");
    }
  };

  /** Demande une synthèse de ce qui est écrit sur ce personnage. */
  const synthesize = async () => {
    if (!isReady(config) || busy) return;
    setBusy("synthesis");
    setError("");
    setSynthesis(null);
    try {
      const { data, self } = selfNow();
      const prompt = synthesisPrompt(
        self,
        data,
        linksNow(),
        lang,
        ct.fields,
        ct.arcTypes,
        Object.entries(self.reponses ?? {}).map(([key, value]) => ({ question: questionText(key, texts), answer: value })),
      );
      const paragraphs = parseSynthesis(await complete(config, prompt.system, prompt.user, 1200));
      if (paragraphs.length === 0) throw new AiError("empty");
      setSynthesis(paragraphs);
    } catch (err) {
      console.error(err);
      setError(aiErrorText(err, all.ai.errors));
    } finally {
      setBusy("");
    }
  };

  const keepSynthesis = () => {
    if (!synthesis) return;
    const current = useCosmos.getState().nodes.find((n) => n.id === card.id)?.data.html ?? "";
    const added = `<h3>${escape(ct.synthesisHeading)}</h3>${synthesis.map((p) => `<p>${escape(p)}</p>`).join("")}`;
    updateCard(card.id, { html: `${current === "<p></p>" ? "" : current}${added}` });
    setSynthesis(null);
    setSaid(ct.synthesisAdded);
  };

  const advance = () => {
    setAnswer("");
    if (tab === "custom") void ask();
    else if (tab === "pending") setPendingShown(null);
    else setShownKey(nextOpen(questions, fromBank?.key ?? null)?.key ?? null);
  };
  const save = () => {
    if (!question || !answer.trim()) return;
    answerQuestion(card.id, questionKey, question, answer);
    // La réponse a rempli un champ de la fiche, ou rejoint les réponses rangées (repliées sous la fiche).
    setSaid(field && !card.fiche?.[field]?.trim() ? fmt(t.addedToField, { field: ct.fields[field] }) : t.added);
    if (tab === "custom") {
      setCustom("");
      setAnswer("");
    } else advance();
  };
  const park = () => {
    if (!question) return;
    parkQuestion(card.id, question);
    setSaid(t.parked);
    if (tab === "custom") {
      setCustom("");
      setAnswer("");
    } else advance();
  };

  const answering = question ? (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="assistant-question" htmlFor={`${panelId}-answer`}>
        {question}
      </label>
      <textarea
        id={`${panelId}-answer`}
        rows={3}
        value={answer}
        placeholder={t.placeholder}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      />
      <div className="assistant-actions">
        <button type="submit" className="is-primary" disabled={!answer.trim()}>
          {t.add}
        </button>
        {tab !== "pending" && (
          <button type="button" onClick={park}>
            {t.dontKnow}
          </button>
        )}
        <button
          type="button"
          onClick={advance}
          disabled={busy !== "" || (isLevel && questions.filter((q) => q.state === "open").length < 2)}
        >
          {busy === "ask" ? all.ai.working : tab === "pending" ? ct.backToList : t.another}
        </button>
      </div>
    </form>
  ) : null;

  return (
    <div className="assistant">
      <div className="assistant-bar">
        <button type="button" className="ghost-button assistant-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          {name ? fmt(t.open, { name }) : t.openUnnamed}
        </button>
        {ai && (
          <button type="button" className="ghost-button assistant-toggle" disabled={busy !== ""} title={ct.synthesisHint} onClick={() => void synthesize()}>
            {busy === "synthesis" ? all.ai.working : ct.synthesis}
          </button>
        )}
      </div>

      {synthesis && (
        <div className="assistant-panel synthesis" role="group" aria-label={ct.synthesis}>
          <p className="assistant-hint">{ct.synthesisProposal}</p>
          <div className="synthesis-text">
            {synthesis.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="assistant-actions">
            <button type="button" className="is-primary" onClick={keepSynthesis}>
              {ct.synthesisKeep}
            </button>
            <button type="button" onClick={() => setSynthesis(null)}>
              {all.ai.ignore}
            </button>
          </div>
        </div>
      )}

      {open && (
        <div id={panelId} className="assistant-panel">
          <div className="sq-modes" role="group" aria-label={t.levelAria}>
            <button type="button" aria-pressed={tab === "themes"} onClick={() => pickTab("themes")}>
              {t.themesTab}
            </button>
            {ai && (
              <button type="button" aria-pressed={tab === "custom"} onClick={() => pickTab("custom")}>
                {t.custom}
              </button>
            )}
            <button type="button" aria-pressed={tab === "pending"} onClick={() => pickTab("pending")}>
              {ct.pendingTab} <span className="assistant-count">{pending.length}</span>
            </button>
          </div>
          {tab === "themes" && (
            <div className="assistant-themes" role="group" aria-label={t.themesAria}>
              {THEMES.map((th) => (
                <button
                  key={th}
                  type="button"
                  aria-pressed={theme === th}
                  className={themeDone(th) === byTheme[th].length ? "is-done" : ""}
                  onClick={() => {
                    setTheme(th);
                    setShownKey(null);
                    setAnswer("");
                  }}
                >
                  {t.themes[th]} <span className="assistant-count">{fmt(t.progress, { done: themeDone(th), total: byTheme[th].length })}</span>
                </button>
              ))}
            </div>
          )}
          <p className="assistant-hint">{tab === "custom" ? t.customHint : tab === "pending" ? ct.pendingHint : t.themeHints[theme]}</p>
          {question && field && <p className="assistant-field">{fmt(t.fillsField, { field: ct.fields[field] })}</p>}

          {tab === "pending" && !question ? (
            pending.length === 0 ? (
              <p className="assistant-done">{ct.pendingEmpty}</p>
            ) : (
              <ul className="pending-list">
                {pending.map((q) => (
                  <li key={q}>
                    <span>{q}</span>
                    <div className="assistant-actions">
                      <button type="button" className="is-primary" onClick={() => setPendingShown(q)}>
                        {ct.answer}
                      </button>
                      <button type="button" aria-label={fmt(ct.dropAria, { question: q })} onClick={() => dropQuestion(card.id, q)}>
                        {ct.drop}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : question ? (
            answering
          ) : tab === "custom" ? (
            <div className="assistant-actions">
              <button type="button" className="is-primary" disabled={busy !== ""} onClick={() => void ask()}>
                {busy === "ask" ? all.ai.working : t.ask}
              </button>
            </div>
          ) : (
            <p className="assistant-done">{tab === "themes" ? t.themeDone : t.levelDone}</p>
          )}
        </div>
      )}
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      <div className="sr-only" aria-live="polite">
        {said}
      </div>
    </div>
  );
}
