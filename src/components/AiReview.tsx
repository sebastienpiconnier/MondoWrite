// Relecture par l'IA (1.9.0) : quatre actions du menu IA (cohérence scène par scène, chronologie, voix des
// personnages, lecteur bêta) et leurs questions, en tête de l'onglet « Vérifier » du Manuscrit et du Scénario.
// Les questions sont un état d'affichage de la session (jamais enregistré, vidé en quittant le projet) ; seule
// une question gardée devient une carte Question, reliée aux scènes et aux cartes en jeu. Rien n'est corrigé.

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { aiErrorText, AiError, complete, isReady, type AiConfig } from "../ai/providers";
import { allQuestionTexts } from "../assistant";
import type { CardNames, Prompt } from "../ai/tasks";
import { betaPrompt, continuityPrompts, novelScenes, parseReview, REVIEW_BUDGET, REVIEW_TASKS, screenplayScenes, timelinePrompts, voicesPrompt, type ReviewQuestion, type ReviewTask, type SceneRef } from "../ai/review";
import { allows, packBudget, type AiAction } from "../ai/limits";

/** Relectures aux envois longs (tout le récit, ou une scène entière avec ses fiches) : un petit modèle peut les refuser (ai/limits.ts). */
const LONG_TASKS: Partial<Record<ReviewTask, AiAction>> = { continuity: "continuity", voices: "voices", beta: "beta" };
const allowsTask = (config: AiConfig, task: ReviewTask) => !LONG_TASKS[task] || allows(config.provider, LONG_TASKS[task]!);

interface ReviewState {
  items: ReviewQuestion[];
  /** Questions écartées par « Ignorer » (clés), pour la session. */
  ignored: Set<string>;
  /** Relecture en cours : la tâche et l'avancement par paquets. */
  run: { task: ReviewTask; done: number; total: number } | null;
  message: string;
  /** Une relecture vient de partir : la vue du texte ouvre son onglet « Vérifier ». */
  reveal: boolean;
}

const EMPTY: ReviewState = { items: [], ignored: new Set(), run: null, message: "", reveal: false };
export const useAiReview = create<ReviewState>(() => EMPTY);
let controller: AbortController | null = null;

// Projet fermé : la relecture s'arrête et ses questions partent avec lui.
useCosmos.subscribe((s, prev) => {
  if (s.screen !== "project" && prev.screen === "project") {
    controller?.abort();
    controller = null;
    useAiReview.setState({ ...EMPTY, ignored: new Set() });
  }
});

interface RunContext {
  config: AiConfig;
  lang: string;
  names: CardNames;
  /** Textes des questions de l'assistant (réponses de l'auteur jointes aux fiches). */
  questions: Record<string, string>;
  t: ReturnType<typeof useT>["aiReview"];
  errors: ReturnType<typeof useT>["ai"]["errors"];
  /** Phrase d'une relecture refusée par le service (trop longue pour lui). */
  refused: string;
}

/** Lance une relecture : un appel par paquet, les questions arrivent au fil des réponses. */
export async function runReview(task: ReviewTask, ctx: RunContext) {
  if (useAiReview.getState().run) return;
  const { nodes, edges, plan, manuscript, screenplay, kind } = useCosmos.getState();
  const cards = nodes.map((n) => n.data);
  const scenes = kind === "scenario" ? (screenplay ? screenplayScenes(screenplay.elements, ctx.lang) : []) : novelScenes(nodes, plan, manuscript);
  const links = edges.map((e) => ({ source: e.source, target: e.target, label: String(e.label ?? "") }));
  const label = ctx.t.tasks[task];
  const say = (message: string) => useAiReview.setState({ message, reveal: true });
  // Les questions d'une relecture précédente de la même tâche laissent la place aux nouvelles.
  useAiReview.setState((s) => ({ items: s.items.filter((q) => q.task !== task) }));
  useCosmos.getState().setView("manuscrit");
  if (!scenes.some((s) => s.text || s.synopsis)) return say(ctx.t.nothing);
  if (!allowsTask(ctx.config, task)) return say(ctx.refused);
  // Paquets plus petits pour un petit modèle (Apple sur l'appareil) : plus d'envois, chacun dans sa fenêtre.
  const budget = packBudget(ctx.config.provider, REVIEW_BUDGET);
  const prompts: Prompt[] =
    task === "continuity"
      ? continuityPrompts(scenes, cards, links, ctx.lang, kind, ctx.questions, budget)
      : task === "timeline"
        ? timelinePrompts(scenes, ctx.lang, kind, budget)
        : [task === "voices" ? voicesPrompt(scenes, cards, ctx.lang, kind) : betaPrompt(scenes, ctx.lang, kind)].filter((p): p is Prompt => !!p);
  if (prompts.length === 0) return say(task === "timeline" ? ctx.t.noMarkers : task === "voices" ? ctx.t.noLines : ctx.t.nothing);
  const own = new AbortController();
  controller = own;
  useAiReview.setState({ run: { task, done: 0, total: prompts.length }, message: "", reveal: true });
  let found = 0;
  try {
    for (const [i, prompt] of prompts.entries()) {
      const reply = await complete(ctx.config, prompt.system, prompt.user, { json: true, maxTokens: 3000, signal: own.signal });
      if (own.signal.aborted) throw new AiError("cancelled");
      const items = parseReview(reply, task, scenes, cards, ctx.lang, ctx.names);
      const now = useAiReview.getState().items;
      const known = new Set(now.map((q) => q.key));
      const fresh = items.filter((q) => !known.has(q.key));
      found += fresh.length;
      useAiReview.setState({ items: [...now, ...fresh], run: { task, done: i + 1, total: prompts.length } });
    }
    useAiReview.setState({ message: found === 0 ? fmt(ctx.t.none, { task: label }) : found === 1 ? fmt(ctx.t.doneOne, { task: label }) : fmt(ctx.t.doneMany, { task: label, n: found }) });
  } catch (err) {
    const cancelled = err instanceof AiError && err.code === "cancelled";
    if (!cancelled) console.error(err);
    useAiReview.setState({ message: cancelled ? ctx.t.cancelled : aiErrorText(err, ctx.errors) });
  } finally {
    if (controller === own) controller = null;
    useAiReview.setState({ run: null });
  }
}

export const cancelReview = () => controller?.abort();

/** Contexte d'une relecture, tiré des réglages et des textes de l'interface. */
function useRunContext(): RunContext | null {
  const { t: all, types } = useVocab();
  const aiSettings = useSettings((s) => s.ai);
  const lang = useSettings((s) => s.lang);
  const config = useMemo(() => aiConfig(aiSettings), [aiSettings]);
  return useMemo(() => {
    if (!isReady(config)) return null;
    const names: CardNames = { type: (type) => types[type].label.toLocaleLowerCase(lang), untitled: all.bible.untitled };
    return { config: config!, lang, names, questions: allQuestionTexts(all.assistant), t: all.aiReview, errors: all.ai.errors, refused: all.apple.refused };
  }, [config, lang, types, all]);
}

/** Groupe « Relecture par l'IA » du menu IA. `onStart` ferme le menu. */
export function AiReviewActions({ disabled, onStart }: { disabled: boolean; onStart: () => void }) {
  const t = useT().aiReview;
  const ctx = useRunContext();
  const running = useAiReview((s) => s.run !== null);
  if (!ctx) return null;
  return (
    <div className="ai-review-group" role="group" aria-labelledby="ai-review-group">
      <div className="eyebrow" id="ai-review-group">
        {t.group}
      </div>
      <p className="settings-hint">{t.groupHint}</p>
      {REVIEW_TASKS.map((task) => (
        <div key={task} className="ai-review-action">
          <button
            type="button"
            className="ghost-button"
            disabled={disabled || running || !allowsTask(ctx.config, task)}
            onClick={() => {
              onStart();
              void runReview(task, ctx);
            }}
          >
            {t.tasks[task]}
          </button>
          <p className="settings-hint">{allowsTask(ctx.config, task) ? t.hints[task] : ctx.refused}</p>
        </div>
      ))}
    </div>
  );
}

/** La vue du texte ouvre son onglet « Vérifier » quand une relecture part (elle vient peut-être d'être montée). */
export function useAiReviewReveal(open: () => void) {
  const reveal = useAiReview((s) => s.reveal);
  useEffect(() => {
    if (!reveal) return;
    useAiReview.setState({ reveal: false });
    open();
  }, [reveal]);
}

/** Nombre de questions de l'IA encore à regarder (ajouté au compte du bouton « Vérifier »). */
export function useOpenAiQuestions(): number {
  return useAiReview((s) => s.items.filter((q) => !s.ignored.has(q.key)).length);
}

/** Une relecture tourne ou a laissé des questions : « Rien à signaler » ne vaut alors que pour les points sans IA, on le tait. */
export function useAiReviewActive(): boolean {
  return useAiReview((s) => s.run !== null || s.items.some((q) => !s.ignored.has(q.key)));
}

/** Section « Questions de l'IA » de l'onglet « Vérifier » ; `onScene` mène à la scène (et au passage cité). */
export function AiQuestions({ onScene }: { onScene: (ref: SceneRef, quote?: string) => boolean }) {
  const all = useT();
  const t = all.aiReview;
  const ctx = useRunContext();
  const { items, ignored, run, message } = useAiReview();
  const nodes = useCosmos((s) => s.nodes);
  if (!ctx || (items.length === 0 && !run && !message)) return null;
  const shown = items.filter((q) => !ignored.has(q.key));
  const hidden = items.length - shown.length;
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.data.title.trim() || all.bible.untitled;
  const sceneName = (ref: SceneRef) => ref.title || fmt(t.scene, { n: ref.number });
  const drop = (key: string) => useAiReview.setState((s) => ({ items: s.items.filter((q) => q.key !== key) }));

  return (
    <section className="review-group ai-review" aria-labelledby="ai-review-heading">
      <h3 id="ai-review-heading" className="review-rule">
        {shown.length > 0 ? fmt(t.headingCount, { n: shown.length }) : t.heading}
      </h3>
      <p className="review-hint" role="status">
        {run ? (run.total > 1 && run.done < run.total ? fmt(t.progress, { task: t.tasks[run.task], done: run.done + 1, total: run.total }) : fmt(t.working, { task: t.tasks[run.task] })) : message}
      </p>
      {run && (
        <div className="review-actions">
          <button type="button" className="review-ignore" onClick={cancelReview}>
            {t.cancel}
          </button>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="review-list">
          {shown.map((q) => (
            <li key={q.key} className="review-item">
              <p className="ai-review-question">
                <span className="ai-review-task">{q.kind ? t.kinds[q.kind] : t.tasks[q.task]}</span> {q.question}
              </p>
              <div className="ai-review-links">
                {q.scenes.map((ref) => (
                  <button
                    key={`${ref.number}-${ref.cardId ?? ref.at}`}
                    type="button"
                    className="ai-review-link"
                    title={fmt(t.goScene, { title: sceneName(ref) })}
                    aria-label={fmt(t.goScene, { title: sceneName(ref) })}
                    onClick={() => {
                      if (!onScene(ref, q.quote)) useAiReview.setState({ message: t.missing });
                    }}
                  >
                    {sceneName(ref)}
                  </button>
                ))}
                {q.cards
                  .filter((id) => nodes.some((n) => n.id === id))
                  .map((id) => (
                    <button key={id} type="button" className="ai-review-link is-card" title={fmt(t.openCard, { title: titleOf(id) })} onClick={() => useCosmos.getState().openInBible(id)}>
                      {titleOf(id)}
                    </button>
                  ))}
              </div>
              <div className="review-actions">
                <button
                  type="button"
                  className="review-primary"
                  onClick={() => {
                    const sceneCards = q.scenes.map((s) => s.cardId).filter((id): id is string => !!id);
                    useCosmos.getState().addQuestionAbout(q.question, [...q.cards, ...sceneCards]);
                    drop(q.key);
                    useAiReview.setState({ message: t.kept });
                  }}
                >
                  {t.keep}
                </button>
                <button type="button" className="review-ignore" onClick={() => useAiReview.setState((s) => ({ ignored: new Set(s.ignored).add(q.key) }))}>
                  {t.ignore}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="review-ignored">
          {hidden === 1 ? t.ignoredOne : fmt(t.ignoredMany, { n: hidden })}{" "}
          <button type="button" className="link-button" onClick={() => useAiReview.setState({ ignored: new Set() })}>
            {t.showIgnored}
          </button>
        </p>
      )}
    </section>
  );
}
