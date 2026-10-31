// Lot IA 2 (1.9.0), « Structure et Bible » : les aides qui proposent sans rien écrire d'elles-mêmes (ai/structure.ts).
// - BeatQuestion : « Une question » sous une case vide du gabarit (Plan, séquencier) ; « Garder » en fait une carte Question.
// - RetroBible : « Ce que le texte en dit », fiche d'un personnage ou d'un lieu ; chaque champ vide proposé avec sa citation.
// - BreakdownSheet : dépouillement d'une scène de scénario (cinq champs, une entrée par ligne) et « Dépouiller cette scène ».
// - BreakdownStats : onglet « Dépouillement » des Statistiques (tout le scénario, puis la liste par catégorie).
// - RetroInvite : invitation après l'import d'un manuscrit.
// Rien n'entre dans le projet sans un clic de l'auteur ; chaque acceptation est une étape d'historique.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { aiErrorText, complete, isReady } from "../ai/providers";
import { allows, packBudget } from "../ai/limits";
import type { AiConfig } from "../ai/providers";
import type { CardData } from "../types";
import { BREAKDOWN_FIELDS, type BreakdownField, type SheetField } from "../character";
import type { CardNames } from "../ai/tasks";
import {
  RETRO_MAX_PACKETS,
  beatCharacters,
  beatContext,
  beatQuestionPrompt,
  breakdownBatches,
  BREAKDOWN_BUDGET,
  breakdownByCategory,
  breakdownPrompt,
  isRetroType,
  mergeRetro,
  packets,
  parseBeatQuestion,
  parseBreakdown,
  parseRetro,
  retroEmptyFields,
  retroPassages,
  retroPrompt,
  type BreakdownProposal,
  type RetroProposal,
} from "../ai/structure";
import { beatRows, breakdownScenes, storyParagraphs } from "../structureSources";
import { useBeatText } from "./useBeatText";

/** Service d'IA branché (ou null), et le nom des cartes dans un texte de l'IA (« Titre (type) »). */
function useAi(): { config: AiConfig | null; names: CardNames; lang: string } {
  const { t, types } = useVocab();
  const ai = useSettings((s) => s.ai);
  const lang = useSettings((s) => s.lang);
  const config = useMemo(() => {
    const c = aiConfig(ai);
    return isReady(c) ? c : null;
  }, [ai]);
  const names = useMemo<CardNames>(() => ({ type: (type) => types[type].label.toLocaleLowerCase(lang), untitled: t.bible.untitled }), [types, lang, t]);
  return { config, names, lang };
}

/** Une action IA en cours : occupé, message, annulation par l'auteur, requête arrêtée si le composant disparaît. */
function useAiRun() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setMessage(t.ai.working);
    try {
      await work(controller.signal);
    } catch (err) {
      console.error(err);
      setMessage(aiErrorText(err, t.ai.errors));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };
  return { busy, message, setMessage, run, cancel: () => abortRef.current?.abort() };
}

/** Le passage de l'auteur qui fonde une proposition, entre guillemets. */
function Quote({ text }: { text: string }) {
  const s = useT().structure;
  return (
    <p className="ai-quote" aria-label={s.quoteAria}>
      {fmt(s.quote, { text })}
    </p>
  );
}

// ---------- Une question pour une case vide ----------

export function BeatQuestion({ beatKey }: { beatKey: string }) {
  const t = useT();
  const s = t.structure;
  const { config, names, lang } = useAi();
  const beatInfo = useBeatText();
  const { busy, message, setMessage, run, cancel } = useAiRun();
  const [found, setFound] = useState<{ question: string; cards: string[] } | null>(null);
  if (!config) return null;

  const ask = () =>
    run(async (signal) => {
      setFound(null);
      const state = useCosmos.getState();
      const { template, rows } = beatRows(state, beatInfo);
      const cards = state.nodes.map((n) => n.data);
      const custom = state.kind === "scenario" ? undefined : state.plan.custom;
      const templateName = template === "perso" ? custom?.name || t.plan.templates.perso : template ? t.plan.templates[template] : "";
      const ctx = beatContext(rows, beatKey, { kind: state.kind, template: templateName, characters: beatCharacters(cards), logline: state.pitch.logline ?? "" });
      if (!ctx) return setMessage("");
      const prompt = beatQuestionPrompt(ctx, lang);
      const result = parseBeatQuestion(await complete(config, prompt.system, prompt.user, { json: true, maxTokens: 600, signal }), cards, names);
      setFound(result);
      setMessage(result ? "" : s.beatNone);
    });

  const keep = () => {
    if (!found) return;
    useCosmos.getState().addQuestionAbout(found.question, found.cards);
    setFound(null);
    setMessage(s.beatKept);
  };

  return (
    <div className="beat-question">
      {!found && !busy && (
        <button type="button" className="link-button beat-ask" aria-label={fmt(s.beatAskAria, { beat: beatInfo(beatKey).label })} onClick={() => void ask()}>
          {s.beatAsk}
        </button>
      )}
      <p className="ai-message" role="status">
        {message}
      </p>
      {busy && (
        <button type="button" className="link-button" onClick={cancel}>
          {t.ai.cancel}
        </button>
      )}
      {found && (
        <div className="beat-question-found">
          <p className="ai-question">{found.question}</p>
          <div className="ai-actions">
            <button type="button" aria-label={s.beatKeepAria} onClick={keep}>
              {s.beatKeep}
            </button>
            <button type="button" onClick={() => setFound(null)}>
              {t.ai.ignore}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Rétro-bible ----------

export function RetroBible({ card }: { card: CardData }) {
  const t = useT();
  const s = t.structure;
  const { config, lang } = useAi();
  const { busy, message, setMessage, run, cancel } = useAiRun();
  const [items, setItems] = useState<RetroProposal[] | null>(null);
  const [leftOut, setLeftOut] = useState("");
  const typeLabels = t.fiche.typeLabels as Partial<Record<string, Record<string, string>>>;
  const labels: Record<string, string> = { ...t.character.fields, ...t.fiche.fields, ...typeLabels[card.type] };
  if (!config || !isRetroType(card.type)) return null;

  const read = () =>
    run(async (signal) => {
      setItems(null);
      setLeftOut("");
      const fields = retroEmptyFields(card);
      if (fields.length === 0) return setMessage(s.retroNothing);
      const state = useCosmos.getState();
      const passages = retroPassages(card, storyParagraphs(state, lang));
      if (passages.length === 0) return setMessage(fmt(s.retroNoText, { title: card.title.trim() || t.bible.untitled }));
      const packs = packets(passages);
      const total = Math.min(packs.length, RETRO_MAX_PACKETS);
      let found: RetroProposal[] = [];
      let rejected = 0;
      for (let i = 0; i < total; i++) {
        setMessage(fmt(s.retroProgress, { n: i + 1, total }));
        // Un champ déjà proposé trois fois n'est plus demandé.
        const open = fields.filter((f) => found.filter((p) => p.field === f).length < 3);
        if (open.length === 0) break;
        const prompt = retroPrompt(card, open.map((key) => ({ key, label: labels[key] ?? key })), packs[i], lang, state.kind);
        const reply = await complete(config, prompt.system, prompt.user, { json: true, maxTokens: 1500, signal });
        const parsed = parseRetro(reply, open, packs[i]);
        found = mergeRetro(found, parsed.items);
        rejected += parsed.rejected;
        setItems(found);
      }
      if (packs.length > total) setLeftOut(fmt(s.retroLeftOut, { max: total, n: packs.length - total }));
      setMessage(found.length === 0 ? s.retroEmpty : rejected === 1 ? s.rejectedOne : rejected > 0 ? fmt(s.rejected, { n: rejected }) : "");
    });

  // Un champ rempli entre-temps (par l'auteur ou par une proposition acceptée) ne se propose plus.
  const shown = (items ?? []).filter((p) => !card.fiche?.[p.field]?.trim());
  const accept = (p: RetroProposal) => {
    if (card.fiche?.[p.field]?.trim()) return;
    useCosmos.getState().setFiche(card.id, p.field as SheetField, p.value);
  };

  return (
    <div className="retro-bible">
      <div className="assistant-bar">
        <button type="button" className="ghost-button assistant-toggle" disabled={busy || !allows(config.provider, "retro")} onClick={() => void read()}>
          {s.retroButton}
        </button>
        {busy && (
          <button type="button" className="ghost-button assistant-toggle" onClick={cancel}>
            {t.ai.cancel}
          </button>
        )}
      </div>
      {!items && !busy && !message && <p className="gallery-hint">{allows(config.provider, "retro") ? s.retroHint : t.apple.refused}</p>}
      <p className="ai-message" role="status">
        {message}
      </p>
      {leftOut && <p className="gallery-hint">{leftOut}</p>}
      {shown.length > 0 && (
        <div className="assistant-panel synthesis" role="group" aria-label={s.retroHeading}>
          <p className="assistant-hint">{s.retroProposal}</p>
          <dl className="photo-fields">
            {shown.map((p) => (
              <div key={`${p.field}-${p.value}`} className="photo-field">
                <dt>{labels[p.field] ?? p.field}</dt>
                <dd>
                  <p>{p.value}</p>
                  <Quote text={p.quote} />
                  <div className="assistant-actions">
                    <button type="button" className="is-primary" onClick={() => accept(p)}>
                      {s.retroAdd}
                    </button>
                    <button type="button" onClick={() => setItems((items ?? []).filter((x) => x !== p))}>
                      {t.ai.ignore}
                    </button>
                  </div>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

// ---------- Dépouillement ----------

/** Propositions à cocher (toutes cochées d'abord), regroupées par scène ; « Ajouter » les met dans les fiches, en une étape. */
function BreakdownProposals({ items, onDone }: { items: BreakdownProposal[]; onDone: (added: number) => void }) {
  const t = useT();
  const s = t.structure;
  const nodes = useCosmos((st) => st.nodes);
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.data.title.trim() || t.screenplay.untitledScene;
  const groups = useMemo(() => {
    const out = new Map<string, number[]>();
    items.forEach((p, i) => out.set(p.scene, [...(out.get(p.scene) ?? []), i]));
    return [...out];
  }, [items]);
  const kept = items.filter((_, i) => !unchecked.has(i));
  return (
    <div className="assistant-panel breakdown-proposals" role="group" aria-label={fmt(s.breakdownProposals, { n: items.length })}>
      <p className="assistant-hint">{fmt(s.breakdownProposals, { n: items.length })}</p>
      {groups.map(([scene, indexes]) => (
        <section key={scene} className="breakdown-group">
          {groups.length > 1 && <h4 className="breakdown-scene">{titleOf(scene)}</h4>}
          <ul className="breakdown-checks">
            {indexes.map((i) => {
              const p = items[i];
              return (
                <li key={i}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!unchecked.has(i)}
                      aria-label={fmt(s.breakdownCheck, { entry: p.entry, category: s.categories[p.field], scene: titleOf(p.scene) })}
                      onChange={(e) => {
                        const next = new Set(unchecked);
                        if (e.target.checked) next.delete(i);
                        else next.add(i);
                        setUnchecked(next);
                      }}
                    />
                    <span>
                      <span className="breakdown-category">{s.categories[p.field]}</span> {p.entry}
                    </span>
                  </label>
                  <Quote text={p.quote} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="assistant-actions">
        <button type="button" className="is-primary" disabled={kept.length === 0} onClick={() => onDone(useCosmos.getState().addBreakdown(kept))}>
          {fmt(s.breakdownAdd, { n: kept.length })}
        </button>
        <button type="button" onClick={() => onDone(-1)}>
          {t.ai.ignore}
        </button>
      </div>
    </div>
  );
}

/** Lit les scènes données par lots, avec la progression ; rend les propositions de tous les lots. */
function useBreakdownRun() {
  const { config, lang } = useAi();
  const s = useT().structure;
  const ai = useAiRun();
  const [items, setItems] = useState<BreakdownProposal[] | null>(null);
  const start = (only?: string) =>
    ai.run(async (signal) => {
      if (!config) return;
      setItems(null);
      const state = useCosmos.getState();
      const scenes = breakdownScenes(state.screenplay, lang, only);
      if (scenes.length === 0) return ai.setMessage(s.breakdownNoScenes);
      // Lots plus petits pour un petit modèle (Apple sur l'appareil, ai/limits.ts).
      const batches = breakdownBatches(scenes, packBudget(config.provider, BREAKDOWN_BUDGET));
      const fiches = Object.fromEntries(state.nodes.map((n) => [n.id, n.data.fiche]));
      let found: BreakdownProposal[] = [];
      let rejected = 0;
      for (let i = 0; i < batches.length; i++) {
        if (batches.length > 1) ai.setMessage(fmt(s.breakdownProgress, { n: i + 1, total: batches.length }));
        const prompt = breakdownPrompt(batches[i], lang);
        const parsed = parseBreakdown(await complete(config, prompt.system, prompt.user, { json: true, maxTokens: 3000, signal }), batches[i], fiches);
        found = [...found, ...parsed.items];
        rejected += parsed.rejected;
      }
      setItems(found);
      ai.setMessage(found.length === 0 ? s.breakdownNone : rejected === 1 ? s.rejectedOne : rejected > 0 ? fmt(s.rejected, { n: rejected }) : "");
    });
  const done = (added: number) => {
    setItems(null);
    ai.setMessage(added > 0 ? s.breakdownAdded : "");
  };
  return { ...ai, ready: !!config, items, start, done };
}

/** Dépouillement d'une scène de scénario, dans sa fiche de la Bible ou sa carte agrandie. */
export function BreakdownSheet({ card }: { card: CardData }) {
  const t = useT();
  const s = t.structure;
  const id = useId();
  const setFiche = useCosmos((st) => st.setFiche);
  const filled = BREAKDOWN_FIELDS.filter((f) => card.fiche?.[f]?.trim()).length;
  const [open, setOpen] = useState(filled > 0);
  const job = useBreakdownRun();
  return (
    <section className="sheet breakdown-sheet" aria-label={s.breakdownTitle}>
      <button type="button" className="sheet-toggle" aria-expanded={open} aria-controls={`${id}-fields`} onClick={() => setOpen(!open)}>
        <span>{s.breakdownTitle}</span>
        <span className="sheet-count">{fmt(t.character.filled, { n: filled, total: BREAKDOWN_FIELDS.length })}</span>
        <span aria-hidden="true" className="sheet-chevron">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div id={`${id}-fields`}>
          <p className="gallery-hint">{s.breakdownHint}</p>
          <div className="sheet-fields">
            {BREAKDOWN_FIELDS.map((key) => (
              <div key={key} className="sheet-field">
                <label htmlFor={`${id}-${key}`}>{s.categories[key]}</label>
                <textarea id={`${id}-${key}`} rows={2} value={card.fiche?.[key] ?? ""} placeholder={s.breakdownPlaceholder} onChange={(e) => setFiche(card.id, key, e.target.value)} />
              </div>
            ))}
          </div>
          {job.ready && (
            <>
              <div className="assistant-bar">
                <button type="button" className="ghost-button assistant-toggle" disabled={job.busy} title={s.breakdownSceneHint} onClick={() => void job.start(card.id)}>
                  {s.breakdownScene}
                </button>
                {job.busy && (
                  <button type="button" className="ghost-button assistant-toggle" onClick={job.cancel}>
                    {t.ai.cancel}
                  </button>
                )}
              </div>
              <p className="ai-message" role="status">
                {job.message}
              </p>
              {job.items && job.items.length > 0 && <BreakdownProposals items={job.items} onDone={job.done} />}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Onglet « Dépouillement » des Statistiques d'un scénario : dépouiller tout le scénario, puis la liste par catégorie. */
export function BreakdownStats() {
  const t = useT();
  const s = t.structure;
  const lang = useSettings((st) => st.lang);
  const nodes = useCosmos((st) => st.nodes);
  const screenplay = useCosmos((st) => st.screenplay);
  const job = useBreakdownRun();
  // Scènes dans l'ordre du scénario.
  const scenes = useMemo(() => {
    const order = (screenplay?.elements ?? []).flatMap((el) => (el.type === "sceneHeading" && el.cardId ? [el.cardId] : []));
    const byId = new Map(nodes.map((n) => [n.id, n.data]));
    return order.flatMap((id) => (byId.get(id)?.type === "scene" ? [byId.get(id)!] : []));
  }, [nodes, screenplay]);
  const byCategory = useMemo(() => breakdownByCategory(scenes, lang), [scenes, lang]);
  const titleOf = (id: string) => scenes.find((c) => c.id === id)?.title.trim() || t.screenplay.untitledScene;
  const any = BREAKDOWN_FIELDS.some((f) => byCategory[f].length > 0);
  const open = (id: string) => {
    useCosmos.getState().setDialog(null);
    useCosmos.getState().openInBible(id);
  };
  return (
    <div className="char-stats breakdown-stats">
      <div className="cross-head">
        <p className="muted">{job.ready ? s.breakdownAllHint : s.breakdownNoAi}</p>
        {job.ready && (
          <div className="assistant-bar">
            <button type="button" className="ghost-button" disabled={job.busy} onClick={() => void job.start()}>
              {s.breakdownAll}
            </button>
            {job.busy && (
              <button type="button" className="ghost-button" onClick={job.cancel}>
                {t.ai.cancel}
              </button>
            )}
          </div>
        )}
      </div>
      <p className="ai-message" role="status">
        {job.message}
      </p>
      {job.items && job.items.length > 0 && <BreakdownProposals items={job.items} onDone={job.done} />}
      {!any ? (
        <p className="muted">{s.breakdownEmpty}</p>
      ) : (
        <>
          <p className="muted char-stats-note">{s.breakdownIntro}</p>
          {BREAKDOWN_FIELDS.filter((f) => byCategory[f].length > 0).map((field: BreakdownField) => (
            <section key={field} className="breakdown-category-list">
              <h3 className="char-stats-title">
                {s.categories[field]} <span className="plan-count">{byCategory[field].length}</span>
              </h3>
              <ul>
                {byCategory[field].map((row) => (
                  <li key={row.entry}>
                    <strong>{row.entry}</strong>
                    <span className="muted"> · {row.scenes.length === 1 ? s.breakdownSceneOne : fmt(s.breakdownSceneCount, { n: row.scenes.length })} </span>
                    {row.scenes.map((id, i) => (
                      <span key={id}>
                        {i > 0 && s.listSep}
                        <button type="button" className="link-button" aria-label={fmt(s.openScene, { title: titleOf(id) })} onClick={() => open(id)}>
                          {titleOf(id)}
                        </button>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// ---------- Après un import ----------

/** Invitation à la rétro-bible après l'import d'un manuscrit : « Ouvrir la Bible » ou « Fermer ». */
export function RetroInvite() {
  const s = useT().structure;
  const on = useCosmos((st) => st.retroInvite);
  const { config } = useAi();
  // Rétro-bible refusée par le service choisi (petit modèle d'Apple) : pas d'invitation qui ne mènerait à rien.
  if (!on || (config && !allows(config.provider, "retro"))) return null;
  const close = () => useCosmos.getState().setRetroInvite(false);
  return (
    <div className="app-alert retro-invite" role="status">
      <span>{config ? s.retroInvite : s.retroInviteNoAi}</span>
      <span className="app-alert-actions">
        {config && (
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              close();
              useCosmos.getState().setView("bible");
            }}
          >
            {s.retroInviteOpen}
          </button>
        )}
        <button type="button" className="ghost-button" onClick={close}>
          {s.dismiss}
        </button>
      </span>
    </div>
  );
}
