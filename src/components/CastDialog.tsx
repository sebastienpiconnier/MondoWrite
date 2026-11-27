// Fenêtre « Trouver les personnages du texte » (dialogue `cast`, #172) : ouverte par le menu IA de la barre du haut et
// par l'invitation qui suit un import. L'IA lit les scènes par paquets (ai/cast.ts) ; chaque personnage proposé a sa
// ligne, avec le passage qui le cite. L'auteur décide ligne par ligne : créer la fiche (faits cités, cochés un par un),
// relier aux scènes (celles où il parle cochées, celles où il est seulement nommé décochées), ajouter un nom comme
// surnom d'une fiche proche, ou ignorer. Chaque acceptation est une étape d'annulation (`acceptCast`). Jamais de rôle
// proposé. Les propositions vivent pour la séance (fenêtre refermée, elles restent), jamais dans le projet.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { aiConfig, useSettings } from "../settings";
import { aiErrorText, complete, isReady, localContext, type AiConfig } from "../ai/providers";
import { packBudget } from "../ai/limits";
import { CAST_FIELDS, CAST_MAX_PACKETS, CAST_PACKET, castKey, castPackets, castPrompt, knownCharacters, matchCast, mergeCast, newNames, parseCast, type CastField, type CastMatch, type CastProposal } from "../ai/cast";
import { castScenes } from "../structureSources";
import { typeColor, type CardData } from "../types";

interface CastState {
  items: CastProposal[];
  /** Personnages écartés par « Ignorer » (clé du nom), pour la séance. */
  ignored: Set<string>;
  /** Personnages acceptés : clé du nom → fiche. */
  done: Map<string, string>;
  run: { done: number; total: number } | null;
  /** Une lecture a déjà eu lieu (sinon la fenêtre montre son introduction). */
  read: boolean;
  message: string;
  rejected: number;
  leftOut: string;
}
const EMPTY = (): CastState => ({ items: [], ignored: new Set(), done: new Map(), run: null, read: false, message: "", rejected: 0, leftOut: "" });
export const useCastFinder = create<CastState>(EMPTY);
let controller: AbortController | null = null;

// Projet fermé : la lecture s'arrête et ses propositions partent avec lui.
useCosmos.subscribe((s, prev) => {
  if (s.screen !== "project" && prev.screen === "project") {
    controller?.abort();
    controller = null;
    useCastFinder.setState(EMPTY());
  }
});

type Texts = ReturnType<typeof useT>;

async function runCast(config: AiConfig, lang: string, scope: string[] | null, t: Texts) {
  if (useCastFinder.getState().run) return;
  const s = t.cast;
  const state = useCosmos.getState();
  let scenes = castScenes(state, lang);
  if (scope) scenes = scenes.filter((scene) => scope.includes(scene.id));
  const set = useCastFinder.setState;
  set({ items: [], rejected: 0, leftOut: "", read: true, message: "" });
  if (!scenes.some((scene) => scene.paragraphs.length > 0)) return set({ message: s.noText });
  controller = new AbortController();
  const signal = controller.signal;
  try {
    await localContext(config);
    const packs = castPackets(scenes, packBudget(config.provider, CAST_PACKET));
    const total = Math.min(packs.length, CAST_MAX_PACKETS);
    const known = knownCharacters(state.nodes.map((n) => n.data));
    const labels = t.character.fields as Record<string, string>;
    const fields = CAST_FIELDS.map((key) => ({ key, label: labels[key] ?? key }));
    let found: CastProposal[] = [];
    let rejected = 0;
    for (let i = 0; i < total; i++) {
      set({ run: { done: i, total }, message: fmt(s.progress, { n: i + 1, total }) });
      const prompt = castPrompt(packs[i], known, fields, lang, state.kind);
      const reply = await complete(config, prompt.system, prompt.user, { json: true, maxTokens: 2500, signal });
      const parsed = parseCast(reply, packs[i]);
      found = mergeCast(found, parsed.items);
      rejected += parsed.rejected;
      set({ items: found, rejected });
    }
    set({ message: "", leftOut: packs.length > total ? fmt(s.leftOut, { max: total, n: packs.length - total }) : "" });
  } catch (err) {
    console.error(err);
    set({ message: aiErrorText(err, t.ai.errors) });
  } finally {
    controller = null;
    set({ run: null });
  }
}

/** Une proposition telle que la fenêtre la montre : ce qu'elle est pour le projet et ce qu'il reste à y faire. */
interface Row {
  key: string;
  p: CastProposal;
  match: CastMatch;
  /** Fiche existante (déjà dans la Bible, ou proche). */
  card: CardData | null;
  /** Noms à proposer comme surnoms. */
  names: string[];
  /** Faits pour un champ encore vide. */
  facts: CastProposal["facts"];
  /** Scènes qui ont une carte et ne sont pas déjà reliées à la fiche. */
  scenes: { id: string; title: string; speaks: boolean }[];
}

function useRows(): { rows: Row[]; upToDate: number } {
  const items = useCastFinder((s) => s.items);
  const ignored = useCastFinder((s) => s.ignored);
  const done = useCastFinder((s) => s.done);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  return useMemo(() => {
    const cards = nodes.map((n) => n.data);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const linked = (a: string, b: string) => edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
    const rows: Row[] = [];
    let upToDate = 0;
    for (const p of items) {
      const key = castKey(p.name);
      if (ignored.has(key)) continue;
      const match = done.has(key) ? ({ kind: "known", id: done.get(key)! } as const) : matchCast(p, cards);
      if (match.kind === "other") continue;
      const card = match.kind === "new" ? null : (byId.get(match.id) ?? null);
      // Nouvelle fiche : ni le titre ni le prénom seul ne deviennent des surnoms (la Bible les reconnaît déjà).
      const names = newNames(p, card ?? { id: "", type: "personnage", title: p.name, html: "" }).filter((n) => match.kind === "close" || castKey(n) !== castKey(card?.title ?? p.name));
      const facts = p.facts.filter((f) => !card?.fiche?.[f.field]?.trim());
      const scenes = p.scenes.flatMap((s) => {
        const scene = byId.get(s.id);
        if (scene?.type !== "scene" || (card && linked(card.id, s.id))) return [];
        return [{ id: s.id, title: scene.title.trim(), speaks: s.speaks }];
      });
      if (match.kind === "known" && !done.has(key) && names.length === 0 && facts.length === 0 && scenes.length === 0) {
        upToDate++;
        continue;
      }
      rows.push({ key, p, match, card, names, facts, scenes });
    }
    return { rows, upToDate };
  }, [items, ignored, done, nodes, edges]);
}

function CastRow({ row, onOpen }: { row: Row; onOpen: (id: string) => void }) {
  const t = useT();
  const s = t.cast;
  const { p, match, card } = row;
  const done = useCastFinder((st) => st.done.get(row.key));
  const labels = t.character.fields as Record<string, string>;
  const [name, setName] = useState(p.name);
  const [names, setNames] = useState(() => new Set(row.names));
  const [facts, setFacts] = useState(() => new Set<CastField>(row.facts.map((f) => f.field)));
  // Ceux qui parlent cochés d'office ; seulement nommés, décochés (on peut parler de quelqu'un sans qu'il soit là).
  const [scenes, setScenes] = useState(() => new Set(row.scenes.filter((x) => x.speaks).map((x) => x.id)));
  const id = useId();

  if (done) {
    const title = useCosmos.getState().nodes.find((n) => n.id === done)?.data.title.trim() || name;
    return (
      <li className="vrac-item cast-item is-done" style={{ ["--type" as string]: typeColor("personnage") }}>
        <p className="cast-done">{fmt(s.done, { name: title })}</p>
        <button type="button" className="link-button" onClick={() => onOpen(done)}>
          {s.openSheet}
        </button>
      </li>
    );
  }

  const toggle = <T,>(set: Set<T>, value: T, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  };
  const chosen = () => ({
    fiche: Object.fromEntries(row.facts.filter((f) => facts.has(f.field)).map((f) => [f.field, f.value])) as Partial<Record<CastField, string>>,
    nicknames: row.names.filter((n) => names.has(n)),
    scenes: [...scenes],
  });
  const accept = (input: { cardId?: string; title?: string; extra?: string[] }) => {
    const c = chosen();
    const made = useCosmos.getState().acceptCast({ cardId: input.cardId, title: input.title, fiche: c.fiche, nicknames: [...(input.extra ?? []), ...c.nicknames], scenes: c.scenes });
    if (!made) return;
    useCastFinder.setState((st) => ({ done: new Map(st.done).set(row.key, made) }));
  };
  const ignore = () => useCastFinder.setState((st) => ({ ignored: new Set(st.ignored).add(row.key) }));
  const cardTitle = card?.title.trim() ?? "";
  const nothing = facts.size === 0 && names.size === 0 && scenes.size === 0;

  return (
    <li className="vrac-item cast-item" style={{ ["--type" as string]: typeColor("personnage") }} aria-labelledby={`${id}-name`}>
      <div className="vrac-head">
        {match.kind === "new" ? (
          <input id={`${id}-name`} className="vrac-title" value={name} aria-label={s.nameAria} onChange={(e) => setName(e.target.value)} />
        ) : (
          <strong id={`${id}-name`} className="cast-name">
            {p.name}
          </strong>
        )}
        <span className="cast-status">{match.kind === "new" ? s.isNew : fmt(match.kind === "known" ? s.isKnown : s.isClose, { name: cardTitle })}</span>
      </div>
      <p className="ai-quote" aria-label={t.structure.quoteAria}>
        {fmt(t.structure.quote, { text: p.quote })}
      </p>
      {row.names.length > 0 && (
        <fieldset className="cast-group">
          <legend>{s.others}</legend>
          {row.names.map((n) => (
            <label key={n} className="cast-check">
              <input type="checkbox" checked={names.has(n)} aria-label={fmt(s.otherAria, { name: n })} onChange={(e) => setNames(toggle(names, n, e.target.checked))} />
              <span>{n}</span>
            </label>
          ))}
        </fieldset>
      )}
      {row.facts.length > 0 && (
        <fieldset className="cast-group">
          <legend>{s.facts}</legend>
          {row.facts.map((f) => (
            <label key={f.field} className="cast-check">
              <input type="checkbox" checked={facts.has(f.field)} aria-label={fmt(s.factAria, { field: labels[f.field] ?? f.field, value: f.value })} onChange={(e) => setFacts(toggle(facts, f.field, e.target.checked))} />
              <span>
                <b>{labels[f.field] ?? f.field}</b> {f.value}
                <span className="cast-fact-quote">{fmt(t.structure.quote, { text: f.quote })}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {row.scenes.length > 0 && (
        <fieldset className="cast-group">
          <legend>{s.scenes}</legend>
          {row.scenes.map((x) => {
            const title = x.title || s.untitledScene;
            return (
              <label key={x.id} className="cast-check">
                <input type="checkbox" checked={scenes.has(x.id)} aria-label={fmt(s.sceneAria, { title })} onChange={(e) => setScenes(toggle(scenes, x.id, e.target.checked))} />
                <span>
                  {title} <span className="cast-speaks">· {x.speaks ? s.speaks : s.named}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      <div className="assistant-actions">
        {match.kind === "new" && (
          <button type="button" className="is-primary" disabled={!name.trim()} onClick={() => accept({ title: name })}>
            {s.create}
          </button>
        )}
        {match.kind === "known" && card && (
          <button type="button" className="is-primary" disabled={nothing} onClick={() => accept({ cardId: card.id })}>
            {facts.size === 0 && names.size === 0 ? fmt(s.link, { n: scenes.size }) : s.addKnown}
          </button>
        )}
        {match.kind === "close" && card && (
          <>
            <button type="button" className="is-primary" onClick={() => accept({ cardId: card.id, extra: [p.name] })}>
              {fmt(s.asNickname, { name: cardTitle })}
            </button>
            <button type="button" onClick={() => accept({ title: p.name })}>
              {s.createOther}
            </button>
          </>
        )}
        <button type="button" onClick={ignore}>
          {t.ai.ignore}
        </button>
      </div>
    </li>
  );
}

export function CastDialog() {
  const t = useT();
  const s = t.cast;
  const aiSettings = useSettings((st) => st.ai);
  const config = useMemo(() => aiConfig(aiSettings), [aiSettings]);
  const lang = useSettings((st) => st.lang);
  const run = useCastFinder((st) => st.run);
  const read = useCastFinder((st) => st.read);
  const message = useCastFinder((st) => st.message);
  const rejected = useCastFinder((st) => st.rejected);
  const leftOut = useCastFinder((st) => st.leftOut);
  const { rows, upToDate } = useRows();
  // Scènes choisies sur le canevas à l'ouverture de la fenêtre.
  const [selected] = useState(() => useCosmos.getState().nodes.filter((n) => n.selected && n.data.type === "scene").map((n) => n.id));
  const total = useCosmos((st) => (st.kind === "scenario" ? st.nodes.filter((n) => n.data.type === "scene").length : st.nodes.filter((n) => n.data.type === "scene" && !n.data.page).length));
  const [scope, setScope] = useState<"all" | "selected">(selected.length > 0 ? "selected" : "all");
  const startRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!read) startRef.current?.focus({ preventScroll: true });
  }, [read]);

  const start = () => {
    if (!isReady(config)) return;
    void runCast(config, lang, scope === "selected" ? selected : null, t);
  };
  const open = (cardId: string) => {
    useCosmos.getState().setDialog(null);
    useCosmos.getState().openInBible(cardId);
  };

  return (
    <div className="replace-panel vrac-panel cast-panel">
      <h2 id="app-dialog-title">{s.title}</h2>
      {!read && <p className="vrac-intro">{s.intro}</p>}
      {selected.length > 0 && !run && (
        <fieldset className="cast-scope">
          <legend>{s.scopeLegend}</legend>
          <label>
            <input type="radio" name={`${id}-scope`} checked={scope === "all"} onChange={() => setScope("all")} />
            <span>{fmt(s.scopeAll, { n: total })}</span>
          </label>
          <label>
            <input type="radio" name={`${id}-scope`} checked={scope === "selected"} onChange={() => setScope("selected")} />
            <span>{fmt(s.scopeSelected, { n: selected.length })}</span>
          </label>
        </fieldset>
      )}
      <p className="replace-count" role="status">
        {message || (read && !run && rows.length === 0 ? (upToDate > 0 ? s.empty : s.none) : "")}
      </p>
      {rejected > 0 && <p className="settings-hint">{fmt(s.rejected, { n: rejected })}</p>}
      {leftOut && <p className="settings-hint">{leftOut}</p>}
      {rows.length > 0 && (
        <>
          <h3>{fmt(s.found, { n: rows.length })}</h3>
          <ul className="vrac-list cast-list">
            {rows.map((row) => (
              <CastRow key={row.key} row={row} onOpen={open} />
            ))}
          </ul>
        </>
      )}
      {upToDate > 0 && <p className="settings-hint">{fmt(s.upToDate, { n: upToDate })}</p>}
      <div className="assistant-actions replace-actions">
        {run ? (
          <button type="button" onClick={() => controller?.abort()}>
            {s.cancel}
          </button>
        ) : (
          <button type="button" onClick={() => useCosmos.getState().setDialog(null)}>
            {s.close}
          </button>
        )}
        <button ref={startRef} type="button" className={read ? undefined : "is-primary"} disabled={!!run || !isReady(config)} onClick={start}>
          {read ? s.again : s.run}
        </button>
      </div>
    </div>
  );
}
