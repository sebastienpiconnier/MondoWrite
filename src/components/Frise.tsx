// La frise (#173) : une vue du projet au même titre que le canevas. Le récit en cartes sur une ligne, la largeur de
// chaque carte suit la longueur de sa scène (pages d'un scénario, mots d'un roman ramenés en pages). Trois lectures :
// Récit (une rangée par étape de la structure, chapitre ou épisode), Intrigues et Personnages (une ligne commune, une
// piste par carte, comme l'ancienne chronologie du Plan). Rien n'est enregistré à part : déplacer une carte déplace la
// scène dans le récit (Plan ou Fountain), toucher une case tire ou retire le fil du canevas.
// Trois chemins : glisser à la souris, Alt + ← → au clavier, « Plus tôt » et « Plus tard » dans le volet au doigt.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import { planScenes, SCENE_AT, useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { typeColor, type CardData, type CardType } from "../types";
import { chapterNumbers, hasSubBeats, templateBeats } from "../plan";
import { countWords } from "../manuscript";
import { WORDS_PER_PAGE } from "../stats";
import { paginate, pagesBetween } from "../screenplay/paginate";
import { LAYOUTS } from "../screenplay/layout";
import { blocks } from "../screenplay/sequence";
import { screenplayPlan } from "../screenplay/template";
import { allEpisodes, isSeries } from "../screenplay/series";
import { sceneSynopsis } from "../screenplay/scenes";
import { eighthsOf, formatEighths } from "../screenplay/eighths";
import { heroIssues } from "../ribbon";
import { screenplaySceneTexts, timeline } from "../timeline";
import { useInteractive } from "../interactive/useInteractive";
import {
  CARD_GAP,
  DEFAULT_SCALE,
  FRISE_GROUPS,
  FRISE_SCALES,
  cardWidth,
  characterIssues,
  friseTotal,
  layoutScenes,
  laneCurve,
  moveSceneBefore,
  moveSceneToRowEnd,
  novelRows,
  rowSize,
  rowStarts,
  rulerTicks,
  screenplayRows,
  stepScene,
  type FriseGroup,
  type FriseRow,
  type FriseScene,
  type Slot,
} from "../frise";
import type { CurvePoint } from "../ribbon";
import { useBeatText } from "./useBeatText";
import { usePlotColor } from "./usePlotColor";
import { StatusDot, SceneStatusPicker } from "./SceneStatusPicker";
import { PovPicker } from "./PovPicker";
import { SceneIssue } from "./SceneIssue";
import { SceneLinks } from "./LinkedCards";
import { SynopsisField } from "./SynopsisField";

/** Ce que la vue lit du projet : rangées, scènes à la suite, longueur totale. */
function useFriseData() {
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const paper = useCosmos((s) => s.paper);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const sceneKey = useMemo(() => planScenes(nodes).join(" "), [nodes]);
  const titles = useMemo(() => new Map(nodes.map((n) => [n.id, n.data.title.trim()])), [nodes]);
  return useMemo(() => {
    let rows: FriseRow[];
    let starts = new Map<string, number>();
    if (kind === "scenario") {
      const els = screenplay?.elements ?? [];
      const pagination = paginate(els, LAYOUTS[paper]);
      const pages = (a: number, b: number) => pagesBetween(pagination, a, b);
      if (screenplay && isSeries(screenplay)) rows = screenplayRows(els, pages, "episodes");
      else {
        const { template, custom } = screenplayPlan(els);
        rows = template === "libre" ? screenplayRows(els, pages, "none") : screenplayRows(els, pages, "beats", new Set(templateBeats(template, custom)), (key) => !hasSubBeats(custom, key));
      }
      starts = new Map(blocks(els).filter((b) => b.kind === "scene").map((b) => [b.cardId ?? `@${b.start}`, b.start]));
    } else {
      const ids = sceneKey ? sceneKey.split(" ") : [];
      rows = novelRows(plan, ids, (id) => titles.get(id) ?? "", (id) => countWords(manuscript[id]), WORDS_PER_PAGE);
    }
    const all = rows.flatMap((r) => r.scenes);
    return { rows, all, total: friseTotal(rows), starts };
  }, [kind, screenplay, paper, plan, manuscript, sceneKey, titles]);
}

export function Frise() {
  const t = useT();
  const f = t.frise;
  const lang = useSettings((s) => s.lang);
  const vocab = useVocab();
  const kind = useCosmos((s) => s.kind);
  const plan = useCosmos((s) => s.plan);
  const nodes = useCosmos((s) => s.nodes);
  const screenplay = useCosmos((s) => s.screenplay);
  const interactive = useInteractive();
  const beatText = useBeatText();
  const plotColor = usePlotColor();
  const { rows, all, total, starts } = useFriseData();

  const [group, setGroup] = useState<FriseGroup>("story");
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const dragRef = useRef<string | null>(null);
  const refocus = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const px = FRISE_SCALES[scale];

  // Un roman interactif n'a pas de frise (le menu ne la propose pas) : une position « Reprendre » qui y mène revient au canevas.
  useEffect(() => {
    if (interactive) useCosmos.getState().setView("toile");
  }, [interactive]);

  const cards = useMemo(() => new Map(nodes.map((n) => [n.id, n.data])), [nodes]);
  const index = useMemo(() => new Map(all.map((s, i) => [s.id, i])), [all]);
  // Page où commence chaque scène (0 au début du récit).
  const before = useMemo(() => {
    const out = new Map<string, number>();
    let acc = 0;
    for (const s of all) {
      out.set(s.id, acc);
      acc += s.size;
    }
    return out;
  }, [all]);
  const chapterNo = useMemo(() => (kind === "scenario" ? new Map<string, number>() : chapterNumbers(plan, all.map((s) => s.id))), [kind, plan, all]);
  const episodes = useMemo(() => new Map((screenplay ? allEpisodes(screenplay.elements) : []).map((e) => [e.id, e])), [screenplay]);

  // Une scène retirée ailleurs (corbeille, autre vue) ferme le volet.
  const shown = selected && index.has(selected) ? selected : null;

  // Après un déplacement, le focus suit la carte.
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    rootRef.current?.querySelector<HTMLElement>(`[data-scene-id="${CSS.escape(id)}"]`)?.focus();
  });

  const titleOf = (s: FriseScene) => s.title || (cards.get(s.id)?.title.trim() ?? "") || t.plan.untitled;
  const lengthOf = (s: FriseScene) => (kind === "scenario" ? fmt(f.pages, { n: formatEighths(eighthsOf(s.size)) || "0" }) : fmt(f.words, { n: (s.words ?? 0).toLocaleString(lang) }));
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const rowLabel = (row: FriseRow): string => {
    if (row.kind === "beat" && row.key) return beatText(row.key).label;
    if (row.kind === "chapter" && row.key) {
      const chapter = plan.chapters?.find((c) => c.id === row.key);
      const n = chapterNo.get(row.key) ?? 0;
      return chapter?.title.trim() ? fmt(t.chapters.numberedTitle, { n, title: chapter.title.trim() }) : fmt(t.chapters.numbered, { n });
    }
    if (row.kind === "episode" && row.key) {
      const ep = episodes.get(row.key);
      if (!ep) return t.season.untitled;
      return ep.title.trim() ? fmt(t.season.episodeTitled, { n: ep.number, title: ep.title.trim() }) : fmt(t.season.episodeNumber, { n: ep.number });
    }
    if (rows.length === 1) return f.whole;
    if (kind === "scenario") return isSeries(screenplay) ? t.season.outside : f.beforeFirst;
    return plan.template === "libre" ? f.noChapter : t.plan.unplaced;
  };

  const say = (id: string) => {
    // Lu après le rendu : le rang a changé.
    setTimeout(() => {
      const st = useCosmos.getState();
      const title = st.nodes.find((n) => n.id === id)?.data.title.trim() || t.plan.untitled;
      const list = rootRef.current?.querySelectorAll("[data-scene-id]");
      const ids = list ? [...list].map((el) => (el as HTMLElement).dataset.sceneId) : [];
      const n = ids.indexOf(id) + 1;
      if (n > 0) setAnnounce(fmt(f.moved, { title, n, total: ids.length }));
    }, 0);
  };

  const writeScript = (next: ReturnType<typeof moveSceneBefore>) => {
    const sp = useCosmos.getState().screenplay;
    if (!sp || next === sp.elements) return false;
    useCosmos.getState().setScreenplay({ ...sp, elements: next }, true);
    return true;
  };

  const moveBefore = (id: string, target: string) => {
    if (id === target) return;
    const st = useCosmos.getState();
    const moved = kind === "scenario" ? writeScript(moveSceneBefore(st.screenplay?.elements ?? [], id, target)) : st.moveBookScene(id, target, "before");
    if (moved && !id.startsWith(SCENE_AT)) {
      refocus.current = id;
      say(id);
    }
  };

  const moveToEnd = (id: string, row: FriseRow) => {
    const st = useCosmos.getState();
    let moved = false;
    if (kind === "scenario") moved = writeScript(moveSceneToRowEnd(st.screenplay?.elements ?? [], id, row));
    else if (row.kind === "beat" && row.key) {
      st.placeInPlan(id, row.key);
      moved = true;
    } else if (row.kind === "none" && plan.template !== "libre") {
      st.placeInPlan(id, null);
      moved = true;
    } else {
      const last = row.scenes.filter((s) => s.id !== id).at(-1);
      if (last) moved = st.moveBookScene(id, last.id, "after");
    }
    if (moved && !id.startsWith(SCENE_AT)) {
      refocus.current = id;
      say(id);
    }
  };

  const step = (id: string, way: -1 | 1) => {
    const st = useCosmos.getState();
    const moved = kind === "scenario" ? writeScript(stepScene(st.screenplay?.elements ?? [], id, way < 0 ? "earlier" : "later")) : st.stepBookScene(id, way < 0 ? "up" : "down");
    if (moved && !id.startsWith(SCENE_AT)) {
      refocus.current = id;
      say(id);
    }
  };

  const focusScene = (id: string | undefined) => {
    if (id) rootRef.current?.querySelector<HTMLElement>(`[data-scene-id="${CSS.escape(id)}"]`)?.focus();
  };

  const onCardKey = (e: KeyboardEvent, s: FriseScene) => {
    const i = index.get(s.id) ?? 0;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const way = e.key === "ArrowRight" ? 1 : -1;
      if (e.altKey) step(s.id, way);
      else focusScene(all[i + way]?.id);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusScene(all[0]?.id);
    } else if (e.key === "End") {
      e.preventDefault();
      focusScene(all.at(-1)?.id);
    } else if (e.key === "Escape" && shown) {
      setSelected(null);
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
    setOver(null);
  };
  const dropOn = (e: DragEvent, run: (id: string) => void) => {
    e.preventDefault();
    const id = dragRef.current;
    endDrag();
    if (id) run(id);
  };

  const sceneCard = (s: FriseScene, style?: CSSProperties) => {
    const card = cards.get(s.id);
    const look = plotColor(card ? s.id : undefined);
    const n = (index.get(s.id) ?? 0) + 1;
    const title = titleOf(s);
    const length = lengthOf(s);
    return (
      <button
        key={s.id}
        type="button"
        data-scene-id={s.id}
        className={`frise-card${shown === s.id ? " is-selected" : ""}${over === s.id ? " is-over" : ""}${look.className}`}
        style={{ width: cardWidth(s.size, px), ...look.style, ...style }}
        aria-pressed={shown === s.id}
        aria-label={fmt(f.sceneAria, { n, title, length }) + (look.label ? `. ${look.label}` : "")}
        title={look.label}
        draggable
        onDragStart={(e) => {
          dragRef.current = s.id;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", title);
          setDragging(true);
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!dragRef.current) return;
          e.preventDefault();
          if (over !== s.id) setOver(s.id);
        }}
        onDragLeave={() => over === s.id && setOver(null)}
        onDrop={(e) => dropOn(e, (id) => moveBefore(id, s.id))}
        onClick={() => setSelected(shown === s.id ? null : s.id)}
        onKeyDown={(e) => onCardKey(e, s)}
      >
        <span className="frise-card-top" aria-hidden="true">
          <span className="frise-num">{n}</span>
          {card && <StatusDot card={card} />}
        </span>
        <span className="frise-card-title" aria-hidden="true">
          {title}
        </span>
        <span className="frise-card-len" aria-hidden="true">
          {length}
        </span>
      </button>
    );
  };

  const totalLabel =
    kind === "scenario"
      ? `${fmt(t.screenplay.minutes, { n: Math.round(total) })} · ${fmt(Math.round(total) === 1 ? t.screenplay.pagesOne : t.screenplay.pagesMany, { n: Math.round(total) })}`
      : `${fmt(t.plan.summaryMany, { n: all.length })} · ${fmt(f.words, { n: all.reduce((a, s) => a + (s.words ?? 0), 0).toLocaleString(lang) })}`;

  if (interactive) return <div className="frise"><p className="sp-empty">{f.interactive}</p></div>;

  return (
    <div className="frise" ref={rootRef}>
      <header className="frise-head">
        <h1>{f.title}</h1>
        <div className="sq-modes" role="group" aria-label={f.groupsAria}>
          {FRISE_GROUPS.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>
              {f.groups[g]}
            </button>
          ))}
        </div>
        <div className="frise-zoom" role="group">
          <button type="button" className="icon-button" aria-label={f.zoomOut} title={f.zoomOut} disabled={scale === 0} onClick={() => setScale((v) => Math.max(0, v - 1))}>
            −
          </button>
          <button type="button" className="icon-button" aria-label={f.zoomIn} title={f.zoomIn} disabled={scale === FRISE_SCALES.length - 1} onClick={() => setScale((v) => Math.min(FRISE_SCALES.length - 1, v + 1))}>
            +
          </button>
        </div>
        {all.length > 0 && <p className="sq-total">{totalLabel}</p>}
      </header>
      {all.length === 0 ? (
        <p className="sp-empty">{f.empty}</p>
      ) : (
        <div className={`frise-body${shown ? " has-panel" : ""}`}>
          <div className="frise-scroll" role="region" aria-label={f.title} tabIndex={-1}>
            {group === "story" ? (
              <>
                <p className="sp-empty frise-hint">{f.hint}</p>
                <div className="frise-story">
                {rows.map((row, r) => {
                  const name = rowLabel(row);
                  // Chaque partie a la largeur de ses scènes (au moins celle d'une carte et demie, pour son titre).
                  const width = Math.max(168, row.scenes.reduce((a, s) => a + cardWidth(s.size, px), 0) + CARD_GAP * Math.max(0, row.scenes.length - 1));
                  return (
                    <section key={`${row.kind}:${row.key ?? r}`} className={`frise-row is-${row.kind}`} aria-label={name} style={{ width }}>
                      <h2 className="frise-row-head">
                        <span className="frise-row-name">{name}</span>
                        <span className="frise-row-meta">
                          {fmt(row.scenes.length === 1 ? t.plan.summaryOne : t.plan.summaryMany, { n: row.scenes.length })}
                          {total > 0 && <> · {fmt(f.share, { pct: pct(rowSize(row)) })}</>}
                        </span>
                      </h2>
                      <div className="frise-track">
                        {row.scenes.map((s) => sceneCard(s))}
                        {(dragging || row.scenes.length === 0) && (
                          <div
                            className={`frise-end${over === `end:${r}` ? " is-over" : ""}`}
                            aria-label={fmt(f.dropEnd, { name })}
                            onDragOver={(e) => {
                              if (!dragRef.current) return;
                              e.preventDefault();
                              setOver(`end:${r}`);
                            }}
                            onDragLeave={() => over === `end:${r}` && setOver(null)}
                            onDrop={(e) => dropOn(e, (id) => moveToEnd(id, row))}
                          >
                            {dragging ? f.dropHere : ""}
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
                </div>
              </>
            ) : (
              <FriseLanes group={group} rows={rows} all={all} px={px} rowLabel={rowLabel} sceneCard={sceneCard} />
            )}
          </div>
          {shown && (
            <FrisePanel
              key={shown}
              scene={all[index.get(shown) ?? 0]}
              n={(index.get(shown) ?? 0) + 1}
              total={all.length}
              startPage={Math.floor(before.get(shown) ?? 0) + 1}
              share={pct(before.get(shown) ?? 0)}
              rowName={rowLabel(rows.find((r) => r.scenes.some((s) => s.id === shown)) ?? rows[0])}
              title={titleOf(all[index.get(shown) ?? 0])}
              length={lengthOf(all[index.get(shown) ?? 0])}
              start={starts.get(shown)}
              writeView={vocab.views.manuscrit}
              onStep={(way) => step(shown, way)}
              onClose={() => {
                setSelected(null);
                focusScene(shown);
              }}
            />
          )}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

interface LanesProps {
  group: FriseGroup;
  rows: FriseRow[];
  all: FriseScene[];
  px: number;
  rowLabel: (row: FriseRow) => string;
  sceneCard: (s: FriseScene, style?: CSSProperties) => React.ReactNode;
}

const LANE_TYPES: Record<Exclude<FriseGroup, "story">, CardType[]> = { plots: ["intrigue", "theme"], chars: ["personnage"] };

/** Vues Intrigues et Personnages : une ligne commune, une piste par carte, la règle des pages en haut. */
function FriseLanes({ group, rows, all, px, rowLabel, sceneCard }: LanesProps) {
  const t = useT();
  const f = t.frise;
  const p = t.plan;
  const { types } = useVocab();
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const manuscript = useCosmos((s) => s.manuscript);
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const toggleLink = useCosmos((s) => s.toggleLink);
  const revealCard = useCosmos((s) => s.revealCard);
  const readThread = useCosmos((s) => s.readThread);

  const { slots, width } = useMemo(() => layoutScenes(all, px), [all, px]);
  const ticks = useMemo(() => rulerTicks(all, slots), [all, slots]);
  const bounds = useMemo(() => (rows.length > 1 ? rowStarts(rows, slots) : []), [rows, slots]);
  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const order = useMemo(() => all.map((s) => s.id).filter((id) => !id.startsWith(SCENE_AT)), [all]);
  const texts = useMemo(() => (kind === "scenario" && screenplay ? screenplaySceneTexts(screenplay.elements) : manuscript), [kind, screenplay, manuscript]);
  const groups = useMemo(() => timeline(cards, edges, texts, order, lang).filter((g) => (LANE_TYPES[group as Exclude<FriseGroup, "story">] ?? []).includes(g.type)), [cards, edges, texts, order, lang, group]);
  const storyCurve = useMemo(() => (group === "plots" ? laneCurve(all, slots, heroIssues(cards)) : null), [group, all, slots, cards]);
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title.trim() || p.untitled;
  const trackStyle = { width } as CSSProperties;

  const boundLines = bounds.map((b) => <span key={`${b.kind}:${b.key}`} className="frise-bound" style={{ left: b.x - CARD_GAP / 2 }} aria-hidden="true" />);

  return (
    <div className="frise-lanes">
      <p className="sp-empty frise-hint">{f.lanes.hint}</p>
      <div className="frise-lane is-ruler" aria-hidden="true">
        <div className="frise-lane-head">{f.ruler}</div>
        <div className="frise-lane-track" style={trackStyle}>
          {bounds.map((b, i) => (
            // Le nom d'une partie s'arrête avant la suivante (coupé, en entier au survol).
            <span key={`${b.kind}:${b.key}:${i}`} className="frise-bound-label" style={{ left: b.x, maxWidth: Math.max(24, (bounds[i + 1]?.x ?? width + 400) - b.x - 8) }} title={rowLabel(rows.find((r) => r.key === b.key && r.kind === b.kind) ?? rows[0])}>
              {rowLabel(rows.find((r) => r.key === b.key && r.kind === b.kind) ?? rows[0])}
            </span>
          ))}
          {ticks.map((tk) =>
            tk.label ? (
              <span key={tk.x} className="frise-tick" style={{ left: tk.x }}>
                {Math.floor(tk.page) + 1}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <div className="frise-lane is-scenes">
        <div className="frise-lane-head">{f.lanes.scenes}</div>
        <div className="frise-lane-track" style={trackStyle}>
          {boundLines}
          {all.map((s) => {
            const slot = slots.get(s.id) as Slot;
            return sceneCard(s, { position: "absolute", left: slot.x, width: slot.w });
          })}
        </div>
      </div>
      {storyCurve && (
        <div className="frise-lane is-curve">
          <div className="frise-lane-head">{f.lanes.story}</div>
          <div className="frise-lane-track" style={trackStyle}>
            {boundLines}
            <Curve points={storyCurve} width={width} label={f.lanes.story} />
          </div>
        </div>
      )}
      {groups.length === 0 && <p className="sp-empty">{group === "plots" ? f.lanes.noPlots : f.lanes.noChars}</p>}
      {groups.map((g) => (
        <section key={g.type} className="frise-lane-group" aria-label={types[g.type].section}>
          <h2 className="frise-lane-group-title">{types[g.type].section}</h2>
          {g.rows.map((row) => {
            const curve = group === "chars" ? laneCurve(all, slots, characterIssues(cards, row.card.id, row.card.fiche?.principal === "oui")) : null;
            return (
              <div key={row.card.id} className={`frise-lane${curve ? " has-curve" : ""}`}>
                <div className="frise-lane-head">
                  <button type="button" className="tl-card" title={fmt(p.show, { title: row.card.title })} onClick={() => revealCard(row.card.id)}>
                    <span className="card-dot" style={{ background: typeColor(g.type) }} />
                    {row.card.title.trim() || p.untitled}
                  </button>
                  <span className="tl-count">{row.count}</span>
                  {row.count > 0 && (
                    <button type="button" className="icon-button tl-read" aria-label={fmt(t.thread.readOf, { title: row.card.title })} title={fmt(t.thread.readOf, { title: row.card.title })} onClick={() => readThread(row.card.id)}>
                      <ReadIcon />
                    </button>
                  )}
                </div>
                <div className="frise-lane-track" style={trackStyle}>
                  {boundLines}
                  {curve && <Curve points={curve} width={width} label={fmt(f.lanes.curveOf, { name: row.card.title.trim() || p.untitled })} />}
                  {row.cells.map((cell, i) => {
                    const slot = slots.get(order[i]);
                    if (!slot) return null;
                    const names = { card: row.card.title, scene: titleOf(order[i]) };
                    const style = { left: slot.x, width: slot.w };
                    if (cell === "pov")
                      return (
                        <span key={order[i]} className="tl-cell frise-cell is-pov" style={style} role="img" aria-label={fmt(p.timelinePovCell, names)} title={fmt(p.timelinePovCell, names)}>
                          <span className="tl-mark is-pov" aria-hidden="true" />
                        </span>
                      );
                    return (
                      <button
                        key={order[i]}
                        type="button"
                        className={`tl-cell frise-cell is-${cell}`}
                        style={style}
                        aria-pressed={cell === "linked"}
                        aria-label={fmt(cell === "linked" ? p.timelineOn : cell === "cited" ? p.timelineCitedCell : p.timelineOff, names)}
                        onClick={() => toggleLink(order[i], row.card.id)}
                      >
                        <span className={`tl-mark is-${cell}`} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** Courbe « mieux / pire » posée dans une piste : milieu de chaque scène, de −1 (en bas) à 1 (en haut). */
function Curve({ points, width, label }: { points: CurvePoint[]; width: number; label: string }) {
  const h = 40;
  const y = (v: number) => h / 2 - v * (h / 2 - 5);
  const d = points.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${y(pt.y).toFixed(1)}`).join(" ");
  return (
    <svg className="frise-curve" width={width} height={h} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={label}>
      <line x1={0} x2={width} y1={h / 2} y2={h / 2} className="frise-curve-zero" />
      <path d={d} className="frise-curve-line" />
      {points
        .filter((pt) => pt.set)
        .map((pt) => (
          <circle key={pt.id} cx={pt.x} cy={y(pt.y)} r={3} className="frise-curve-dot" />
        ))}
    </svg>
  );
}

interface PanelProps {
  scene: FriseScene;
  n: number;
  total: number;
  startPage: number;
  share: number;
  rowName: string;
  title: string;
  length: string;
  /** Scénario : rang de l'en-tête de la scène. */
  start?: number;
  writeView: string;
  onStep: (way: -1 | 1) => void;
  onClose: () => void;
}

/** Volet de la scène choisie : ce qu'on règle d'elle sans quitter la frise, et les chemins vers les autres vues. */
function FrisePanel({ scene, n, total, startPage, share, rowName, title, length, start, writeView, onStep, onClose }: PanelProps) {
  const t = useT();
  const f = t.frise;
  const kind = useCosmos((s) => s.kind);
  const card = useCosmos((s) => s.nodes.find((x) => x.id === scene.id)?.data) as CardData | undefined;
  const screenplay = useCosmos((s) => s.screenplay);
  const closeRef = useRef<HTMLButtonElement>(null);
  const synopsis = kind === "scenario" ? (start !== undefined && screenplay ? sceneSynopsis(screenplay.elements, start) : "") : card?.fiche?.synopsis ?? "";
  const target = card ? scene.id : start !== undefined ? `${SCENE_AT}${start}` : null;

  return (
    <aside className="frise-panel" aria-label={f.panel.aria} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="frise-panel-head">
        <p className="frise-panel-kicker">
          {fmt(f.panel.kicker, { n, total })} · {rowName}
        </p>
        <button ref={closeRef} type="button" className="icon-button" aria-label={f.panel.close} title={f.panel.close} onClick={onClose}>
          ×
        </button>
      </div>
      <h2 className="frise-panel-title">{title}</h2>
      <p className="frise-panel-meta">
        {length} · {fmt(f.panel.position, { page: startPage, pct: share })}
      </p>
      {card ? (
        <>
          <div className="scene-pills">
            <SceneStatusPicker card={card} />
            <PovPicker card={card} />
          </div>
          <div className="frise-panel-field">
            <span className="frise-panel-label">{f.panel.synopsis}</span>
            <SynopsisField
              value={synopsis}
              scene={title}
              onSave={(v) => (kind === "scenario" ? useCosmos.getState().setCardSceneSynopsis(scene.id, v) : useCosmos.getState().setFiche(scene.id, "synopsis", v))}
            />
          </div>
          <SceneIssue card={card} />
          <SceneLinks id={scene.id} compact />
        </>
      ) : (
        <p className="sp-empty">{f.panel.noCard}</p>
      )}
      <div className="frise-panel-actions">
        <button type="button" className="ghost-button" disabled={n <= 1} onClick={() => onStep(-1)}>
          ← {f.panel.earlier}
        </button>
        <button type="button" className="ghost-button" disabled={n >= total} onClick={() => onStep(1)}>
          {f.panel.later} →
        </button>
      </div>
      <div className="frise-panel-actions">
        {card && (
          <button type="button" className="ghost-button" onClick={() => useCosmos.getState().revealCard(scene.id)}>
            {f.panel.showCanvas}
          </button>
        )}
        {target && (
          <button type="button" className="ghost-button" onClick={() => useCosmos.getState().openInManuscript(target)}>
            {fmt(f.panel.open, { view: writeView })}
          </button>
        )}
      </div>
    </aside>
  );
}

/** Icône « lire » : un livre ouvert (comme l'ancienne chronologie). */
function ReadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5V19.5" />
    </svg>
  );
}
